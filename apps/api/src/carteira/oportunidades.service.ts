import { and, asc, eq, isNull, schema, sql } from '@leadtogo/db'
import {
  type AlterarOportunidade,
  type CriarOportunidade,
  diaNoFuso,
  type FecharOportunidade,
  MESES_PADRAO,
  type Oportunidade,
  type OportunidadeDetalhada,
  ROTULO_DO_STATUS,
  type ResultadoDoMovimento,
  type StatusDaOportunidade,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService, type Transacao } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { diferencas } from '../cadastros/cadastros.base.js'
import { ErroApi } from '../http/erro-api.js'
import { lerOportunidade as lerOportunidadePublica } from '../integracoes/publica/leitura.js'
import { emitirEvento } from '../integracoes/webhooks/eventos.js'
import { recalcularCarteira } from './atividades-efeitos.js'
import { fusoDaEmpresa } from './atividades-leitura.js'
import {
  condicaoDeEdicaoDaOportunidade,
  condicaoDeVisibilidadeDaOportunidade,
  lerOportunidade,
} from './oportunidades-leitura.js'
import { recalcularOportunidade } from './oportunidades-efeitos.js'
import {
  cancelarRetomada,
  inserirOportunidade,
  type LinhaDeOportunidade,
  registrarFechamento,
} from './oportunidades-gravacao.js'
import {
  alcanca,
  type EscopoDaCarteira,
  escopoDaCarteira,
  podeEditar,
  podeVer,
} from './regras-de-carteira.js'

const {
  empresaContatos,
  contatos,
  empresas,
  funilFases,
  funis,
  membros,
  motivos,
  oportunidadeHistorico,
  oportunidades,
  origens,
  solucoes,
} = schema

const naoEncontrada = () =>
  new ErroApi('oportunidade_nao_encontrada', 'Oportunidade não encontrada.', 404)
const negado = (mensagem: string) => new ErroApi('acesso_negado', mensagem, 403)
const invalido = (campo: string, codigo: string, mensagem: string) =>
  new ErroApi(codigo, mensagem, 400, [{ campo, mensagem }])
const naoAtiva = () =>
  new ErroApi(
    'oportunidade_nao_ativa',
    'Só uma oportunidade ativa muda de fase ou se fecha. Reabra antes.',
    409,
  )

/**
 * Oportunidades da carteira: cadastro, mover de fase, fechar (Conquistado, Perdido, Cancelado,
 * Suspenso), reabrir e excluir. Regra de carteira: admin e gestor em todas; o vendedor só nas empresas
 * dele. O total e o ponderado vêm do banco (colunas geradas), nunca de conta no código.
 */
