import { type Conexao, schema, sql } from '@leadtogo/db'
import {
  CHAVE_DA_TAG_FORA_DO_PERFIL,
  CHAVE_DO_GRUPO_DE_IMPORTACAO,
  criarEmpresaCarteiraSchema,
  decidirPelaReceita,
  documentoDaPlanilha,
  MOTIVO_IMPORTAR_MESMO_ASSIM,
  type RegrasDeImportacao,
  type ResultadoDaLinha,
} from '@leadtogo/shared'

import { ContextoTenantService, type Transacao } from '../acesso/contexto-tenant.service.js'
import type { PapelMembro } from '../acesso/requisicao.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { EmpresasDaCarteiraService } from '../carteira/empresas.service.js'
import { ErroApi } from '../http/erro-api.js'
import type { ConsultaDeCnpj, ReceitaService } from '../receita/receita.service.js'
import { type LinhaMapeada, montarEmpresa } from './montar-empresa.js'

const { importacaoLinhas, importacoes, membros, tagGrupos, tags } = schema

/** Esperas (ms) antes de tentar de novo quando a Receita está fora do ar. Esgotadas, a linha vira erro. */
export const ESPERAS_DA_RECEITA_MS = [10_000, 30_000, 60_000]
/** Linhas seguidas com a Receita fora do ar: a importação para (falhou) e pode ser retomada. */
export const LIMITE_DE_FALHAS_SEGUIDAS = 3
/** Texto do motivo das linhas que falharam por a Receita estar fora do ar (conta as "seguidas" entre blocos). */
const MOTIVO_SEM_RECEITA = 'A Receita estava fora do ar'

/** Um job faz um bloco: até 25 linhas ou 90 s (o que vier primeiro) e agenda o próximo. */
export interface LimitesDoBloco {
  linhas: number
  duracaoMs: number
}
export const LIMITES_DO_BLOCO: LimitesDoBloco = { linhas: 25, duracaoMs: 90_000 }

export interface DepsDoExecutor {
  banco: Conexao
  receita: Pick<ReceitaService, 'consultar'>
  log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }
  /** Dorme; os testes trocam por uma versão sem espera */
  esperar?: (ms: number) => Promise<void>
  /** O processo está encerrando (SIGTERM): para antes da próxima linha, sem perder nada */
  deveParar?: () => boolean
  /** Tamanho do bloco (os testes usam blocos pequenos) */
  limites?: LimitesDoBloco
}

/**
 * `continua`: o bloco acabou e ainda há linhas (o próximo bloco é agendado); `interrompida`: o worker
 * está encerrando, o lote segue em andamento e o próximo bloco retoma das pendentes.
 */
export type DesfechoDaExecucao =
  'concluida' | 'cancelada' | 'falhou' | 'ignorada' | 'interrompida' | 'continua'

export interface ResultadoDoBloco {
  desfecho: DesfechoDaExecucao
  /** Quanto esperar antes do próximo bloco (a Receita ainda está em espera programada) */
  proximoEmMs: number
}

interface Resultado {
  resultado: ResultadoDaLinha
  motivo?: string | null
  empresaId?: string | null
}

type Lote = typeof importacoes.$inferSelect

/** Dorme em passos curtos, para um SIGTERM não esperar a espera inteira (até 60 s). */
const dormirAte = (ms: number, deveParar?: () => boolean): Promise<void> =>
  new Promise((resolver) => {
    const fim = Date.now() + ms
    const passo = () => {
      if (Date.now() >= fim || deveParar?.()) return resolver()
      setTimeout(passo, Math.min(250, fim - Date.now()))
    }
    passo()
  })

/**
 * Executa um lote de importação de empresas, uma linha por vez:
 *  - lê o CNPJ, pula o que não vale (sem CNPJ válido, repetido na planilha, já na carteira);
 *  - consulta a Receita quando precisa (regras do perfil, bloqueio de empresa não ativa ou dados da
 *    Receita), com o intervalo escolhido entre consultas de verdade (o cache de 30 dias não espera);
 *  - decide pelo perfil (o bloqueio de empresa não ativa vence o perfil) e cadastra pelo mesmo
 *    serviço da tela de cadastro, com o lote registrado na empresa (para filtrar e desfazer).
 * Cada linha é uma transação: a empresa e o resultado da linha gravam juntos ou nenhum dos dois.
 * É retomável: só mexe em linhas pendentes. Cancelar é mudar a situação do lote.
 */
