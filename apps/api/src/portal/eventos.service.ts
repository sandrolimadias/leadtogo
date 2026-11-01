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
  publico: boolean
  formulario_inscricao_id: string | null
  formulario_avaliacao_id: string | null
  publicacao_id: string | null
  encerrado_em: string | Date | null
  checkin_exige_codigo: boolean
  checkin_ativo: boolean
  presentes: number
  avaliaram: number
}

const iso = (v: string | Date | null): string | null =>
  v === null ? null : new Date(v).toISOString()
const naoEncontrado = () => new ErroApi('evento_nao_encontrado', 'Evento não encontrado.', 404)
const COLUNAS = sql`
  e.id, e.titulo, e.descricao, e.local, e.link_online, e.inicio_em, e.fim_em, e.vagas_totais, e.vagas_por_empresa,
  e.prazo_confirmacao, e.alcance::text AS alcance, e.situacao::text AS situacao, e.publicado_em, e.cancelado_em,
  e.cancelado_motivo, e.total_confirmados, e.total_lista_espera, e.criado_em, e.publico, e.formulario_inscricao_id,
  e.formulario_avaliacao_id, e.publicacao_id, e.encerrado_em, e.checkin_exige_codigo,
  e.checkin_token_hash IS NOT NULL AS checkin_ativo,
  (SELECT count(*)::int FROM evento_confirmacoes x
    WHERE x.evento_id = e.id AND x.situacao <> 'cancelado' AND x.presenca <> 'nao_registrada') AS presentes,
  (SELECT count(*)::int FROM evento_confirmacoes x
    WHERE x.evento_id = e.id AND x.situacao <> 'cancelado' AND x.avaliacao_resposta_id IS NOT NULL) AS avaliaram`

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
      publico: l.publico,
      encerradoEm: iso(l.encerrado_em),
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
      formularioInscricaoId: l.formulario_inscricao_id,
      formularioAvaliacaoId: l.formulario_avaliacao_id,
      publicacaoId: l.publicacao_id,
      checkinExigeCodigo: l.checkin_exige_codigo,
      checkinAtivo: l.checkin_ativo,
      presentes: Number(l.presentes),
      avaliaram: Number(l.avaliaram),
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

  /** O formulário escolhido existe e tem a finalidade certa (inscrição ou avaliação de evento). */
  private async conferirFormulario(
    id: string | null,
    finalidade: 'inscricao_evento' | 'avaliacao_evento',
  ): Promise<void> {
    if (!id) return
    const [f] = await this.ctx.db().execute(sql`
      SELECT 1 FROM formularios WHERE id = ${id} AND excluido_em IS NULL
        AND finalidade = ${finalidade}::finalidade_formulario`)
    if (!f) {
      throw new ErroApi(
        'formulario_invalido',
        finalidade === 'inscricao_evento'
          ? 'Escolha um formulário com a finalidade "Inscrição em evento".'
          : 'Escolha um formulário com a finalidade "Avaliação de evento".',
        422,
      )
    }
  }

  async criar(d: SalvarEventoEntrada): Promise<Evento> {
    await this.conferirFormulario(d.formularioInscricaoId, 'inscricao_evento')
    await this.conferirFormulario(d.formularioAvaliacaoId, 'avaliacao_evento')
    const id = novoId()
    const eu = this.ctx.membro.id
    await this.ctx.db().execute(sql`
      INSERT INTO eventos (id, tenant_id, titulo, descricao, local, link_online, inicio_em, fim_em, vagas_totais,
        vagas_por_empresa, prazo_confirmacao, alcance, publico, formulario_inscricao_id, formulario_avaliacao_id,
        checkin_exige_codigo, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${d.titulo}, ${d.descricao}, ${d.local}, ${d.linkOnline}, ${d.inicioEm},
        ${d.fimEm}, ${d.vagasTotais}, ${d.vagasPorEmpresa}, ${d.prazoConfirmacao}, ${d.alcance}::alcance_evento,
        ${d.publico}, ${d.formularioInscricaoId}, ${d.formularioAvaliacaoId}, ${d.checkinExigeCodigo}, ${eu}, ${eu})`)
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
    await this.conferirFormulario(d.formularioInscricaoId, 'inscricao_evento')
    await this.conferirFormulario(d.formularioAvaliacaoId, 'avaliacao_evento')
    await db.execute(sql`
      UPDATE eventos SET titulo = ${d.titulo}, descricao = ${d.descricao}, local = ${d.local},
        link_online = ${d.linkOnline}, inicio_em = ${d.inicioEm}, fim_em = ${d.fimEm},
        vagas_totais = ${d.vagasTotais}, vagas_por_empresa = ${d.vagasPorEmpresa},
        prazo_confirmacao = ${d.prazoConfirmacao}, alcance = ${d.alcance}::alcance_evento,
        publico = ${d.publico}, formulario_inscricao_id = ${d.formularioInscricaoId},
        formulario_avaliacao_id = ${d.formularioAvaliacaoId}, checkin_exige_codigo = ${d.checkinExigeCodigo},
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.trocarAudiencia(id, d)
    await this.sincronizarPublicacao(id)
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
    await this.sincronizarPublicacao(id)
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
    await this.sincronizarPublicacao(id)
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

  /**
   * Evento publicado vira publicação (B-8): título, data, local e a descrição, com o mesmo alcance. Editar o evento
   * atualiza a publicação; cancelar marca "Evento cancelado". Rascunho não tem publicação.
   */
  private async sincronizarPublicacao(id: string): Promise<void> {
    const db = this.ctx.db()
    const l = await this.linha(id)
    if (l.situacao === 'rascunho') return
    const quando = new Date(l.inicio_em).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'short',
    })
    const titulo = (
      l.situacao === 'cancelado' ? `Evento cancelado: ${l.titulo}` : `Evento: ${l.titulo}`
    ).slice(0, 160)
    const corpo = [
      `**${quando}**${l.local ? ` · ${l.local}` : ''}`,
      l.situacao === 'cancelado' && l.cancelado_motivo ? `Cancelado: ${l.cancelado_motivo}` : null,
      l.descricao,
      l.situacao === 'cancelado' ? null : 'Inscreva-se na **Agenda** do portal.',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 10_000)
    const eu = this.ctx.membro.id
    let publicacaoId = l.publicacao_id
    if (!publicacaoId) {
      publicacaoId = novoId()
      await db.execute(sql`
        INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, alcance, publicada_em, criado_por, atualizado_por)
        VALUES (${publicacaoId}, ${this.ctx.tenantId}, ${titulo}, ${corpo}, 'publicada',
                ${l.alcance}::alcance_publicacao, now(), ${eu}, ${eu})`)
      await db.execute(sql`UPDATE eventos SET publicacao_id = ${publicacaoId} WHERE id = ${id}`)
    } else {
      await db.execute(sql`
        UPDATE publicacoes SET titulo = ${titulo}, corpo = ${corpo}, alcance = ${l.alcance}::alcance_publicacao,
          atualizado_em = now(), atualizado_por = ${eu}
        WHERE id = ${publicacaoId}`)
    }
    // O mesmo público do evento
    await db.execute(sql`DELETE FROM publicacao_empresas WHERE publicacao_id = ${publicacaoId}`)
    await db.execute(sql`DELETE FROM publicacao_tags WHERE publicacao_id = ${publicacaoId}`)
    const empresas = await db.execute<{ empresa_id: string }>(
      sql`SELECT empresa_id FROM evento_empresas WHERE evento_id = ${id}`,
    )
    for (const { empresa_id: empresaId } of empresas) {
      await db.execute(sql`
        INSERT INTO publicacao_empresas (id, tenant_id, publicacao_id, empresa_id)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${publicacaoId}, ${empresaId})`)
    }
    await db.execute(sql`
      INSERT INTO publicacao_tags (tenant_id, publicacao_id, tag_id, aplicada_por)
      SELECT tenant_id, ${publicacaoId}, tag_id, ${eu} FROM evento_tags WHERE evento_id = ${id}`)
  }

  async participantes(id: string): Promise<ListaDeParticipantes> {
    await this.linha(id)
    const linhas = await this.ctx.db().execute<{
      id: string
      pessoa: string
      email: string
      empresa: string | null
      cnpj: string | null
      origem: ParticipanteDoEvento['origem']
      situacao: SituacaoDaConfirmacao
      presenca: ParticipanteDoEvento['presenca']
      presenca_em: string | Date | null
      avaliou: boolean
      avaliacao_pedida_em: string | Date | null
      lembretes: number
      entrou_na_fila_em: string | Date
      confirmado_em: string | Date | null
      promovido_em: string | Date | null
    }>(sql`
      SELECT ec.id, coalesce(ec.nome, ct.nome, '') AS pessoa, coalesce(ec.email::text, pa.email::text, '') AS email,
             coalesce(e.nome_fantasia, e.razao_social) AS empresa, ec.cnpj, ec.origem::text AS origem,
             ec.situacao::text AS situacao, ec.presenca::text AS presenca, ec.presenca_em,
             ec.avaliacao_resposta_id IS NOT NULL AS avaliou, ec.avaliacao_pedida_em,
             ec.avaliacao_lembretes AS lembretes, ec.entrou_na_fila_em, ec.confirmado_em, ec.promovido_em
      FROM evento_confirmacoes ec
      LEFT JOIN portal_acessos pa ON pa.id = ec.acesso_id
      LEFT JOIN contatos ct ON ct.id = coalesce(ec.contato_id, pa.contato_id)
      LEFT JOIN empresas e ON e.id = ec.empresa_id
      WHERE ec.evento_id = ${id}
      ORDER BY ec.situacao, ec.entrou_na_fila_em, ec.id`)
    const confirmados: ParticipanteDoEvento[] = []
    const listaDeEspera: ParticipanteDoEvento[] = []
    const cancelados: ParticipanteDoEvento[] = []
    for (const l of linhas) {
      const base = {
        id: l.id,
        pessoa: l.pessoa,
        email: l.email,
        empresa: l.empresa,
        cnpj: l.cnpj,
        origem: l.origem,
        situacao: l.situacao,
        presenca: l.presenca,
        presencaEm: iso(l.presenca_em),
        avaliou: l.avaliou,
        avaliacaoPedidaEm: iso(l.avaliacao_pedida_em),
        lembretes: Number(l.lembretes),
        entrouNaFilaEm: new Date(l.entrou_na_fila_em).toISOString(),
        confirmadoEm: iso(l.confirmado_em),
        promovidoEm: iso(l.promovido_em),
      }
      if (l.situacao === 'confirmado') confirmados.push({ ...base, posicaoNaFila: null })
      else if (l.situacao === 'lista_espera')
        listaDeEspera.push({ ...base, posicaoNaFila: listaDeEspera.length + 1 })
      else cancelados.push({ ...base, posicaoNaFila: null })
    }
    return { confirmados, listaDeEspera, cancelados }
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
