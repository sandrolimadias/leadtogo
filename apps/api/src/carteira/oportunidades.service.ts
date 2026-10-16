import { and, asc, eq, inArray, isNull, schema, sql } from '@leadtogo/db'
import {
  type AlterarOportunidade,
  type CriarOportunidade,
  diaNoFuso,
  type FecharOportunidade,
  inicioDoDiaNoFuso,
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
import { recalcularCarteira } from './atividades-efeitos.js'
import { fusoDaEmpresa } from './atividades-leitura.js'
import {
  condicaoDeEdicaoDaOportunidade,
  condicaoDeVisibilidadeDaOportunidade,
  lerOportunidade,
} from './oportunidades-leitura.js'
import { empresaViraCliente, recalcularOportunidade } from './oportunidades-efeitos.js'
import {
  type EscopoDaCarteira,
  escopoDaCarteira,
  podeEditar,
  podeVer,
} from './regras-de-carteira.js'

const {
  atividades,
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
  tiposAtividade,
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

type LinhaDeOportunidade = typeof oportunidades.$inferSelect

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

    const meses = dados.meses ?? (dados.valorMensal > 0 ? MESES_PADRAO : 0)
    const manual =
      dados.probabilidade !== undefined && dados.probabilidade !== fase.probabilidadePadrao
    const [criada] = await db
      .insert(oportunidades)
      .values({
        tenantId,
        titulo: dados.titulo,
        empresaId: dados.empresaId,
        contatoId: dados.contatoId ?? null,
        solucaoId: dados.solucaoId ?? null,
        origemId: dados.origemId ?? null,
        funilId: funil.id,
        faseId: fase.id,
        responsavelId,
        valorUnico: dados.valorUnico.toFixed(2),
        valorMensal: dados.valorMensal.toFixed(2),
        meses,
        probabilidade: manual ? (dados.probabilidade ?? 0) : fase.probabilidadePadrao,
        probabilidadeManual: manual,
        dataPrevistaFechamento: dados.dataPrevistaFechamento ?? null,
        observacoes: dados.observacoes ?? null,
        criadoPor: escopo.membroId,
        atualizadoPor: escopo.membroId,
      })
      .returning({ id: oportunidades.id })
    if (!criada) throw new Error('INSERT de oportunidade sem retorno')

    await db.insert(oportunidadeHistorico).values({
      tenantId,
      oportunidadeId: criada.id,
      acao: 'criada',
      faseParaId: fase.id,
      statusPara: 'ativo',
      por: escopo.membroId,
    })
    await this.auditoria.registrar({
      entidade: 'oportunidade',
      entidadeId: criada.id,
      acao: 'criar',
      alteracoes: { titulo: dados.titulo, empresaId: dados.empresaId, fase: fase.nome },
    })
    return this.ler(criada.id)
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

    const agora = new Date()
    await db
      .update(oportunidades)
      .set({
        status: dados.status,
        faseParouEmId: atual.faseId,
        motivoId: dados.status === 'conquistado' ? null : (dados.motivoId ?? null),
        motivoDetalhe: dados.detalhe ?? null,
        suspensaAte: dados.status === 'suspenso' ? (dados.retomarEm ?? null) : null,
        dataFechamento: agora,
        atualizadoPor: escopo.membroId,
      })
      .where(eq(oportunidades.id, id))
    await db.insert(oportunidadeHistorico).values({
      tenantId,
      oportunidadeId: id,
      acao: 'status',
      faseDeId: atual.faseId,
      statusDe: 'ativo',
      statusPara: dados.status,
      motivoId: dados.status === 'conquistado' ? null : (dados.motivoId ?? null),
      detalhe: dados.detalhe ?? null,
      por: escopo.membroId,
    })

    let virouCliente: string | null = null
    if (dados.status === 'conquistado') {
      if (dados.empresaViraCliente ?? escopo.clienteAoConquistar) {
        const r = await empresaViraCliente(db, tenantId, atual.empresaId, escopo.membroId)
        if (r.mudou) virouCliente = r.nomeDaTag
      }
    }
    if (dados.status === 'suspenso' && dados.retomarEm) {
      await this.criarRetomada(db, tenantId, atual, dados.retomarEm, fuso, escopo.membroId)
      await recalcularCarteira(db, tenantId, atual.empresaId, escopo.membroId)
      await recalcularOportunidade(db, tenantId, id)
    }
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
    await this.cancelarRetomada(db, atual)
    await recalcularCarteira(db, tenantId, atual.empresaId, escopo.membroId)
    await recalcularOportunidade(db, tenantId, id)
    await this.auditoria.registrar({
      entidade: 'oportunidade',
      entidadeId: id,
      acao: 'reabrir',
      alteracoes: { status: { de: atual.status, para: 'ativo' } },
    })
    return this.ler(id)
  }

  /** Exclusão lógica, só admin e gestor, sem lixeira. */
  async excluir(id: string): Promise<void> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const [atual] = await db
      .select({ o: oportunidades })
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
    if (escopo.papel === 'vendedor')
      throw negado('Só gestor e administrador excluem oportunidades.')
    await db
      .update(oportunidades)
      .set({ excluidoEm: new Date(), atualizadoPor: escopo.membroId })
      .where(eq(oportunidades.id, id))
    // a atividade de retomada não fica solta na agenda
    await this.cancelarRetomada(db, atual.o)
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

  /** O responsável é um membro ativo; o vendedor só atribui a si mesmo. */
  private async exigirResponsavel(db: Transacao, escopo: EscopoDaCarteira, membroId: string) {
    if (escopo.papel === 'vendedor' && membroId !== escopo.membroId) {
      throw negado('O vendedor só atribui oportunidades a si mesmo.')
    }
    const [m] = await db
      .select({ id: membros.id })
      .from(membros)
      .where(and(eq(membros.id, membroId), eq(membros.ativo, true), isNull(membros.excluidoEm)))
    if (!m) throw invalido('responsavelId', 'responsavel_invalido', 'Responsável não encontrado.')
  }

  /** Suspensa: cria a atividade de retomada (Tarefa de dia inteiro na data), com a mesma empresa e o mesmo responsável. */
  private async criarRetomada(
    db: Transacao,
    tenantId: string,
    o: LinhaDeOportunidade,
    retomarEm: string,
    fuso: string,
    membroId: string,
  ): Promise<void> {
    const [tipo] = await db
      .select({ id: tiposAtividade.id })
      .from(tiposAtividade)
      .where(and(eq(tiposAtividade.chaveSistema, 'tarefa'), isNull(tiposAtividade.excluidoEm)))
    if (!tipo) {
      throw new ErroApi('tipo_tarefa_ausente', 'O tipo de atividade Tarefa não existe.', 409)
    }
    const [criada] = await db
      .insert(atividades)
      .values({
        tenantId,
        tipoAtividadeId: tipo.id,
        titulo: `Retomar: ${o.titulo}`,
        empresaId: o.empresaId,
        contatoId: o.contatoId,
        oportunidadeId: o.id,
        responsavelId: o.responsavelId,
        dataInicio: inicioDoDiaNoFuso(retomarEm, fuso),
        diaInteiro: true,
        situacao: 'pendente',
        origem: 'manual',
        criadoPor: membroId,
        atualizadoPor: membroId,
      })
      .returning({ id: atividades.id })
    await db
      .update(oportunidades)
      .set({ atividadeRetomadaId: criada?.id ?? null })
      .where(eq(oportunidades.id, o.id))
  }

  /** Cancela a atividade de retomada que ainda está aberta (a oportunidade voltou a Ativa ou saiu). */
  private async cancelarRetomada(db: Transacao, o: LinhaDeOportunidade): Promise<void> {
    if (!o.atividadeRetomadaId) return
    await db
      .update(atividades)
      .set({ situacao: 'cancelada', realizadaEm: null })
      .where(
        and(
          eq(atividades.id, o.atividadeRetomadaId),
          inArray(atividades.situacao, ['pendente', 'em_execucao']),
        ),
      )
    await db
      .update(oportunidades)
      .set({ atividadeRetomadaId: null })
      .where(eq(oportunidades.id, o.id))
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
