import { type Conexao, schema, sql } from '@leadtogo/db'
import type { ResultadoDaLinha } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import type { PapelMembro } from '../acesso/requisicao.js'
import type { ReceitaService } from '../receita/receita.service.js'

const { importacaoLinhas, importacoes, membros } = schema

/** Um job faz um bloco: até `linhas` linhas ou `duracaoMs` (o que vier primeiro) e agenda o próximo. */
export interface LimitesDoBloco {
  linhas: number
  duracaoMs: number
}
/** Empresas consultam a Receita linha a linha: blocos curtos. Os outros tipos têm o seu próprio padrão. */
export const LIMITES_DO_BLOCO: LimitesDoBloco = { linhas: 25, duracaoMs: 90_000 }

export interface DepsDoExecutor {
  banco: Conexao
  receita: Pick<ReceitaService, 'consultar'>
  log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }
  /** Dorme; os testes trocam por uma versão sem espera */
  esperar?: (ms: number) => Promise<void>
  /** O processo está encerrando (SIGTERM): para antes da próxima linha, sem perder nada */
  deveParar?: () => boolean
  /** Tamanho do bloco (os testes usam blocos pequenos); vale para todos os tipos de lote */
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

/** O que uma linha ganha ao ser resolvida. */
export interface Resultado {
  resultado: ResultadoDaLinha
  motivo?: string | null
  empresaId?: string | null
}

export type Lote = typeof importacoes.$inferSelect

export interface Importador {
  id: string
  papel: PapelMembro
  usuarioId: string
}

export interface LinhaPendente {
  id: string
  numero: number
  dados: unknown
  documento: string | null
  /** Em linha pendente, `MOTIVO_IMPORTAR_MESMO_ASSIM` quando veio de "Importar mesmo assim" */
  motivo: string | null
}

/** O que o tipo de lote devolve depois de tratar uma linha. */
export interface RetornoDaLinha {
  /** O worker está encerrando: o bloco para sem contar a linha */
  interrompida?: boolean
  /** A linha não coube neste bloco (espera programada): o próximo bloco espera tanto */
  adiarMs?: number
  /** O lote não pode continuar (por exemplo, a Receita fora do ar): encerra como `falhou` com este motivo */
  falhou?: string
}

/** Dorme em passos curtos, para um SIGTERM não esperar a espera inteira (até 60 s). */
export const dormirAte = (ms: number, deveParar?: () => boolean): Promise<void> =>
  new Promise((resolver) => {
    const fim = Date.now() + ms
    const passo = () => {
      if (Date.now() >= fim || deveParar?.()) return resolver()
      setTimeout(passo, Math.min(250, fim - Date.now()))
    }
    passo()
  })

/**
 * O envelope comum a todo tipo de lote (empresas, contatos, atividades): confere o lote e quem importa,
 * anda em blocos curtos, respeita o cancelamento e o encerramento do worker, guarda o progresso e os
 * totais e encerra. O que muda de um tipo para outro é `preparar` (validar o lote e ler o que precisa) e
 * `processarLinha`. Tudo o que importa fica no banco, então qualquer worker retoma de onde o outro parou.
 */
export abstract class ExecutorBase<Estado> {
  protected readonly esperar: (ms: number) => Promise<void>

  constructor(protected readonly deps: DepsDoExecutor) {
    this.esperar = deps.esperar ?? ((ms) => dormirAte(ms, deps.deveParar))
  }

  /** O tamanho de bloco deste tipo de lote (os testes sobrescrevem por `deps.limites`). */
  protected abstract readonly limitesPadrao: LimitesDoBloco

  /**
   * Antes da primeira linha do bloco: confere que o lote está completo e prepara o que o tipo precisa.
   * Devolve `falha` (texto para o lote) ou o estado que as linhas do bloco compartilham.
   */
  protected abstract preparar(
    tenantId: string,
    lote: Lote,
    importador: Importador,
  ): Promise<{ falha: string } | { estado: Estado }>

  protected abstract processarLinha(p: {
    tenantId: string
    lote: Lote
    linha: LinhaPendente
    importador: Importador
    estado: Estado
    /** Quanto ainda cabe neste bloco */
    restanteDoBlocoMs: () => number
  }): Promise<RetornoDaLinha>

  /** Depois do último passo do bloco (ou do lote): o tipo acerta o que depende de várias linhas. */
  protected async aoFimDoBloco(
    _tenantId: string,
    _lote: Lote,
    _estado: Estado,
    _encerrando: boolean,
  ): Promise<void> {}

  /** Texto da notificação de fim (concluída ou parou). */
  protected abstract notificacao(
    lote: Lote,
    situacao: 'concluida' | 'falhou',
    totais: Record<string, number>,
    motivo?: string,
  ): { titulo: string; mensagem: string; link: string }