@Injectable()
export class OportunidadesService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async detalhar(id: string): Promise<OportunidadeDetalhada> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const o = await lerOportunidade(db, escopo, id, new Date())
    if (!o) throw naoEncontrada()
    return { ...o, historico: await this.historico(db, id) }
  }

  async criar(dados: CriarOportunidade): Promise<Oportunidade> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)

    const empresa = await this.exigirEmpresaEditavel(db, escopo, dados.empresaId)
    const funil = await this.exigirFunil(db, dados.funilId)
    const fase = await this.exigirFase(db, funil.id, dados.faseId)
    if (dados.contatoId) await this.exigirContatoDaEmpresa(db, dados.contatoId, dados.empresaId)
    if (dados.solucaoId) await this.exigirCadastro(db, 'solucaoId', solucoes, dados.solucaoId)
    if (dados.origemId) await this.exigirCadastro(db, 'origemId', origens, dados.origemId)
    const responsavelId = dados.responsavelId ?? empresa.vendedorId
    await this.exigirResponsavel(db, escopo, responsavelId)
    // "Duplicar": a original precisa existir e ser visível para quem duplica (só o id vai para a auditoria)
    if (dados.duplicadaDeId) {
      const original = await lerOportunidade(db, escopo, dados.duplicadaDeId, new Date())
      if (!original) throw naoEncontrada()
    }

    const id = await inserirOportunidade(db, tenantId, escopo.membroId, {
      titulo: dados.titulo,
      empresaId: dados.empresaId,
      contatoId: dados.contatoId ?? null,
      solucaoId: dados.solucaoId ?? null,
      origemId: dados.origemId ?? null,
      funilId: funil.id,
      fase,
      responsavelId,
      valorUnico: dados.valorUnico,
      valorMensal: dados.valorMensal,
      meses: dados.meses,
      probabilidade: dados.probabilidade,
      dataPrevistaFechamento: dados.dataPrevistaFechamento ?? null,
      observacoes: dados.observacoes ?? null,
    })
    await this.auditoria.registrar({
      entidade: 'oportunidade',
      entidadeId: id,
      acao: 'criar',
      alteracoes: {
        titulo: dados.titulo,
        empresaId: dados.empresaId,
        fase: fase.nome,
        ...(dados.duplicadaDeId && { duplicadaDeId: dados.duplicadaDeId }),
      },
    })
    await emitirEvento(this.ctx.db(), {
      tenantId: this.ctx.tenantId,
      tipo: 'oportunidade.criada',
      entidadeId: id,
      membroId: this.ctx.membro.id,
      dados: async () => ({ oportunidade: await lerOportunidadePublica(this.ctx.db(), id) }),
    })
    return this.ler(id)
  }

  async alterar(id: string, dados: AlterarOportunidade): Promise<Oportunidade> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregarEditavel(db, escopo, id)
    if (dados.contatoId && dados.contatoId !== atual.contatoId) {
      await this.exigirContatoDaEmpresa(db, dados.contatoId, atual.empresaId)
    }
    if (dados.solucaoId && dados.solucaoId !== atual.solucaoId) {
      await this.exigirCadastro(db, 'solucaoId', solucoes, dados.solucaoId)
    }
    if (dados.origemId && dados.origemId !== atual.origemId) {
      await this.exigirCadastro(db, 'origemId', origens, dados.origemId)
    }
    if (dados.responsavelId && dados.responsavelId !== atual.responsavelId) {
      await this.exigirResponsavel(db, escopo, dados.responsavelId)
    }

    const valorMensal = dados.valorMensal ?? Number(atual.valorMensal)
    // valor mensal que aparece sem duração: assume 12 meses
    const meses = dados.meses ?? (atual.meses === 0 && valorMensal > 0 ? MESES_PADRAO : atual.meses)
    let probabilidade = atual.probabilidade
    let manual = atual.probabilidadeManual
    if (dados.probabilidade !== undefined) {
      const [fase] = await db.select().from(funilFases).where(eq(funilFases.id, atual.faseId))
      probabilidade = dados.probabilidade
      // igual à sugerida da fase: volta a acompanhar a fase; diferente: editada à mão
      manual = dados.probabilidade !== fase?.probabilidadePadrao
    }
    const novo = {
      titulo: dados.titulo,
      contatoId: dados.contatoId,
      solucaoId: dados.solucaoId,
      origemId: dados.origemId,
      responsavelId: dados.responsavelId,
      valorUnico: dados.valorUnico?.toFixed(2),
      valorMensal: dados.valorMensal?.toFixed(2),
      meses: dados.meses !== undefined || meses !== atual.meses ? meses : undefined,
      probabilidade: dados.probabilidade !== undefined ? probabilidade : undefined,
      dataPrevistaFechamento: dados.dataPrevistaFechamento,
      observacoes: dados.observacoes,
    }
    const mudancas = diferencas(atual, novo)
    if (Object.keys(mudancas).length === 0 && manual === atual.probabilidadeManual) {
      return this.ler(id)
    }
    await db
      .update(oportunidades)
      .set({
        ...(novo.titulo !== undefined && { titulo: novo.titulo }),
        ...(novo.contatoId !== undefined && { contatoId: novo.contatoId }),
        ...(novo.solucaoId !== undefined && { solucaoId: novo.solucaoId }),
        ...(novo.origemId !== undefined && { origemId: novo.origemId }),
        ...(novo.responsavelId !== undefined && { responsavelId: novo.responsavelId }),
        ...(novo.valorUnico !== undefined && { valorUnico: novo.valorUnico }),
        ...(novo.valorMensal !== undefined && { valorMensal: novo.valorMensal }),
        ...(novo.meses !== undefined && { meses: novo.meses }),
        ...(novo.probabilidade !== undefined && { probabilidade, probabilidadeManual: manual }),
        ...(novo.dataPrevistaFechamento !== undefined && {
          dataPrevistaFechamento: novo.dataPrevistaFechamento,
        }),
        ...(novo.observacoes !== undefined && { observacoes: novo.observacoes }),
        atualizadoPor: escopo.membroId,
      })
      .where(eq(oportunidades.id, id))
    await this.auditoria.registrar({
      entidade: 'oportunidade',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: mudancas,
    })
    return this.ler(id)
  }

  /**
   * Muda de fase (do mesmo funil). A probabilidade vira a da nova fase, a menos que a pessoa a tenha
   * editado à mão: aí fica a dela e a resposta traz o aviso com a sugestão da nova fase.
   */
  async mover(id: string, faseId: string): Promise<ResultadoDoMovimento> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregarEditavel(db, escopo, id)
    if (atual.status !== 'ativo') throw naoAtiva()
    const fase = await this.exigirFase(db, atual.funilId, faseId)
    if (fase.id === atual.faseId) {
      return { oportunidade: await this.ler(id), avisoDeProbabilidade: null }
    }
    const [daAnterior] = await db.select().from(funilFases).where(eq(funilFases.id, atual.faseId))
    await db
      .update(oportunidades)
      .set({
        faseId: fase.id,
        faseDesde: new Date(),
        ...(atual.probabilidadeManual ? {} : { probabilidade: fase.probabilidadePadrao }),
        atualizadoPor: escopo.membroId,
      })
      .where(eq(oportunidades.id, id))
    await db.insert(oportunidadeHistorico).values({
      tenantId,
      oportunidadeId: id,
      acao: 'fase',
      faseDeId: atual.faseId,
      faseParaId: fase.id,
      por: escopo.membroId,
    })
    await this.auditoria.registrar({
      entidade: 'oportunidade',
      entidadeId: id,
      acao: 'mover',
      alteracoes: { fase: { de: daAnterior?.nome ?? null, para: fase.nome } },
    })
    await emitirEvento(this.ctx.db(), {
      tenantId: this.ctx.tenantId,
      tipo: 'oportunidade.fase_alterada',
      entidadeId: id,
      membroId: this.ctx.membro.id,
      dados: async () => ({
        oportunidade: await lerOportunidadePublica(this.ctx.db(), id),
        alteracoes: { fase: { antes: { id: atual.faseId }, depois: { id: fase.id } } },
      }),
    })

    const aviso =
      atual.probabilidadeManual && atual.probabilidade !== fase.probabilidadePadrao
        ? { atual: atual.probabilidade, sugerida: fase.probabilidadePadrao }
        : null
    return { oportunidade: await this.ler(id), avisoDeProbabilidade: aviso }
  }

  async fechar(id: string, dados: FecharOportunidade): Promise<Oportunidade> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const fuso = await fusoDaEmpresa(db, tenantId)
    const atual = await this.carregarEditavel(db, escopo, id)
    if (atual.status !== 'ativo') throw naoAtiva()

    let motivoNome: string | null = null
    if (dados.motivoId) {
      const [m] = await db
        .select()
        .from(motivos)
        .where(and(eq(motivos.id, dados.motivoId), isNull(motivos.excluidoEm)))
      if (!m || !m.aplicaA.includes(dados.status)) {
        throw invalido('motivoId', 'motivo_invalido', 'Escolha um motivo da lista deste status.')
      }
      if (!m.ativo)
        throw invalido('motivoId', 'motivo_invalido', `O motivo "${m.nome}" está inativo.`)
      motivoNome = m.nome
    }
    if (
      dados.status === 'suspenso' &&
      dados.retomarEm &&
      dados.retomarEm < diaNoFuso(new Date(), fuso)
    ) {
      throw invalido(
        'retomarEm',
        'retomar_no_passado',
        'A data de retomada não pode ser no passado.',
      )
    }

    const { virouCliente } = await registrarFechamento(
      db,
      tenantId,
      escopo.membroId,
      atual,
      {
        status: dados.status,
        motivoId: dados.motivoId ?? null,
        detalhe: dados.detalhe ?? null,
        retomarEm: dados.retomarEm ?? null,
        viraCliente: dados.empresaViraCliente ?? escopo.clienteAoConquistar,
      },
      fuso,
    )
    await this.auditoria.registrar({
      entidade: 'oportunidade',
      entidadeId: id,
      acao: 'fechar',
      alteracoes: {
        status: { de: 'ativo', para: dados.status },
        ...(motivoNome ? { motivo: motivoNome } : {}),
        ...(virouCliente ? { empresaViraCliente: virouCliente } : {}),
      },
    })
    await emitirEvento(this.ctx.db(), {
      tenantId: this.ctx.tenantId,
      tipo: 'oportunidade.status_alterado',
      entidadeId: id,
      membroId: this.ctx.membro.id,
      dados: async () => ({
        oportunidade: await lerOportunidadePublica(this.ctx.db(), id),
        alteracoes: { status: { antes: 'ativo', depois: dados.status } },
      }),
    })
    return this.ler(id)
  }

  /** Volta a Ativa. Não desfaz o "empresa vira Cliente" (fica só o registro no histórico). */
  async reabrir(id: string): Promise<Oportunidade> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregarEditavel(db, escopo, id)
    if (atual.status === 'ativo') {
      throw new ErroApi('oportunidade_ja_ativa', 'A oportunidade já está ativa.', 409)
    }
    // A fase pode ter sido inativada depois: volta para a primeira fase ativa do funil
    const [fase] = await db.select().from(funilFases).where(eq(funilFases.id, atual.faseId))
    const destino =
      fase && fase.ativo && !fase.excluidoEm ? fase : await this.exigirFase(db, atual.funilId)
    await db
      .update(oportunidades)
      .set({
        status: 'ativo',
        faseId: destino.id,
        faseDesde: new Date(),
        faseParouEmId: null,
        motivoId: null,
        motivoDetalhe: null,
        suspensaAte: null,
        dataFechamento: null,
        atividadeRetomadaId: null,
        ...(destino.id !== atual.faseId && !atual.probabilidadeManual
          ? { probabilidade: destino.probabilidadePadrao }
          : {}),
        atualizadoPor: escopo.membroId,
      })
      .where(eq(oportunidades.id, id))
    await db.insert(oportunidadeHistorico).values({
      tenantId,
      oportunidadeId: id,
      acao: 'reaberta',
      faseParaId: destino.id,
      statusDe: atual.status,
      statusPara: 'ativo',
      por: escopo.membroId,
    })
    await cancelarRetomada(db, atual)
    await recalcularCarteira(db, tenantId, atual.empresaId, escopo.membroId)
    await recalcularOportunidade(db, tenantId, id)
    await this.auditoria.registrar({
      entidade: 'oportunidade',
      entidadeId: id,
      acao: 'reabrir',
      alteracoes: { status: { de: atual.status, para: 'ativo' } },
    })
    await emitirEvento(this.ctx.db(), {
      tenantId: this.ctx.tenantId,
      tipo: 'oportunidade.status_alterado',
      entidadeId: id,
      membroId: this.ctx.membro.id,
      dados: async () => ({
        oportunidade: await lerOportunidadePublica(this.ctx.db(), id),
        alteracoes: { status: { antes: atual.status, depois: 'ativo' } },
      }),
    })
    return this.ler(id)
  }

  /** Exclusão lógica, pelo alcance de `oportunidades.excluir`, sem lixeira. */
  async excluir(id: string): Promise<void> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [atual] = await db
      .select({ o: oportunidades, vendedorId: empresas.vendedorId })
      .from(oportunidades)
      .innerJoin(empresas, eq(empresas.id, oportunidades.empresaId))
      .where(
        and(
          eq(oportunidades.id, id),
          isNull(oportunidades.excluidoEm),
          isNull(empresas.excluidoEm),
          condicaoDeVisibilidadeDaOportunidade(escopo),
        ),
      )
    if (!atual) throw naoEncontrada()
    if (!alcanca(escopo.oportunidades.excluir, atual.vendedorId)) {
      throw negado('Seu perfil de acesso não permite excluir esta oportunidade.')
    }
    await db
      .update(oportunidades)
      .set({ excluidoEm: new Date(), atualizadoPor: escopo.membroId })
      .where(eq(oportunidades.id, id))
    // a atividade de retomada não fica solta na agenda
    await cancelarRetomada(db, atual.o)
    await recalcularCarteira(db, this.ctx.tenantId, atual.o.empresaId, escopo.membroId)
    await this.auditoria.registrar({
      entidade: 'oportunidade',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { titulo: atual.o.titulo },
    })
  }

  // ---- apoio ----

  private async ler(id: string): Promise<Oportunidade> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const o = await lerOportunidade(db, escopo, id, new Date())
    if (!o) throw naoEncontrada()
    return o
  }

  /** A oportunidade que o usuário vê E edita; 404 se não vê, 403 se só vê. */
  private async carregarEditavel(
    db: Transacao,
    escopo: EscopoDaCarteira,
    id: string,
  ): Promise<LinhaDeOportunidade> {
    const [linha] = await db
      .select({
        o: oportunidades,
        editavel: sql<boolean>`${condicaoDeEdicaoDaOportunidade(escopo) ?? sql`true`}`,
      })
      .from(oportunidades)
      .innerJoin(empresas, eq(empresas.id, oportunidades.empresaId))
      .where(
        and(
          eq(oportunidades.id, id),
          isNull(oportunidades.excluidoEm),
          isNull(empresas.excluidoEm),
          condicaoDeVisibilidadeDaOportunidade(escopo),
        ),
      )
    if (!linha) throw naoEncontrada()
    if (!linha.editavel) throw negado('Você só altera oportunidades das empresas da sua carteira.')
    return linha.o
  }

  private async exigirEmpresaEditavel(db: Transacao, escopo: EscopoDaCarteira, empresaId: string) {
    const [e] = await db
      .select({ id: empresas.id, vendedorId: empresas.vendedorId })
      .from(empresas)
      .where(and(eq(empresas.id, empresaId), isNull(empresas.excluidoEm)))
    if (!e || !podeVer(escopo, e.vendedorId)) {
      throw invalido('empresaId', 'empresa_invalida', 'Empresa não encontrada.')
    }
    if (!podeEditar(escopo, e.vendedorId)) {
      throw negado('Você só cria oportunidades em empresas da sua carteira.')
    }
    return e
  }

  /** O funil pedido (ativo) ou o funil padrão. */
  private async exigirFunil(db: Transacao, funilId: string | undefined) {
    const [f] = await db
      .select()
      .from(funis)
      .where(
        and(isNull(funis.excluidoEm), funilId ? eq(funis.id, funilId) : eq(funis.padrao, true)),
      )
    if (!f) {
      throw invalido('funilId', 'funil_invalido', 'Funil não encontrado.')
    }
    if (!f.ativo) throw invalido('funilId', 'funil_invalido', `O funil "${f.nome}" está inativo.`)
    return f
  }

  /** A fase pedida (ativa e do funil) ou a primeira fase ativa do funil. */
  private async exigirFase(db: Transacao, funilId: string, faseId?: string) {
    const [f] = await db
      .select()
      .from(funilFases)
      .where(
        and(
          eq(funilFases.funilId, funilId),
          isNull(funilFases.excluidoEm),
          eq(funilFases.ativo, true),
          faseId ? eq(funilFases.id, faseId) : undefined,
        ),
      )
      .orderBy(asc(funilFases.ordem), asc(funilFases.nome))
      .limit(1)
    if (!f) throw invalido('faseId', 'fase_invalida', 'Fase não encontrada neste funil.')
    return f
  }

  private async exigirContatoDaEmpresa(db: Transacao, contatoId: string, empresaId: string) {
    const [v] = await db
      .select({ id: empresaContatos.id })
      .from(empresaContatos)
      .innerJoin(contatos, eq(contatos.id, empresaContatos.contatoId))
      .where(
        and(
          eq(empresaContatos.contatoId, contatoId),
          eq(empresaContatos.empresaId, empresaId),
          eq(empresaContatos.ativo, true),
          isNull(contatos.excluidoEm),
        ),
      )
    if (!v) throw invalido('contatoId', 'contato_invalido', 'O contato não é desta empresa.')
  }

  private async exigirCadastro(
    db: Transacao,
    campo: string,
    tabela: typeof solucoes | typeof origens,
    id: string,
  ) {
    const [c] = await db
      .select({ id: tabela.id, nome: tabela.nome, ativo: tabela.ativo })
      .from(tabela)
      .where(and(eq(tabela.id, id), isNull(tabela.excluidoEm)))
    if (!c) throw invalido(campo, `${campo}_invalido`, 'Item não encontrado.')
    if (!c.ativo) throw invalido(campo, `${campo}_invalido`, `"${c.nome}" está inativo.`)
  }

  /** O responsável é um membro ativo; sem `oportunidades.atribuir_responsavel`, só a própria pessoa. */
  private async exigirResponsavel(db: Transacao, escopo: EscopoDaCarteira, membroId: string) {
    if (!escopo.atribuirOportunidade && membroId !== escopo.membroId) {
      throw negado('Seu perfil de acesso só atribui oportunidades a você mesmo.')
    }
    const [m] = await db
      .select({ id: membros.id })
      .from(membros)
      .where(and(eq(membros.id, membroId), eq(membros.ativo, true), isNull(membros.excluidoEm)))
    if (!m) throw invalido('responsavelId', 'responsavel_invalido', 'Responsável não encontrado.')
  }

  /** O histórico em palavras (nomes no lugar de ids), do mais recente ao mais antigo. */
  private async historico(db: Transacao, id: string) {
    const linhas = await db.execute(sql`
      SELECT h.id, h.em, h.acao, h.status_de, h.status_para, h.detalhe,
             fd.nome AS fase_de, fp.nome AS fase_para, m.nome AS motivo,
             p.id AS por_id, p.nome AS por_nome
      FROM oportunidade_historico h
      LEFT JOIN funil_fases fd ON fd.id = h.fase_de_id
      LEFT JOIN funil_fases fp ON fp.id = h.fase_para_id
      LEFT JOIN motivos m ON m.id = h.motivo_id
      LEFT JOIN membros p ON p.id = h.por
      WHERE h.oportunidade_id = ${id}
      ORDER BY h.em DESC, h.id DESC`)
    return (linhas as unknown as Record<string, string | null>[]).map((l) => {
      const statusPara = l['status_para'] as StatusDaOportunidade | null
      const statusDe = l['status_de'] as StatusDaOportunidade | null
      const titulo =
        l['acao'] === 'criada'
          ? `Criada na fase ${l['fase_para'] ?? ''}`.trim()
          : l['acao'] === 'fase'
            ? `Fase: ${l['fase_de'] ?? '—'} → ${l['fase_para'] ?? '—'}`
            : l['acao'] === 'reaberta'
              ? `Reaberta (era ${statusDe ? ROTULO_DO_STATUS[statusDe].toLowerCase() : 'fechada'})`
              : `${statusPara ? ROTULO_DO_STATUS[statusPara] : 'Fechada'}${l['motivo'] ? ` (${l['motivo']})` : ''}${l['fase_de'] ? `, na fase ${l['fase_de']}` : ''}`
      return {
        id: l['id'] as string,
        em: new Date(l['em'] as string).toISOString(),
        por: l['por_id'] ? { id: l['por_id'], nome: l['por_nome'] ?? '' } : null,
        acao: l['acao'] as 'criada' | 'fase' | 'status' | 'reaberta',
        titulo,
        detalhe: l['detalhe'] ?? null,
      }
    })
  }
}
