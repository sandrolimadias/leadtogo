import { and, eq, isNull, schema, sql } from '@leadtogo/db'
import {
  type AlterarAtividade,
  type Atividade,
  type ConcluirAtividade,
  type CriarAtividade,
  diaNoFuso,
  estaAberta,
  estaNoFuturo,
  inicioDoDiaNoFuso,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService, type Transacao } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { diferencas } from '../cadastros/cadastros.base.js'
import { ErroApi } from '../http/erro-api.js'
import { recalcularCarteira } from './atividades-efeitos.js'
import {
  condicaoDeEdicaoDaAtividade,
  condicaoDeVisibilidadeDaAtividade,
  fusoDaEmpresa,
  lerAtividade,
} from './atividades-leitura.js'
import {
  type EscopoDaCarteira,
  escopoDaCarteira,
  podeEditar,
  podeVer,
} from './regras-de-carteira.js'

const { atividades, empresaContatos, contatos, empresas, membros, tiposAtividade } = schema

const naoEncontrada = () =>
  new ErroApi('atividade_nao_encontrada', 'Atividade não encontrada.', 404)
const negado = (mensagem: string) => new ErroApi('acesso_negado', mensagem, 403)
const invalido = (campo: string, codigo: string, mensagem: string) =>
  new ErroApi(codigo, mensagem, 400, [{ campo, mensagem }])

const NO_FUTURO = () =>
  new ErroApi(
    'atividade_no_futuro',
    'Uma atividade realizada não pode ter data no futuro (a tolerância é de 5 minutos).',
    400,
    [{ campo: 'dataInicio', mensagem: 'a data não pode estar no futuro' }],
  )

/**
 * Atividades da carteira: registrar, editar, concluir, cancelar e excluir. Toda mudança que toca uma
 * atividade ligada a uma empresa recalcula, nela, a última visita, o último contato, a próxima
 * atividade e as tags Visitada e Contactada (`recalcularCarteira`).
 */