export class ExecutorDaImportacao {
  private readonly esperar: (ms: number) => Promise<void>

  constructor(private readonly deps: DepsDoExecutor) {
    this.esperar = deps.esperar ?? ((ms) => dormirAte(ms, deps.deveParar))
  }

  private noTenant<T>(tenantId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
    return this.deps.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })
  }

  /**
   * O lote inteiro, bloco após bloco, num só processo (sem fila). Os testes e a reexecução manual usam;
   * em produção quem encadeia os blocos é o worker, um job por bloco.
   */
  async executar(tenantId: string, importacaoId: string): Promise<DesfechoDaExecucao> {
    for (;;) {
      const r = await this.executarBloco(tenantId, importacaoId)
      if (r.desfecho !== 'continua') return r.desfecho
      if (r.proximoEmMs > 0) await this.esperar(r.proximoEmMs)
    }
  }

  /**
   * Um bloco: até `limites.linhas` linhas ou `limites.duracaoMs`, o que vier primeiro. Devolve
   * `continua` quando ainda há linhas pendentes. Tudo o que importa fica no banco (linhas, totais,
   * `proxima_consulta_em`, `ultimo_progresso_em`), então qualquer worker retoma de onde o outro parou.
   */
  async executarBloco(tenantId: string, importacaoId: string): Promise<ResultadoDoBloco> {
    const inicio = Date.now()
    const limites = this.deps.limites ?? LIMITES_DO_BLOCO
    const fim = (desfecho: DesfechoDaExecucao, proximoEmMs = 0): ResultadoDoBloco => ({
      desfecho,
      proximoEmMs,
    })
    const lote = await this.noTenant(tenantId, async (tx) => {
      const [l] = await tx
        .select()
        .from(importacoes)
        .where(sql`${importacoes.id} = ${importacaoId}`)
      return l
    })
    if (!lote || lote.situacao !== 'em_andamento') return fim('ignorada')

    const importador = await this.noTenant(tenantId, async (tx) => {
      const [m] = await tx
        .select({
          id: membros.id,
          papel: membros.papel,
          usuarioId: membros.usuarioId,
          ativo: membros.ativo,
        })
        .from(membros)
        .where(sql`${membros.id} = ${lote.criadoPor}`)
      return m
    })
    if (!importador?.ativo || (importador.papel !== 'admin' && importador.papel !== 'gestor')) {
      await this.encerrar(
        tenantId,
        lote,
        'falhou',
        'Quem iniciou a importação não pode mais importar.',
      )
      return fim('falhou')
    }

    const config = await this.noTenant(tenantId, async (tx) => {
      const r = await tx.execute<{ bloquear: boolean }>(
        sql`SELECT bloquear_empresa_nao_ativa AS bloquear FROM tenant_configuracoes WHERE tenant_id = ${tenantId}`,
      )
      return { bloquearNaoAtiva: r[0]?.bloquear ?? true }
    })
    const regras = lote.regras as RegrasDeImportacao | null
    const consultaAReceita =
      config.bloquearNaoAtiva || lote.perfilId !== null || lote.fonteDados !== 'planilha'
    const campos = (lote.mapeamento as { campos?: Record<string, string> }).campos ?? {}
    const colunaDoCnpj = campos['documento']
    if (!colunaDoCnpj || !lote.vendedorId || !lote.statusTagId) {
      await this.encerrar(
        tenantId,
        lote,
        'falhou',
        'O lote não está completo (CNPJ, vendedor e Status).',
      )
      return fim('falhou')
    }

    await this.prepararLinhas(tenantId, lote.id, colunaDoCnpj)

    let seguidasSemReceita = await this.seguidasSemReceitaNoBanco(tenantId, lote.id)
    let feitas = 0
    for (;;) {
      const atual = await this.noTenant(tenantId, async (tx) => {
        const [l] = await tx
          .select({ situacao: importacoes.situacao })
          .from(importacoes)
          .where(sql`${importacoes.id} = ${lote.id}`)
        return l
      })
      if (atual?.situacao !== 'em_andamento') {
        // Cancelada pela pessoa: guarda os totais e avisa. Qualquer outra situação (por exemplo, o outro executor
        // acabou de concluir o lote): não há mais nada a fazer aqui, e não foi um cancelamento
        if (atual?.situacao !== 'cancelada') return fim('ignorada')
        await this.gravarTotais(tenantId, lote.id)
        return fim('cancelada')
      }
      if (this.deps.deveParar?.()) {
        await this.gravarTotais(tenantId, lote.id)
        return fim('interrompida')
      }
      const linha = await this.proximaLinha(tenantId, lote.id)
      if (!linha) break
      // Todo bloco processa ao menos uma linha (senão, com a máquina carregada, só reagendaria o seguinte)
      if (feitas > 0 && (feitas >= limites.linhas || Date.now() - inicio >= limites.duracaoMs)) {
        await this.gravarTotais(tenantId, lote.id)
        return fim('continua')
      }

      const r = await this.processarLinha({
        tenantId,
        lote,
        linha,
        regras,
        consultaAReceita,
        bloquearNaoAtiva: config.bloquearNaoAtiva,
        campos,
        importador: {
          id: importador.id,
          papel: importador.papel,
          usuarioId: importador.usuarioId ?? '',
        },
        restanteDoBlocoMs: () => limites.duracaoMs - (Date.now() - inicio),
      })
      if (r.interrompida) {
        await this.gravarTotais(tenantId, lote.id)
        return fim('interrompida')
      }
      if (r.adiarMs !== undefined) {
        // a Receita ainda está em espera programada e não cabe neste bloco: o próximo bloco espera
        await this.gravarTotais(tenantId, lote.id)
        return fim('continua', r.adiarMs)
      }
      feitas++
      await this.registrarProgresso(tenantId, lote.id)
      seguidasSemReceita = r.semReceita ? seguidasSemReceita + 1 : 0
      if (seguidasSemReceita >= LIMITE_DE_FALHAS_SEGUIDAS) {
        await this.encerrar(
          tenantId,
          lote,
          'falhou',
          'A Receita está fora do ar. A importação parou; retome mais tarde (as linhas já feitas ficam).',
        )
        return fim('falhou')
      }
    }
    await this.encerrar(tenantId, lote, 'concluida')
    return fim('concluida')
  }

  /** Quantas das últimas linhas feitas, em sequência, falharam por a Receita estar fora do ar. */
  private async seguidasSemReceitaNoBanco(tenantId: string, loteId: string): Promise<number> {
    const ultimas = await this.noTenant(tenantId, (tx) =>
      tx.execute<{ motivo: string | null }>(sql`
        SELECT motivo FROM importacao_linhas
        WHERE importacao_id = ${loteId} AND resultado <> 'pendente' AND processada_em IS NOT NULL
        ORDER BY processada_em DESC, numero DESC LIMIT ${LIMITE_DE_FALHAS_SEGUIDAS}`),
    )
    let n = 0
    for (const u of ultimas) {
      if (!u.motivo?.startsWith(MOTIVO_SEM_RECEITA)) break
      n++
    }
    return n
  }

  /** Marca que o lote andou: é o que a varredura olha para saber se está parado. */
  private registrarProgresso(tenantId: string, loteId: string) {
    return this.noTenant(tenantId, (tx) =>
      tx
        .update(importacoes)
        .set({ ultimoProgressoEm: new Date() })
        .where(sql`${importacoes.id} = ${loteId}`),
    )
  }

  /** Lê o CNPJ de cada linha pendente, e marca as sem CNPJ válido e as repetidas na planilha. */
  private async prepararLinhas(
    tenantId: string,
    loteId: string,
    colunaDoCnpj: string,
  ): Promise<void> {
    // Depois da primeira vez toda linha pendente já tem CNPJ: os blocos seguintes pulam a leitura inteira
    const [faltaLer] = await this.noTenant(tenantId, (tx) =>
      tx.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM importacao_linhas
        WHERE importacao_id = ${loteId} AND resultado = 'pendente' AND documento IS NULL`),
    )
    if (!faltaLer?.n) return
    const linhas = await this.noTenant(tenantId, (tx) =>
      tx
        .select({
          id: importacaoLinhas.id,
          numero: importacaoLinhas.numero,
          dados: importacaoLinhas.dados,
          resultado: importacaoLinhas.resultado,
          documento: importacaoLinhas.documento,
        })
        .from(importacaoLinhas)
        .where(sql`${importacaoLinhas.importacaoId} = ${loteId}`)
        .orderBy(importacaoLinhas.numero),
    )
    const primeira = new Map<string, number>()
    const ajustes: {
      id: string
      documento: string | null
      resultado?: ResultadoDaLinha
      motivo?: string
    }[] = []
    for (const l of linhas) {
      const bruto = (l.dados as Record<string, string>)[colunaDoCnpj] ?? ''
      const documento = documentoDaPlanilha(bruto)
      if (documento && !primeira.has(documento)) primeira.set(documento, l.numero)
      if (l.resultado !== 'pendente') continue
      if (!documento) {
        ajustes.push({
          id: l.id,
          documento: null,
          resultado: 'pulada_sem_cnpj',
          motivo:
            bruto.trim() === ''
              ? 'CNPJ em branco.'
              : `CNPJ inválido: ${bruto.trim().slice(0, 40)}.`,
        })
      } else if (primeira.get(documento) !== l.numero) {
        ajustes.push({
          id: l.id,
          documento,
          resultado: 'pulada_duplicada',
          motivo: `CNPJ repetido na planilha: já está na linha ${primeira.get(documento)}.`,
        })
      } else if (l.documento !== documento) {
        ajustes.push({ id: l.id, documento })
      }
    }
    for (let i = 0; i < ajustes.length; i += 500) {
      await this.noTenant(tenantId, async (tx) => {
        for (const a of ajustes.slice(i, i + 500)) {
          await tx
            .update(importacaoLinhas)
            .set({
              documento: a.documento,
              ...(a.resultado
                ? { resultado: a.resultado, motivo: a.motivo ?? null, processadaEm: new Date() }
                : {}),
            })
            .where(
              sql`${importacaoLinhas.id} = ${a.id} AND ${importacaoLinhas.resultado} = 'pendente'`,
            )
        }
      })
    }
  }

  private proximaLinha(tenantId: string, loteId: string) {
    return this.noTenant(tenantId, async (tx) => {
      const [l] = await tx
        .select({
          id: importacaoLinhas.id,
          numero: importacaoLinhas.numero,
          dados: importacaoLinhas.dados,
          documento: importacaoLinhas.documento,
          motivo: importacaoLinhas.motivo,
        })
        .from(importacaoLinhas)
        .where(
          sql`${importacaoLinhas.importacaoId} = ${loteId} AND ${importacaoLinhas.resultado} = 'pendente'`,
        )
        .orderBy(importacaoLinhas.numero)
        .limit(1)
      return l
    })
  }

  private async processarLinha(p: {
    tenantId: string
    lote: Lote
    linha: {
      id: string
      numero: number
      dados: unknown
      documento: string | null
      /** Em linha pendente, `MOTIVO_IMPORTAR_MESMO_ASSIM` quando veio de "Importar mesmo assim" */
      motivo: string | null
    }
    regras: RegrasDeImportacao | null
    consultaAReceita: boolean
    bloquearNaoAtiva: boolean
    campos: Record<string, string>
    importador: { id: string; papel: PapelMembro; usuarioId: string }
    /** Quanto ainda cabe neste bloco */
    restanteDoBlocoMs: () => number
  }): Promise<{ semReceita: boolean; interrompida?: boolean; adiarMs?: number }> {
    const { tenantId, lote, linha } = p
    const documento = linha.documento as string

    // Já está na carteira: pula, sem alterar a empresa. Se foi ESTE lote que a criou (a linha ficou
    // pendente porque o resultado não chegou a gravar), a linha vale como criada, não como repetida.
    const existente = await this.noTenant(tenantId, async (tx) => {
      const r = await tx.execute<{ id: string; importacao_id: string | null }>(
        sql`SELECT id, importacao_id FROM empresas WHERE documento = ${documento} AND excluido_em IS NULL LIMIT 1`,
      )
      return r[0]
    })
    if (existente) {
      await this.gravar(
        tenantId,
        linha.id,
        existente.importacao_id === lote.id
          ? { resultado: 'criada', empresaId: existente.id }
          : {
              resultado: 'pulada_duplicada',
              motivo: 'CNPJ já está na carteira; a empresa não foi alterada.',
              empresaId: existente.id,
            },
      )
      return { semReceita: false }
    }

    if (p.consultaAReceita) {
      // Outro bloco ou worker consultou há pouco: espera o que falta do intervalo (fora do bloco, se não couber)
      const espera = await this.esperaProgramada(tenantId, lote.id)
      if (espera > 0) {
        if (espera > p.restanteDoBlocoMs()) return { semReceita: false, adiarMs: espera }
        await this.esperar(espera)
        if (this.deps.deveParar?.()) return { semReceita: false, interrompida: true }
      }
      const c = await this.consultar(tenantId, lote.id, documento, lote.intervaloMs)
      if ('interrompida' in c) return { semReceita: false, interrompida: true }
      if ('resultado' in c) {
        await this.gravar(tenantId, linha.id, c.resultado)
        return { semReceita: c.semReceita }
      }
      const consulta = c.consulta
      const decisao = decidirPelaReceita(consulta.dados, p.regras, p.bloquearNaoAtiva)
      if (decisao.tipo === 'nao_ativa') {
        await this.gravar(tenantId, linha.id, {
          resultado: 'pulada_nao_ativa',
          motivo: decisao.motivo,
        })
        return { semReceita: false }
      }
      if (decisao.tipo === 'fora_do_perfil' && linha.motivo === MOTIVO_IMPORTAR_MESMO_ASSIM) {
        // "Importar mesmo assim": entra com a tag "Fora do perfil" (o bloqueio de não ativa já valeu acima)
        return this.cadastrar(p, consulta, decisao.motivos)
      }
      if (decisao.tipo === 'fora_do_perfil') {
        await this.gravar(tenantId, linha.id, {
          resultado: 'fora_do_perfil',
          motivo: `Fora do perfil: ${decisao.motivos.join('; ')}.`,
        })
        return { semReceita: false }
      }
      return this.cadastrar(
        p,
        consulta,
        decisao.tipo === 'importar_fora_do_perfil' ? decisao.motivos : null,
      )
    }
    return this.cadastrar(p, null, null)
  }

  /** Consulta a Receita com espera entre consultas de verdade e novas tentativas quando está fora do ar. */
  private async consultar(
    tenantId: string,
    loteId: string,
    documento: string,
    intervaloMs: number,
  ): Promise<
    | { consulta: ConsultaDeCnpj }
    | { resultado: Resultado; semReceita: boolean }
    | { interrompida: true }
  > {
    for (let tentativa = 0; ; tentativa++) {
      try {
        const consulta = await this.deps.receita.consultar(documento)
        // Só consulta de verdade (fora do cache) obriga a esperar antes da próxima
        if (!consulta.doCache) await this.aguardar(tenantId, loteId, intervaloMs)
        return { consulta }
      } catch (erro) {
        if (!(erro instanceof ErroApi)) throw erro
        if (erro.codigo === 'cnpj_nao_encontrado') {
          return {
            resultado: { resultado: 'erro', motivo: 'A Receita não tem este CNPJ.' },
            semReceita: false,
          }
        }
        if (erro.codigo !== 'receita_indisponivel') {
          return { resultado: { resultado: 'erro', motivo: erro.message }, semReceita: false }
        }
        const espera = ESPERAS_DA_RECEITA_MS[tentativa]
        if (espera === undefined) {
          return {
            resultado: {
              resultado: 'erro',
              motivo: `A Receita estava fora do ar (tentamos ${tentativa + 1} vezes).`,
            },
            semReceita: true,
          }
        }
        this.deps.log.warn(
          { tentativa: tentativa + 1 },
          'Receita fora do ar na importação; nova tentativa',
        )
        await this.aguardar(tenantId, loteId, espera)
        if (this.deps.deveParar?.()) return { interrompida: true }
      }
    }
  }

  /** Último `proxima_consulta_em` que ESTE executor gravou (já esperado por ele; só o de outro conta). */
  private minhaEspera = 0

  /**
   * Espera de propósito (intervalo entre consultas ou Receita fora do ar): grava até quando ANTES de
   * dormir, para a varredura não tomar o lote por parado e para outro worker respeitar o intervalo.
   */
  private async aguardar(tenantId: string, loteId: string, ms: number): Promise<void> {
    const ate = new Date(Date.now() + ms)
    this.minhaEspera = ate.getTime()
    await this.noTenant(tenantId, (tx) =>
      tx
        .update(importacoes)
        .set({ proximaConsultaEm: ate })
        .where(sql`${importacoes.id} = ${loteId}`),
    )
    await this.esperar(ms)
  }

  /** Quanto falta de uma espera programada por OUTRO executor (0 se nenhuma). */
  private async esperaProgramada(tenantId: string, loteId: string): Promise<number> {
    const [l] = await this.noTenant(tenantId, (tx) =>
      tx
        .select({ ate: importacoes.proximaConsultaEm })
        .from(importacoes)
        .where(sql`${importacoes.id} = ${loteId}`),
    )
    const ate = l?.ate?.getTime() ?? 0
    return ate > Math.max(Date.now(), this.minhaEspera) ? ate - Date.now() : 0
  }

  private async cadastrar(
    p: Parameters<ExecutorDaImportacao['processarLinha']>[0],
    consulta: ConsultaDeCnpj | null,
    motivosForaDoPerfil: string[] | null,
  ): Promise<{ semReceita: boolean }> {
    const { tenantId, lote, linha, campos } = p
    const documento = linha.documento as string
    const dadosDaLinha = linha.dados as Record<string, string>
    const planilha: LinhaMapeada = {}
    for (const [campo, coluna] of Object.entries(campos)) {
      if (campo !== 'documento')
        (planilha as Record<string, string>)[campo] = dadosDaLinha[coluna] ?? ''
    }

    try {
      const resultado = await this.noTenant(tenantId, async (tx) => {
        // A transação é curta (a Receita já foi consultada, fora dela): trava a linha e confere que
        // ainda está pendente. Outro executor que a pegou antes deixa esta sem fazer nada.
        if (!(await this.travarPendente(tx, linha.id))) return null
        const municipioDaPlanilha = await this.municipioDaPlanilha(tx, planilha)
        const montada = montarEmpresa({
          fonte: lote.fonteDados,
          documento,
          planilha,
          receita: consulta?.dados ?? null,
          municipioDaPlanilha,
          vendedorId: lote.vendedorId as string,
          verticalId: lote.verticalId,
          statusTagId: lote.statusTagId as string,
        })
        if (!montada.ok) return { resultado: 'erro', motivo: montada.motivo } satisfies Resultado
        const dados = criarEmpresaCarteiraSchema.parse(montada.dados)

        const ctx = new ContextoTenantService()
        const servico = new EmpresasDaCarteiraService(
          ctx,
          new AuditoriaService(ctx),
          this.deps.receita as ReceitaService,
        )
        const tagForaDoPerfil = motivosForaDoPerfil
          ? await this.tagForaDoPerfil(tx, tenantId, p.importador.id)
          : null
        const criada = await ctx.executar(
          {
            usuarioId: p.importador.usuarioId,
            tx,
            tenantId,
            membro: { id: p.importador.id, papel: p.importador.papel },
          },
          () =>
            servico.criar(dados, {
              importacaoId: lote.id,
              origemCadastro: 'importacao',
              consulta: consulta ?? 'nenhuma',
              ...(tagForaDoPerfil ? { tagsExtras: [tagForaDoPerfil] } : {}),
            }),
        )
        const r: Resultado = motivosForaDoPerfil
          ? {
              resultado: 'criada_fora_do_perfil',
              motivo: `Importada com a tag "Fora do perfil": ${motivosForaDoPerfil.join('; ')}.`,
              empresaId: criada.id,
            }
          : { resultado: 'criada', empresaId: criada.id }
        // Junto da empresa, na mesma transação: ou as duas coisas gravam, ou nenhuma
        await this.gravarEm(tx, linha.id, r)
        return r
      })
      if (resultado?.resultado === 'erro') await this.gravar(tenantId, linha.id, resultado)
    } catch (erro) {
      await this.gravar(tenantId, linha.id, await this.resultadoDoCadastro(erro, tenantId, p))
    }
    return { semReceita: false }
  }

  /**
   * Erro ao cadastrar. Documento repetido que é de ESTE lote (empresa criada por um bloco que caiu
   * antes de gravar o resultado) vale como `criada`; qualquer outro repetido, como `pulada_duplicada`.
   */
  private async resultadoDoCadastro(
    erro: unknown,
    tenantId: string,
    p: { lote: Lote; linha: { documento: string | null } },
  ): Promise<Resultado> {
    if (erro instanceof ErroApi && erro.codigo === 'empresa_ja_cadastrada') {
      const [propria] = await this.noTenant(tenantId, (tx) =>
        tx.execute<{ id: string }>(sql`
          SELECT id FROM empresas
          WHERE documento = ${p.linha.documento} AND importacao_id = ${p.lote.id} AND excluido_em IS NULL
          LIMIT 1`),
      )
      if (propria) return { resultado: 'criada', empresaId: propria.id }
    }
    return this.resultadoDoErro(erro)
  }

  private resultadoDoErro(erro: unknown): Resultado {
    if (erro instanceof ErroApi) {
      if (erro.codigo === 'empresa_ja_cadastrada') {
        return { resultado: 'pulada_duplicada', motivo: 'CNPJ já está na carteira.' }
      }
      if (erro.codigo === 'empresa_nao_ativa') {
        return { resultado: 'pulada_nao_ativa', motivo: erro.message }
      }
      return { resultado: 'erro', motivo: erro.message }
    }
    this.deps.log.warn(
      { erro: erro instanceof Error ? erro.message : String(erro) },
      'erro numa linha da importação',
    )
    const texto =
      erro instanceof Error && erro.name === 'ZodError'
        ? 'Dados da linha inválidos.'
        : 'Erro inesperado ao cadastrar a empresa.'
    return { resultado: 'erro', motivo: texto }
  }

  /** O município pelo nome e UF da planilha (sem acento nem diferença de caixa); sem achar, fica sem. */
  private async municipioDaPlanilha(tx: Transacao, planilha: LinhaMapeada): Promise<number | null> {
    const nome = planilha.municipio?.trim()
    const uf = planilha.uf?.trim().toUpperCase()
    if (!nome || !uf || uf.length !== 2) return null
    const r = await tx.execute<{ codigo_ibge: number }>(sql`
      SELECT codigo_ibge FROM municipios
      WHERE uf = ${uf} AND lower(f_unaccent(nome)) = lower(f_unaccent(${nome})) LIMIT 1`)
    return r[0]?.codigo_ibge ?? null
  }

  /** A tag "Fora do perfil", criada na primeira vez que a empresa precisa dela (grupo de sistema "Importação"). */
  private async tagForaDoPerfil(
    tx: Transacao,
    tenantId: string,
    membroId: string,
  ): Promise<string> {
    const [tag] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(
        sql`${tags.chaveSistema} = ${CHAVE_DA_TAG_FORA_DO_PERFIL} AND ${tags.excluidoEm} IS NULL`,
      )
    if (tag) return tag.id
    let [grupo] = await tx
      .select({ id: tagGrupos.id })
      .from(tagGrupos)
      .where(
        sql`${tagGrupos.chaveSistema} = ${CHAVE_DO_GRUPO_DE_IMPORTACAO} AND ${tagGrupos.excluidoEm} IS NULL`,
      )
    if (!grupo) {
      const maior = await tx.execute<{ proxima: number }>(
        sql`SELECT coalesce(max(ordem), -1) + 1 AS proxima FROM tag_grupos WHERE excluido_em IS NULL`,
      )
      ;[grupo] = await tx
        .insert(tagGrupos)
        .values({
          tenantId,
          nome: 'Importação',
          selecao: 'multipla',
          obrigatorio: false,
          sistema: true,
          automatico: false,
          chaveSistema: CHAVE_DO_GRUPO_DE_IMPORTACAO,
          ordem: maior[0]?.proxima ?? 0,
          criadoPor: membroId,
          atualizadoPor: membroId,
        })
        .returning({ id: tagGrupos.id })
    }
    const [criada] = await tx
      .insert(tags)
      .values({
        tenantId,
        tagGrupoId: (grupo as { id: string }).id,
        nome: 'Fora do perfil',
        cor: 'amber',
        chaveSistema: CHAVE_DA_TAG_FORA_DO_PERFIL,
        criadoPor: membroId,
        atualizadoPor: membroId,
      })
      .returning({ id: tags.id })
    return (criada as { id: string }).id
  }

  /** Grava o resultado só se a linha ainda estiver pendente; `false` quando outro executor chegou antes. */
  private gravar(tenantId: string, linhaId: string, r: Resultado): Promise<boolean> {
    return this.noTenant(tenantId, async (tx) => {
      if (!(await this.travarPendente(tx, linhaId))) return false
      await this.gravarEm(tx, linhaId, r)
      return true
    })
  }

  /**
   * Trava a linha para esta transação (`FOR UPDATE SKIP LOCKED`) e diz se ela ainda está pendente.
   * Quem não consegue a trava, ou encontra a linha já resolvida, não grava nada.
   */
  private async travarPendente(tx: Transacao, linhaId: string): Promise<boolean> {
    const r = await tx.execute<{ id: string }>(sql`
      SELECT id FROM importacao_linhas WHERE id = ${linhaId} AND resultado = 'pendente'
      FOR UPDATE SKIP LOCKED`)
    return r.length > 0
  }

  private gravarEm(tx: Transacao, linhaId: string, r: Resultado) {
    return tx
      .update(importacaoLinhas)
      .set({
        resultado: r.resultado,
        motivo: r.motivo ?? null,
        empresaId: r.empresaId ?? null,
        processadaEm: new Date(),
      })
      .where(sql`${importacaoLinhas.id} = ${linhaId}`)
  }

  /** Conta as linhas por resultado e guarda em `importacoes.totais`. */
  private async gravarTotais(tenantId: string, loteId: string): Promise<Record<string, number>> {
    return this.noTenant(tenantId, async (tx) => {
      const linhas = await tx.execute<{ resultado: string; n: number }>(sql`
        SELECT resultado::text AS resultado, count(*)::int AS n
        FROM importacao_linhas WHERE importacao_id = ${loteId} GROUP BY resultado`)
      const totais = Object.fromEntries(linhas.map((l) => [l.resultado, l.n]))
      await tx
        .update(importacoes)
        .set({ totais })
        .where(sql`${importacoes.id} = ${loteId}`)
      return totais
    })
  }

  private async encerrar(
    tenantId: string,
    lote: Lote,
    situacao: 'concluida' | 'falhou',
    motivo?: string,
  ): Promise<void> {
    const totais = await this.gravarTotais(tenantId, lote.id)
    await this.noTenant(tenantId, async (tx) => {
      // Só quem encerra de fato avisa: dois executores chegando ao fim juntos não duplicam nada
      const mudou = await tx
        .update(importacoes)
        .set({
          situacao,
          concluidoEm: new Date(),
          totais: motivo ? { ...totais, motivo } : totais,
        })
        .where(sql`${importacoes.id} = ${lote.id} AND ${importacoes.situacao} = 'em_andamento'`)
        .returning({ id: importacoes.id })
      if (mudou.length > 0 && lote.criadoPor) {
        const criadas = (totais['criada'] ?? 0) + (totais['criada_fora_do_perfil'] ?? 0)
        await tx.execute(sql`
          INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo, mensagem, link)
          VALUES (${lote.id}, ${tenantId}, ${lote.criadoPor}, 'importacao.fim',
                  ${situacao === 'concluida' ? `Importação "${lote.nome}" concluída` : `Importação "${lote.nome}" parou`},
                  ${situacao === 'concluida' ? `${criadas} empresas importadas.` : (motivo ?? 'A importação parou.')},
                  ${`/empresas/importar/${lote.id}`})
          ON CONFLICT (id) DO UPDATE SET titulo = EXCLUDED.titulo, mensagem = EXCLUDED.mensagem, lida_em = NULL`)
      }
    })
    this.deps.log.info({ importacaoId: lote.id, situacao, totais }, 'importação encerrada')
  }
}