  protected noTenant<T>(tenantId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
    return this.deps.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })
  }

  /** Um bloco; ver `ExecutorDaImportacao.executarBloco`. */
  async executarBloco(tenantId: string, lote: Lote): Promise<ResultadoDoBloco> {
    const inicio = Date.now()
    const limites = this.deps.limites ?? this.limitesPadrao
    const fim = (desfecho: DesfechoDaExecucao, proximoEmMs = 0): ResultadoDoBloco => ({
      desfecho,
      proximoEmMs,
    })

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
    const quem: Importador = {
      id: importador.id,
      papel: importador.papel,
      usuarioId: importador.usuarioId ?? '',
    }

    const preparado = await this.preparar(tenantId, lote, quem)
    if ('falha' in preparado) {
      await this.encerrar(tenantId, lote, 'falhou', preparado.falha)
      return fim('falhou')
    }
    const estado = preparado.estado

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
        await this.aoFimDoBloco(tenantId, lote, estado, true)
        await this.gravarTotais(tenantId, lote.id)
        return fim('cancelada')
      }
      if (this.deps.deveParar?.()) {
        await this.aoFimDoBloco(tenantId, lote, estado, false)
        await this.gravarTotais(tenantId, lote.id)
        return fim('interrompida')
      }
      const linha = await this.proximaLinha(tenantId, lote.id)
      if (!linha) break
      // Todo bloco processa ao menos uma linha (senão, com a máquina carregada, só reagendaria o seguinte)
      if (feitas > 0 && (feitas >= limites.linhas || Date.now() - inicio >= limites.duracaoMs)) {
        await this.aoFimDoBloco(tenantId, lote, estado, false)
        await this.gravarTotais(tenantId, lote.id)
        return fim('continua')
      }

      const r = await this.processarLinha({
        tenantId,
        lote,
        linha,
        importador: quem,
        estado,
        restanteDoBlocoMs: () => limites.duracaoMs - (Date.now() - inicio),
      })
      if (r.interrompida) {
        await this.aoFimDoBloco(tenantId, lote, estado, false)
        await this.gravarTotais(tenantId, lote.id)
        return fim('interrompida')
      }
      if (r.adiarMs !== undefined) {
        // a Receita ainda está em espera programada e não cabe neste bloco: o próximo bloco espera
        await this.aoFimDoBloco(tenantId, lote, estado, false)
        await this.gravarTotais(tenantId, lote.id)
        return fim('continua', r.adiarMs)
      }
      feitas++
      await this.registrarProgresso(tenantId, lote.id)
      if (r.falhou !== undefined) {
        await this.aoFimDoBloco(tenantId, lote, estado, true)
        await this.encerrar(tenantId, lote, 'falhou', r.falhou)
        return fim('falhou')
      }
    }
    await this.aoFimDoBloco(tenantId, lote, estado, true)
    await this.encerrar(tenantId, lote, 'concluida')
    return fim('concluida')
  }

  /** Marca que o lote andou: é o que a varredura olha para saber se está parado. */
  protected registrarProgresso(tenantId: string, loteId: string) {
    return this.noTenant(tenantId, (tx) =>
      tx
        .update(importacoes)
        .set({ ultimoProgressoEm: new Date() })
        .where(sql`${importacoes.id} = ${loteId}`),
    )
  }

  protected proximaLinha(tenantId: string, loteId: string): Promise<LinhaPendente | undefined> {
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

  /** Grava o resultado só se a linha ainda estiver pendente; `false` quando outro executor chegou antes. */
  protected gravar(tenantId: string, linhaId: string, r: Resultado): Promise<boolean> {
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
  protected async travarPendente(tx: Transacao, linhaId: string): Promise<boolean> {
    const r = await tx.execute<{ id: string }>(sql`
      SELECT id FROM importacao_linhas WHERE id = ${linhaId} AND resultado = 'pendente'
      FOR UPDATE SKIP LOCKED`)
    return r.length > 0
  }

  protected gravarEm(tx: Transacao, linhaId: string, r: Resultado) {
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
  protected async gravarTotais(tenantId: string, loteId: string): Promise<Record<string, number>> {
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

  protected async encerrar(
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
        const n = this.notificacao(lote, situacao, totais, motivo)
        await tx.execute(sql`
          INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo, mensagem, link)
          VALUES (${lote.id}, ${tenantId}, ${lote.criadoPor}, 'importacao.fim',
                  ${n.titulo}, ${n.mensagem}, ${n.link})
          ON CONFLICT (id) DO UPDATE SET titulo = EXCLUDED.titulo, mensagem = EXCLUDED.mensagem, lida_em = NULL`)
      }
    })
    this.deps.log.info({ importacaoId: lote.id, situacao, totais }, 'importação encerrada')
  }
}
