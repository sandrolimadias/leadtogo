import { novoId, sql } from '@leadtogo/db'
import {
  type CancelarEventoEntrada,
  type ConsultaDeEventos,
  type Evento,
  type ItemDeEvento,
  type ListaDeEventos,
  type ListaDeParticipantes,
  type ParticipanteDoEvento,
  type SalvarEventoEntrada,
  type SituacaoDaConfirmacao,
  type SituacaoDoEvento,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { tagsDoAlcance, trocarTagsDoAlcance } from './audiencia.js'
import { agendarNotificacaoDeEvento } from './notificar-evento.js'

type LinhaDoEvento = {
  id: string
  titulo: string
  descricao: string | null
  local: string | null
  link_online: string | null
  inicio_em: string | Date
  fim_em: string | Date
  vagas_totais: number | null
  vagas_por_empresa: number | null
  prazo_confirmacao: string | Date | null
  alcance: 'todos' | 'empresas' | 'tags'
  situacao: SituacaoDoEvento
  publicado_em: string | Date | null
  cancelado_em: string | Date | null
  cancelado_motivo: string | null
  total_confirmados: number
  total_lista_espera: number
  criado_em: string | Date
}

const iso = (v: string | Date | null): string | null =>
  v === null ? null : new Date(v).toISOString()
const naoEncontrado = () => new ErroApi('evento_nao_encontrado', 'Evento não encontrado.', 404)
const COLUNAS = sql`
  e.id, e.titulo, e.descricao, e.local, e.link_online, e.inicio_em, e.fim_em, e.vagas_totais, e.vagas_por_empresa,
  e.prazo_confirmacao, e.alcance::text AS alcance, e.situacao::text AS situacao, e.publicado_em, e.cancelado_em,
  e.cancelado_motivo, e.total_confirmados, e.total_lista_espera, e.criado_em`

/** Gestão da agenda do portal pela EQUIPE (`portal.agenda`). */
@Injectable()
export class EventosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private paraItem(l: LinhaDoEvento): ItemDeEvento {
    return {
      id: l.id,
      titulo: l.titulo,
      situacao: l.situacao,
      alcance: l.alcance,
      inicioEm: new Date(l.inicio_em).toISOString(),
      fimEm: new Date(l.fim_em).toISOString(),
      local: l.local,
      vagasTotais: l.vagas_totais,
      vagasPorEmpresa: l.vagas_por_empresa,
      prazoConfirmacao: iso(l.prazo_confirmacao),
      confirmados: l.total_confirmados,
      listaDeEspera: l.total_lista_espera,
    }
  }

  async listar(c: ConsultaDeEventos): Promise<ListaDeEventos> {
    const db = this.ctx.db()
    const porAba = {
      proximos: sql`e.situacao <> 'rascunho' AND e.fim_em > now()`,
      passados: sql`e.situacao <> 'rascunho' AND e.fim_em <= now()`,
      rascunhos: sql`e.situacao = 'rascunho'`,
    }
    const onde = sql`e.excluido_em IS NULL AND ${porAba[c.aba]}`
    const ordem =
      c.aba === 'passados' ? sql`e.inicio_em DESC, e.id DESC` : sql`e.inicio_em ASC, e.id ASC`
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM eventos e WHERE ${onde}`,
    )
    const linhas = await db.execute<LinhaDoEvento>(sql`
      SELECT ${COLUNAS} FROM eventos e WHERE ${onde}
      ORDER BY ${ordem} LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    const [abas] = await db.execute<{ proximos: number; passados: number; rascunhos: number }>(sql`
      SELECT count(*) FILTER (WHERE situacao <> 'rascunho' AND fim_em > now())::int AS proximos,
             count(*) FILTER (WHERE situacao <> 'rascunho' AND fim_em <= now())::int AS passados,
             count(*) FILTER (WHERE situacao = 'rascunho')::int AS rascunhos
      FROM eventos WHERE excluido_em IS NULL`)
    return {
      itens: [...linhas].map((l) => this.paraItem(l)),
      total: total?.n ?? 0,
      abas: abas ?? { proximos: 0, passados: 0, rascunhos: 0 },
    }
  }

  private async linha(id: string): Promise<LinhaDoEvento> {
    const [l] = await this.ctx
      .db()
      .execute<LinhaDoEvento>(
        sql`SELECT ${COLUNAS} FROM eventos e WHERE e.id = ${id} AND e.excluido_em IS NULL`,
      )
    if (!l) throw naoEncontrado()
    return l
  }

  async obter(id: string): Promise<Evento> {
    const l = await this.linha(id)
    const empresas = await this.ctx.db().execute<{ id: string; nome: string }>(sql`
      SELECT e.id, e.razao_social AS nome FROM evento_empresas ee
      JOIN empresas e ON e.id = ee.empresa_id WHERE ee.evento_id = ${id} ORDER BY lower(e.razao_social)`)
    return {
      ...this.paraItem(l),
      descricao: l.descricao,
      linkOnline: l.link_online,
      publicadoEm: iso(l.publicado_em),
      canceladoEm: iso(l.cancelado_em),
      canceladoMotivo: l.cancelado_motivo,
      criadoEm: new Date(l.criado_em).toISOString(),
      empresas: [...empresas],
      tags: await tagsDoAlcance(this.ctx.db(), 'evento', id),
    }
  }

  private async trocarEmpresas(id: string, d: SalvarEventoEntrada): Promise<void> {
    const db = this.ctx.db()
    await db.execute(sql`DELETE FROM evento_empresas WHERE evento_id = ${id}`)
    if (d.alcance !== 'empresas') return
    const unicas = [...new Set(d.empresaIds)]
    const validas = await db.execute<{ id: string }>(sql`
      SELECT id FROM empresas WHERE id = ANY (${`{${unicas.join(',')}}`}::uuid[]) AND excluido_em IS NULL`)
    if (validas.length !== unicas.length) {
      throw new ErroApi('empresa_invalida', 'Alguma empresa escolhida não existe.', 422)
    }
    for (const empresaId of unicas) {
      await db.execute(sql`
        INSERT INTO evento_empresas (id, tenant_id, evento_id, empresa_id)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${empresaId})`)
    }
  }

  private async trocarAudiencia(id: string, d: SalvarEventoEntrada): Promise<void> {
    await this.trocarEmpresas(id, d)
    await trocarTagsDoAlcance(this.ctx.db(), 'evento', {
      itemId: id,
      tenantId: this.ctx.tenantId,
      alcance: d.alcance,
      tagIds: d.tagIds,
      membroId: this.ctx.membro.id,
    })
  }

  async criar(d: SalvarEventoEntrada): Promise<Evento> {
    const id = novoId()
    const eu = this.ctx.membro.id
    await this.ctx.db().execute(sql`
      INSERT INTO eventos (id, tenant_id, titulo, descricao, local, link_online, inicio_em, fim_em, vagas_totais,
        vagas_por_empresa, prazo_confirmacao, alcance, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${d.titulo}, ${d.descricao}, ${d.local}, ${d.linkOnline}, ${d.inicioEm},
        ${d.fimEm}, ${d.vagasTotais}, ${d.vagasPorEmpresa}, ${d.prazoConfirmacao}, ${d.alcance}::alcance_evento,
        ${eu}, ${eu})`)
    await this.trocarAudiencia(id, d)
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { titulo: d.titulo, inicioEm: d.inicioEm, alcance: d.alcance },
    })
    return this.obter(id)
  }

  async editar(id: string, d: SalvarEventoEntrada): Promise<Evento> {
    const db = this.ctx.db()
    const [antes] = await db.execute<{ situacao: SituacaoDoEvento }>(
      sql`SELECT situacao::text AS situacao FROM eventos WHERE id = ${id} AND excluido_em IS NULL FOR UPDATE`,
    )
    if (!antes) throw naoEncontrado()
    if (antes.situacao === 'cancelado') {
      throw new ErroApi('evento_cancelado', 'Um evento cancelado não pode ser editado.', 409)
    }
    await db.execute(sql`
      UPDATE eventos SET titulo = ${d.titulo}, descricao = ${d.descricao}, local = ${d.local},
        link_online = ${d.linkOnline}, inicio_em = ${d.inicioEm}, fim_em = ${d.fimEm},
        vagas_totais = ${d.vagasTotais}, vagas_por_empresa = ${d.vagasPorEmpresa},
        prazo_confirmacao = ${d.prazoConfirmacao}, alcance = ${d.alcance}::alcance_evento,
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.trocarAudiencia(id, d)
    // Vagas a mais (ou limite da empresa maior): quem estava esperando e passou a caber é promovido
    if (antes.situacao === 'publicado') await this.promover(id)
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: id,
      acao: 'editar',
      alteracoes: { titulo: d.titulo, inicioEm: d.inicioEm, alcance: d.alcance },
    })
    return this.obter(id)
  }

  /** Promove a lista de espera e avisa quem entrou (sino e e-mail, depois do commit). */
  private async promover(eventoId: string): Promise<void> {
    const db = this.ctx.db()
    const promovidas = await db.execute<{ id: string }>(
      sql`SELECT app_evento_reprocessar_vagas(${eventoId}) AS id`,
    )
    await this.avisarPromovidas(promovidas.map((p) => p.id))
  }

  private async avisarPromovidas(ids: string[]): Promise<void> {
    for (const confirmacaoId of ids) {
      await agendarNotificacaoDeEvento(this.ctx.db(), this.ctx.tenantId, {
        tipo: 'vaga',
        confirmacaoId,
      })
    }
  }

  async publicar(id: string): Promise<Evento> {
    const db = this.ctx.db()
    const [e] = await db.execute<{ situacao: SituacaoDoEvento; inicio_em: string | Date }>(
      sql`SELECT situacao::text AS situacao, inicio_em FROM eventos WHERE id = ${id} AND excluido_em IS NULL FOR UPDATE`,
    )
    if (!e) throw naoEncontrado()
    if (e.situacao !== 'rascunho') {
      throw new ErroApi('evento_ja_publicado', 'Este evento já foi publicado.', 409)
    }
    if (new Date(e.inicio_em).getTime() <= Date.now()) {
      throw new ErroApi('inicio_no_passado', 'O início do evento já passou: ajuste a data.', 422)
    }
    await db.execute(sql`
      UPDATE eventos SET situacao = 'publicado', publicado_em = now(), atualizado_em = now(),
        atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({ entidade: 'evento', entidadeId: id, acao: 'publicar' })
    return this.obter(id)
  }

  async cancelar(id: string, d: CancelarEventoEntrada): Promise<Evento> {
    const db = this.ctx.db()
    const [e] = await db.execute<{ situacao: SituacaoDoEvento }>(
      sql`SELECT situacao::text AS situacao FROM eventos WHERE id = ${id} AND excluido_em IS NULL FOR UPDATE`,
    )
    if (!e) throw naoEncontrado()
    if (e.situacao !== 'publicado') {
      throw new ErroApi(
        'evento_nao_publicado',
        e.situacao === 'cancelado'
          ? 'Este evento já foi cancelado.'
          : 'Só se cancela um evento publicado (o rascunho se exclui).',
        409,
      )
    }
    await db.execute(sql`
      UPDATE eventos SET situacao = 'cancelado', cancelado_em = now(), cancelado_motivo = ${d.motivo},
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await agendarNotificacaoDeEvento(db, this.ctx.tenantId, { tipo: 'cancelado', eventoId: id })
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: id,
      acao: 'cancelar',
      alteracoes: { motivo: d.motivo },
    })
    return this.obter(id)
  }

  async excluir(id: string): Promise<void> {
    const db = this.ctx.db()
    const [e] = await db.execute<{ situacao: SituacaoDoEvento }>(
      sql`SELECT situacao::text AS situacao FROM eventos WHERE id = ${id} AND excluido_em IS NULL FOR UPDATE`,
    )
    if (!e) throw naoEncontrado()
    if (e.situacao === 'publicado') {
      throw new ErroApi(
        'cancele_antes_de_excluir',
        'Cancele o evento antes de excluir: assim os participantes são avisados.',
        409,
      )
    }
    await db.execute(sql`
      UPDATE eventos SET excluido_em = now(), atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({ entidade: 'evento', entidadeId: id, acao: 'excluir' })
  }

  async participantes(id: string): Promise<ListaDeParticipantes> {
    await this.linha(id)
    const linhas = await this.ctx.db().execute<{
      id: string
      pessoa: string
      email: string
      empresa: string
      situacao: SituacaoDaConfirmacao
      entrou_na_fila_em: string | Date
      confirmado_em: string | Date | null
      promovido_em: string | Date | null
    }>(sql`
      SELECT ec.id, ct.nome AS pessoa, pa.email::text AS email, coalesce(e.nome_fantasia, e.razao_social) AS empresa,
             ec.situacao::text AS situacao, ec.entrou_na_fila_em, ec.confirmado_em, ec.promovido_em
      FROM evento_confirmacoes ec
      JOIN portal_acessos pa ON pa.id = ec.acesso_id
      JOIN contatos ct ON ct.id = pa.contato_id
      JOIN empresas e ON e.id = ec.empresa_id
      WHERE ec.evento_id = ${id} AND ec.situacao <> 'cancelado'
      ORDER BY ec.situacao, ec.entrou_na_fila_em, ec.id`)
    const confirmados: ParticipanteDoEvento[] = []
    const listaDeEspera: ParticipanteDoEvento[] = []
    for (const l of linhas) {
      const base = {
        id: l.id,
        pessoa: l.pessoa,
        email: l.email,
        empresa: l.empresa,
        situacao: l.situacao,
        entrouNaFilaEm: new Date(l.entrou_na_fila_em).toISOString(),
        confirmadoEm: iso(l.confirmado_em),
        promovidoEm: iso(l.promovido_em),
      }
      if (l.situacao === 'confirmado') confirmados.push({ ...base, posicaoNaFila: null })
      else listaDeEspera.push({ ...base, posicaoNaFila: listaDeEspera.length + 1 })
    }
    return { confirmados, listaDeEspera }
  }

  /** A equipe tira uma pessoa do evento (confirmada ou na fila); quem espera é promovido e avisado. */
  async removerParticipante(
    eventoId: string,
    confirmacaoId: string,
  ): Promise<ListaDeParticipantes> {
    await this.linha(eventoId)
    const db = this.ctx.db()
    const [c] = await db.execute<{ id: string }>(sql`
      SELECT id FROM evento_confirmacoes WHERE id = ${confirmacaoId} AND evento_id = ${eventoId} AND situacao <> 'cancelado'`)
    if (!c) throw new ErroApi('participante_nao_encontrado', 'Participante não encontrado.', 404)
    const promovidas = await db.execute<{ id: string }>(
      sql`SELECT app_evento_remover_participante(${confirmacaoId}) AS id`,
    )
    await this.avisarPromovidas(promovidas.map((p) => p.id))
    await this.auditoria.registrar({
      entidade: 'evento',
      entidadeId: eventoId,
      acao: 'remover_participante',
      alteracoes: { confirmacaoId },
    })
    return this.participantes(eventoId)
  }
}