@Injectable()
export class AtividadesService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async detalhar(id: string): Promise<Atividade> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const fuso = await fusoDaEmpresa(db, this.ctx.tenantId)
    const a = await lerAtividade(db, escopo, id, new Date(), fuso)
    if (!a) throw naoEncontrada()
    return a
  }

  async criar(dados: CriarAtividade): Promise<Atividade> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const fuso = await fusoDaEmpresa(db, tenantId)
    const agora = new Date()

    const tipo = await this.exigirTipo(db, dados.tipoAtividadeId)
    const empresaId = dados.empresaId ?? null
    if (empresaId === null && tipo.exigeEmpresa) {
      throw invalido(
        'empresaId',
        'empresa_obrigatoria',
        `Escolha a empresa: ${tipo.nome} exige empresa.`,
      )
    }
    if (empresaId !== null) await this.exigirEmpresaEditavel(db, escopo, empresaId)
    const contatoId = dados.contatoId ?? null
    if (contatoId !== null) await this.exigirContatoDaEmpresa(db, contatoId, empresaId)
    const responsavelId = dados.responsavelId ?? escopo.membroId
    await this.exigirResponsavel(db, escopo, responsavelId)

    const { inicio, fim } = this.datas(
      dados.dataInicio,
      dados.dataFim ?? null,
      dados.diaInteiro,
      fuso,
    )
    const realizada = dados.situacao === 'realizada'
    if (realizada && estaNoFuturo(inicio, agora)) throw NO_FUTURO()

    const [criada] = await db
      .insert(atividades)
      .values({
        tenantId,
        tipoAtividadeId: tipo.id,
        titulo: dados.titulo,
        empresaId,
        contatoId,
        responsavelId,
        dataInicio: inicio,
        dataFim: fim,
        diaInteiro: dados.diaInteiro,
        situacao: dados.situacao,
        realizadaEm: realizada ? inicio : null,
        resultado: dados.resultado ?? null,
        importante: dados.importante,
        urgente: dados.urgente,
        observacoes: dados.observacoes ?? null,
        origem: 'manual',
        criadoPor: escopo.membroId,
        atualizadoPor: escopo.membroId,
      })
      .returning({ id: atividades.id })
    if (!criada) throw new Error('INSERT de atividade sem retorno')

    if (empresaId !== null) await recalcularCarteira(db, tenantId, empresaId, escopo.membroId)
    await this.auditoria.registrar({
      entidade: 'atividade',
      entidadeId: criada.id,
      acao: 'criar',
      alteracoes: {
        titulo: dados.titulo,
        tipo: tipo.nome,
        situacao: dados.situacao,
        ...(empresaId ? { empresaId } : {}),
        ...(contatoId ? { contatoId } : {}),
      },
    })
    return this.detalhar(criada.id)
  }

  async alterar(id: string, dados: AlterarAtividade): Promise<Atividade> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const fuso = await fusoDaEmpresa(db, tenantId)
    const atual = await this.carregarEditavel(db, escopo, id)
    if (atual.situacao === 'cancelada') {
      throw new ErroApi('atividade_cancelada', 'Uma atividade cancelada não se edita.', 409)
    }
    const realizada = atual.situacao === 'realizada'

    const tipo = await this.exigirTipo(
      db,
      dados.tipoAtividadeId ?? atual.tipoAtividadeId,
      !('tipoAtividadeId' in dados),
    )
    const empresaId = dados.empresaId !== undefined ? dados.empresaId : atual.empresaId
    if (empresaId === null && tipo.exigeEmpresa) {
      throw invalido(
        'empresaId',
        'empresa_obrigatoria',
        `Escolha a empresa: ${tipo.nome} exige empresa.`,
      )
    }
    if (empresaId !== null && empresaId !== atual.empresaId) {
      await this.exigirEmpresaEditavel(db, escopo, empresaId)
    }
    // trocar de empresa sem dizer o contato tira o contato (era da empresa anterior)
    let contatoId = dados.contatoId !== undefined ? dados.contatoId : atual.contatoId
    if (empresaId !== atual.empresaId && dados.contatoId === undefined) contatoId = null
    if (contatoId !== null && (contatoId !== atual.contatoId || empresaId !== atual.empresaId)) {
      await this.exigirContatoDaEmpresa(db, contatoId, empresaId)
    }
    const responsavelId = dados.responsavelId ?? atual.responsavelId
    if (responsavelId !== atual.responsavelId) {
      await this.exigirResponsavel(db, escopo, responsavelId)
    }

    const diaInteiro = dados.diaInteiro ?? atual.diaInteiro
    const { inicio, fim } = this.datas(
      dados.dataInicio ?? atual.dataInicio.toISOString(),
      dados.dataFim !== undefined ? dados.dataFim : (atual.dataFim?.toISOString() ?? null),
      diaInteiro,
      fuso,
    )
    const mudouData = dados.dataInicio !== undefined || dados.diaInteiro !== undefined
    const resultado = dados.resultado !== undefined ? dados.resultado : atual.resultado
    if (realizada) {
      if (!resultado) throw invalido('resultado', 'resultado_obrigatorio', 'Informe o resultado.')
      // a data de uma atividade realizada é a de QUANDO aconteceu
      if (mudouData && estaNoFuturo(inicio, new Date())) throw NO_FUTURO()
    }

    const novo = {
      tipoAtividadeId: tipo.id,
      titulo: dados.titulo,
      empresaId,
      contatoId,
      responsavelId,
      dataInicio: mudouData ? inicio : undefined,
      dataFim: dados.dataFim !== undefined || mudouData ? fim : undefined,
      diaInteiro: dados.diaInteiro,
      resultado: dados.resultado,
      importante: dados.importante,
      urgente: dados.urgente,
      observacoes: dados.observacoes,
    }
    const mudancas = diferencas(
      {
        ...atual,
        dataInicio: atual.dataInicio.toISOString(),
        dataFim: atual.dataFim?.toISOString() ?? null,
      },
      {
        ...novo,
        dataInicio: novo.dataInicio?.toISOString(),
        dataFim: novo.dataFim === undefined ? undefined : (novo.dataFim?.toISOString() ?? null),
      },
    )
    if (Object.keys(mudancas).length === 0) return this.detalhar(id)

    await db
      .update(atividades)
      .set({
        ...(novo.titulo !== undefined && { titulo: novo.titulo }),
        tipoAtividadeId: tipo.id,
        empresaId,
        contatoId,
        responsavelId,
        ...(novo.dataInicio !== undefined && { dataInicio: novo.dataInicio }),
        ...(novo.dataFim !== undefined && { dataFim: novo.dataFim }),
        ...(novo.diaInteiro !== undefined && { diaInteiro: novo.diaInteiro }),
        ...(novo.resultado !== undefined && { resultado: novo.resultado }),
        ...(novo.importante !== undefined && { importante: novo.importante }),
        ...(novo.urgente !== undefined && { urgente: novo.urgente }),
        ...(novo.observacoes !== undefined && { observacoes: novo.observacoes }),
        // realizada: a data editada é a do fato, que alimenta última visita e último contato
        ...(realizada && mudouData && { realizadaEm: inicio }),
        atualizadoPor: escopo.membroId,
      })
      .where(eq(atividades.id, id))

    await this.recalcular(db, tenantId, escopo.membroId, atual.empresaId, empresaId)
    await this.auditoria.registrar({
      entidade: 'atividade',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: mudancas,
    })
    return this.detalhar(id)
  }

  /** Conclui uma atividade aberta: resultado obrigatório; sem data, vale agora. */
  async concluir(id: string, dados: ConcluirAtividade): Promise<Atividade> {
    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregarEditavel(db, escopo, id)
    if (!estaAberta(atual.situacao)) {
      throw new ErroApi('atividade_nao_aberta', 'Só se conclui uma atividade pendente.', 409)
    }
    const agora = new Date()
    const realizadaEm = dados.realizadaEm ? new Date(dados.realizadaEm) : agora
    if (estaNoFuturo(realizadaEm, agora)) throw NO_FUTURO()
    await db
      .update(atividades)
      .set({
        situacao: 'realizada',
        realizadaEm,
        resultado: dados.resultado,
        atualizadoPor: escopo.membroId,
      })
      .where(eq(atividades.id, id))
    if (atual.empresaId) await recalcularCarteira(db, tenantId, atual.empresaId, escopo.membroId)
    await this.auditoria.registrar({
      entidade: 'atividade',
      entidadeId: id,
      acao: 'concluir',
      alteracoes: { titulo: atual.titulo, realizadaEm: realizadaEm.toISOString() },
    })
    return this.detalhar(id)
  }

  /** Cancela uma atividade aberta ou realizada (a realizada deixa de contar como visita ou contato). */
  async cancelar(id: string): Promise<Atividade> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregarEditavel(db, escopo, id)
    if (atual.situacao === 'cancelada') {
      throw new ErroApi('atividade_cancelada', 'A atividade já está cancelada.', 409)
    }
    await db
      .update(atividades)
      .set({ situacao: 'cancelada', realizadaEm: null, atualizadoPor: escopo.membroId })
      .where(eq(atividades.id, id))
    if (atual.empresaId) {
      await recalcularCarteira(db, this.ctx.tenantId, atual.empresaId, escopo.membroId)
    }
    await this.auditoria.registrar({
      entidade: 'atividade',
      entidadeId: id,
      acao: 'cancelar',
      alteracoes: { titulo: atual.titulo, situacaoAnterior: atual.situacao },
    })
    return this.detalhar(id)
  }

  /** Exclusão lógica. */
  async excluir(id: string): Promise<void> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const atual = await this.carregarEditavel(db, escopo, id)
    await db
      .update(atividades)
      .set({ excluidoEm: new Date(), atualizadoPor: escopo.membroId })
      .where(eq(atividades.id, id))
    if (atual.empresaId) {
      await recalcularCarteira(db, this.ctx.tenantId, atual.empresaId, escopo.membroId)
    }
    await this.auditoria.registrar({
      entidade: 'atividade',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { titulo: atual.titulo, situacao: atual.situacao },
    })
  }

  // ---- apoio ----

  /** A atividade que o usuário vê E edita; 404 se não vê, 403 se só vê. */
  private async carregarEditavel(db: Transacao, escopo: EscopoDaCarteira, id: string) {
    const [linha] = await db
      .select({ a: atividades, editavel: condicaoDeEdicaoDaAtividadeSql(escopo) })
      .from(atividades)
      .leftJoin(empresas, eq(empresas.id, atividades.empresaId))
      .where(
        and(
          eq(atividades.id, id),
          isNull(atividades.excluidoEm),
          condicaoDeVisibilidadeDaAtividade(escopo),
        ),
      )
    if (!linha) throw naoEncontrada()
    if (!linha.editavel) throw negado('Você só edita atividades das empresas da sua carteira.')
    return linha.a
  }

  private async exigirTipo(db: Transacao, id: string, permitirInativo = false) {
    const [t] = await db
      .select({
        id: tiposAtividade.id,
        nome: tiposAtividade.nome,
        exigeEmpresa: tiposAtividade.exigeEmpresa,
        ativo: tiposAtividade.ativo,
      })
      .from(tiposAtividade)
      .where(and(eq(tiposAtividade.id, id), isNull(tiposAtividade.excluidoEm)))
    if (!t) throw invalido('tipoAtividadeId', 'tipo_invalido', 'Tipo de atividade não encontrado.')
    if (!t.ativo && !permitirInativo) {
      throw invalido('tipoAtividadeId', 'tipo_inativo', `O tipo "${t.nome}" está inativo.`)
    }
    return t
  }

  /** A empresa existe, o usuário a vê e a edita (só se registra atividade em empresa da própria carteira). */
  private async exigirEmpresaEditavel(db: Transacao, escopo: EscopoDaCarteira, empresaId: string) {
    const [e] = await db
      .select({ id: empresas.id, vendedorId: empresas.vendedorId })
      .from(empresas)
      .where(and(eq(empresas.id, empresaId), isNull(empresas.excluidoEm)))
    if (!e || !podeVer(escopo, e.vendedorId)) {
      throw invalido('empresaId', 'empresa_invalida', 'Empresa não encontrada.')
    }
    if (!podeEditar(escopo, e.vendedorId)) {
      throw negado('Você só registra atividades em empresas da sua carteira.')
    }
  }

  /** O contato existe e tem vínculo ativo com a empresa da atividade (e a atividade tem empresa). */
  private async exigirContatoDaEmpresa(db: Transacao, contatoId: string, empresaId: string | null) {
    if (empresaId === null) {
      throw invalido('contatoId', 'contato_sem_empresa', 'Escolha a empresa antes do contato.')
    }
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
    if (!v) {
      throw invalido('contatoId', 'contato_invalido', 'O contato não é desta empresa.')
    }
  }

  /** O responsável é um membro ativo; o vendedor só atribui a si mesmo. */
  private async exigirResponsavel(db: Transacao, escopo: EscopoDaCarteira, membroId: string) {
    if (escopo.papel === 'vendedor' && membroId !== escopo.membroId) {
      throw negado('O vendedor só registra atividades para si mesmo.')
    }
    const [m] = await db
      .select({ id: membros.id })
      .from(membros)
      .where(and(eq(membros.id, membroId), eq(membros.ativo, true), isNull(membros.excluidoEm)))
    if (!m) throw invalido('responsavelId', 'responsavel_invalido', 'Responsável não encontrado.')
  }

  /** Dia inteiro vale a meia-noite do dia no fuso da empresa (e não tem hora de fim). */
  private datas(inicio: string, fim: string | null, diaInteiro: boolean, fuso: string) {
    if (diaInteiro) {
      return { inicio: inicioDoDiaNoFuso(diaNoFuso(inicio, fuso), fuso), fim: null }
    }
    const i = new Date(inicio)
    const f = fim === null ? null : new Date(fim)
    if (f !== null && f < i) {
      throw invalido('dataFim', 'fim_antes_do_inicio', 'O fim vem depois do início.')
    }
    return { inicio: i, fim: f }
  }

  /** Recalcula a empresa antiga e a nova (se a atividade trocou de empresa). */
  private async recalcular(
    db: Transacao,
    tenantId: string,
    membroId: string,
    antiga: string | null,
    nova: string | null,
  ) {
    const ids = new Set([antiga, nova].filter((x): x is string => x !== null))
    for (const empresaId of ids) await recalcularCarteira(db, tenantId, empresaId, membroId)
  }
}

const condicaoDeEdicaoDaAtividadeSql = (escopo: EscopoDaCarteira) =>
  sql<boolean>`${condicaoDeEdicaoDaAtividade(escopo) ?? sql`true`}`
