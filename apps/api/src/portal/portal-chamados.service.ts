import { novoId, sql } from '@leadtogo/db'
import {
  type AbrirChamadoNoPortalEntrada,
  type AvaliarChamadoEntrada,
  type ChamadoDoPortal,
  type ConsultaDeChamadosDoPortal,
  type InicioDoPortal,
  type ItemDeChamadoDoPortal,
  type ListaDeChamadosDoPortal,
  type MensagemDoPortal,
  type ResponderChamadoNoPortalEntrada,
  type StatusDoChamado,
  acoesDoCliente,
  codigoDoChamado,
  estadoNoPortal,
  PRAZO_DE_REABERTURA_DIAS,
  podeReabrir,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { agendarNotificacao } from '../chamados/notificar-chamado.js'
import { TriagemService } from '../chamados/triagem.service.js'
import { ErroApi } from '../http/erro-api.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'

type LinhaDoChamado = {
  id: string
  numero: number
  assunto: string
  descricao: string | null
  status: StatusDoChamado
  area_nome: string | null
  contato_id: string
  contato_nome: string
  criado_em: string | Date
  atualizado_em: string | Date
  primeira_resposta_em: string | Date | null
  resolvido_em: string | Date | null
  fechado_em: string | Date | null
}

const iso = (v: string | Date | null): string | null =>
  v === null ? null : new Date(v).toISOString()
const naoEncontrado = () => new ErroApi('chamado_nao_encontrado', 'Chamado não encontrado.', 404)

/** Colunas lidas: lista de permissão (nada de prioridade, responsável, prazos ou notas). */
const COLUNAS = sql`
  c.id, c.numero, c.assunto, c.descricao, c.status::text AS status, a.nome AS area_nome, c.contato_id,
  sc.nome AS contato_nome, c.criado_em, c.atualizado_em, c.primeira_resposta_em, c.resolvido_em, c.fechado_em`
const JUNCOES = sql`
  FROM chamados c
  LEFT JOIN areas_atendimento a ON a.id = c.area_id
  LEFT JOIN contatos sc ON sc.id = c.contato_id`

/**
 * Chamados vistos e feitos pelo CLIENTE (Fase 3A). A empresa-cliente e o solicitante vêm da sessão do portal,
 * nunca do pedido; o banco já limita às linhas da empresa e de origem "portal" (políticas restritivas), e as
 * consultas daqui repetem a condição de propósito (cinto e suspensório). O cliente nunca vê nota interna,
 * linha do tempo interna, prioridade, responsável, metas ou prazos.
 */
@Injectable()
export class PortalChamadosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly triagem: TriagemService,
  ) {}

  private get proprios() {
    return sql`c.empresa_cliente_id = ${this.ctx.portal.empresaId} AND c.origem = 'portal' AND c.excluido_em IS NULL`
  }

  private paraItem(l: LinhaDoChamado): ItemDeChamadoDoPortal {
    return {
      id: l.id,
      codigo: codigoDoChamado(l.numero),
      assunto: l.assunto,
      estado: estadoNoPortal(l.status),
      area: l.area_nome,
      abertoPor: l.contato_nome,
      criadoEm: new Date(l.criado_em).toISOString(),
      atualizadoEm: new Date(l.atualizado_em).toISOString(),
    }
  }

  async areas(): Promise<{ itens: { id: string; nome: string }[] }> {
    const linhas = await this.ctx.db().execute<{ id: string; nome: string }>(sql`
      SELECT id, nome FROM areas_atendimento
      WHERE ativa AND visivel_no_portal AND excluido_em IS NULL ORDER BY lower(nome)`)
    return { itens: [...linhas] }
  }

  async inicio(): Promise<InicioDoPortal> {
    const db = this.ctx.db()
    const [n] = await db.execute<{ abertos: number; aguardando: number; avaliar: number }>(sql`
      SELECT
        count(*) FILTER (WHERE c.status NOT IN ('resolvido', 'fechado'))::int AS abertos,
        count(*) FILTER (WHERE c.status = 'aguardando_cliente')::int AS aguardando,
        count(*) FILTER (WHERE c.status IN ('resolvido', 'fechado')
          AND NOT EXISTS (SELECT 1 FROM chamado_avaliacoes v WHERE v.chamado_id = c.id))::int AS avaliar
      FROM chamados c WHERE ${this.proprios}`)
    const recentes = await db.execute<LinhaDoChamado>(sql`
      SELECT ${COLUNAS} ${JUNCOES} WHERE ${this.proprios} ORDER BY c.atualizado_em DESC, c.numero DESC LIMIT 5`)
    return {
      chamadosAbertos: n?.abertos ?? 0,
      aguardandoVoce: n?.aguardando ?? 0,
      resolvidosParaAvaliar: n?.avaliar ?? 0,
      recentes: [...recentes].map((l) => this.paraItem(l)),
    }
  }

  async listar(c: ConsultaDeChamadosDoPortal): Promise<ListaDeChamadosDoPortal> {
    const db = this.ctx.db()
    const abertos = sql`c.status NOT IN ('resolvido', 'fechado')`
    const filtros = [this.proprios, c.aba === 'abertos' ? abertos : sql`true`]
    if (c.busca) {
      const numero = /^(?:ch-?)?0*(\d{1,9})$/i.exec(c.busca)?.[1]
      const termo = `%${c.busca}%`
      filtros.push(
        numero
          ? sql`(c.numero = ${Number(numero)} OR lower(f_unaccent(c.assunto)) LIKE lower(f_unaccent(${termo})))`
          : sql`lower(f_unaccent(c.assunto)) LIKE lower(f_unaccent(${termo}))`,
      )
    }
    const onde = sql.join(filtros, sql` AND `)
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM chamados c WHERE ${onde}`,
    )
    const linhas = await db.execute<LinhaDoChamado>(sql`
      SELECT ${COLUNAS} ${JUNCOES} WHERE ${onde}
      ORDER BY c.atualizado_em DESC, c.numero DESC LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    const [abas] = await db.execute<{ abertos: number; todos: number }>(sql`
      SELECT count(*) FILTER (WHERE ${abertos})::int AS abertos, count(*)::int AS todos
      FROM chamados c WHERE ${this.proprios}`)
    return {
      itens: [...linhas].map((l) => this.paraItem(l)),
      total: total?.n ?? 0,
      abas: abas ?? { abertos: 0, todos: 0 },
    }
  }

  private async linha(id: string): Promise<LinhaDoChamado> {
    const [l] = await this.ctx.db().execute<LinhaDoChamado>(sql`
      SELECT ${COLUNAS} ${JUNCOES} WHERE c.id = ${id} AND ${this.proprios}`)
    if (!l) throw naoEncontrado()
    return l
  }

  async obter(id: string): Promise<ChamadoDoPortal> {
    const l = await this.linha(id)
    const db = this.ctx.db()
    const eu = this.ctx.portal.contatoId
    const mensagens = await db.execute<{
      id: string
      autor_contato_id: string | null
      autor_nome: string
      corpo: string
      criado_em: string | Date
    }>(sql`
      SELECT m.id, m.autor_contato_id, coalesce(cc.nome, mm.nome) AS autor_nome, m.corpo, m.criado_em
      FROM chamado_mensagens m
      LEFT JOIN contatos cc ON cc.id = m.autor_contato_id
      LEFT JOIN membros mm ON mm.id = m.autor_membro_id
      WHERE m.chamado_id = ${id} AND m.excluido_em IS NULL ORDER BY m.criado_em, m.id`)
    const anexos = await db.execute<{
      id: string
      mensagem_id: string
      nome: string
      mime: string
      tamanho: number
      estado: 'pendente_varredura' | 'limpo' | 'infectado'
    }>(sql`
      SELECT id, mensagem_id, nome, mime, tamanho, estado FROM chamado_anexos
      WHERE chamado_id = ${id} AND mensagem_id IS NOT NULL AND excluido_em IS NULL ORDER BY criado_em, id`)
    const [av] = await db.execute<{
      nota: number
      comentario: string | null
      criado_em: string | Date
    }>(sql`
      SELECT nota, comentario, criado_em FROM chamado_avaliacoes WHERE chamado_id = ${id}`)

    const marcos: ChamadoDoPortal['marcos'] = [
      { tipo: 'aberto', em: new Date(l.criado_em).toISOString() },
    ]
    if (l.primeira_resposta_em) {
      marcos.push({ tipo: 'em_atendimento', em: new Date(l.primeira_resposta_em).toISOString() })
    }
    if (l.resolvido_em)
      marcos.push({ tipo: 'resolvido', em: new Date(l.resolvido_em).toISOString() })
    if (l.fechado_em) marcos.push({ tipo: 'fechado', em: new Date(l.fechado_em).toISOString() })

    return {
      ...this.paraItem(l),
      descricao: l.descricao,
      resolvidoEm: iso(l.resolvido_em),
      mensagens: [...mensagens].map((m): MensagemDoPortal => ({
        id: m.id,
        autor: {
          nome: m.autor_nome,
          daEquipe: m.autor_contato_id === null,
          voce: m.autor_contato_id === eu,
        },
        corpo: m.corpo,
        anexos: [...anexos]
          .filter((a) => a.mensagem_id === m.id)
          .map((a) => ({
            id: a.id,
            nome: a.nome,
            mime: a.mime,
            tamanho: Number(a.tamanho),
            estado: a.estado,
          })),
        criadoEm: new Date(m.criado_em).toISOString(),
      })),
      marcos,
      avaliacao: av
        ? {
            nota: av.nota,
            comentario: av.comentario,
            criadaEm: new Date(av.criado_em).toISOString(),
          }
        : null,
      acoes: acoesDoCliente(l.status, l.resolvido_em, av !== undefined),
    }
  }

  // ----------------------------------------------------------------------------------------- abrir

  private async evento(
    chamadoId: string,
    e: {
      tipo: string
      statusDe?: StatusDoChamado | null
      statusPara?: StatusDoChamado | null
      dados?: object
    },
  ): Promise<void> {
    await this.ctx.db().execute(sql`
      INSERT INTO chamado_eventos (id, tenant_id, chamado_id, tipo, ator_tipo, ator_contato_id, status_de, status_para, dados)
      VALUES (${novoId()}, ${this.ctx.tenantId}, ${chamadoId}, ${e.tipo}::tipo_evento_chamado, 'contato',
              ${this.ctx.portal.contatoId}, ${e.statusDe ?? null}::status_chamado, ${e.statusPara ?? null}::status_chamado,
              ${JSON.stringify(e.dados ?? {})}::jsonb)`)
  }

  private async avisarEquipe(
    chamadoId: string,
    tipo: 'aberto' | 'mensagem' | 'reaberto',
    mensagemId?: string,
  ): Promise<void> {
    await agendarNotificacao(this.ctx.db(), this.ctx.tenantId, {
      chamadoId,
      tipo,
      atorId: null,
      atorContatoId: this.ctx.portal.contatoId,
      ...(mensagemId ? { mensagemId } : {}),
    })
  }

  async abrir(dados: AbrirChamadoNoPortalEntrada): Promise<ChamadoDoPortal> {
    const p = this.ctx.portal
    const db = this.ctx.db()
    const areaId = dados.areaId ?? null
    let pulaTriagem = false
    if (areaId !== null) {
      const [a] = await db.execute<{ pula: boolean }>(sql`
        SELECT pula_triagem AS pula FROM areas_atendimento
        WHERE id = ${areaId} AND ativa AND visivel_no_portal AND excluido_em IS NULL`)
      if (!a) throw new ErroApi('area_invalida', 'A área não existe ou não está disponível.', 400)
      pulaTriagem = a.pula
    }
    // As mesmas regras da equipe: área desconhecida vai sempre à triagem; conhecida, só se a triagem estiver ligada
    const comTriagem = await this.triagem.ativa()
    const status: StatusDoChamado =
      areaId === null || (comTriagem && !pulaTriagem) ? 'aguardando_triagem' : 'pendente'
    // A numeração é de uma tabela que o portal só lê: passa pela função do banco (só o contador do tenant da sessão)
    const [n] = await db.execute<{ numero: number }>(
      sql`SELECT app_proximo_numero_chamado() AS numero`,
    )
    if (!n?.numero) throw new Error('empresa sem configuração')
    const id = novoId()
    await db.execute(sql`
      INSERT INTO chamados (id, tenant_id, numero, assunto, descricao, area_id, status, prioridade, origem,
        contato_id, empresa_cliente_id)
      VALUES (${id}, ${p.tenantId}, ${n.numero}, ${dados.assunto}, ${dados.descricao ?? null}, ${areaId},
        ${status}::status_chamado, 'normal', 'portal', ${p.contatoId}, ${p.empresaId})`)
    await this.evento(id, { tipo: 'aberto', statusPara: status })
    await this.avisarEquipe(id, 'aberto')
    await auditarAtoDoPortal(db, {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'chamado',
      entidadeId: id,
      acao: 'abrir_pelo_portal',
      alteracoes: { numero: n.numero, areaId },
      ip: this.ctx.ip,
    })
    return this.obter(id)
  }

  // --------------------------------------------------------------------------------------- responder

  async responder(id: string, dados: ResponderChamadoNoPortalEntrada): Promise<ChamadoDoPortal> {
    const l = await this.linha(id)
    if (l.status === 'fechado') throw new ErroApi('chamado_fechado', 'O chamado está fechado.', 409)
    if (l.status === 'resolvido') {
      throw new ErroApi(
        'chamado_resolvido',
        'O chamado está resolvido: reabra-o para responder.',
        409,
      )
    }
    const db = this.ctx.db()
    const p = this.ctx.portal
    const anexoIds = [...new Set(dados.anexoIds)]
    if (anexoIds.length > 0) {
      const [r] = await db.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM chamado_anexos
        WHERE id = ANY (${`{${anexoIds.join(',')}}`}::uuid[]) AND chamado_id = ${id}
          AND mensagem_id IS NULL AND enviado_em IS NOT NULL AND enviado_por_contato_id = ${p.contatoId}
          AND excluido_em IS NULL`)
      if (r?.n !== anexoIds.length) {
        throw new ErroApi(
          'anexo_invalido',
          'Há anexos que não foram enviados por você, já estão em outra mensagem ou não terminaram o envio.',
          400,
        )
      }
    }
    const mensagemId = novoId()
    await db.execute(sql`
      INSERT INTO chamado_mensagens (id, tenant_id, chamado_id, autor_tipo, autor_contato_id, corpo)
      VALUES (${mensagemId}, ${p.tenantId}, ${id}, 'contato', ${p.contatoId}, ${dados.corpo})`)
    if (anexoIds.length > 0) {
      await db.execute(sql`
        UPDATE chamado_anexos SET mensagem_id = ${mensagemId}, atualizado_em = now()
        WHERE id = ANY (${`{${anexoIds.join(',')}}`}::uuid[])`)
    }
    await this.evento(id, {
      tipo: 'mensagem',
      dados: { mensagemId, anexos: anexoIds.length, equipe: false },
    })
    for (const anexoId of anexoIds) {
      await this.evento(id, { tipo: 'anexo', dados: { anexoId, mensagemId } })
    }
    // Responder em "Aguardando sua resposta" devolve o chamado ao atendimento (a regra da Fase 2)
    let status = l.status
    if (l.status === 'aguardando_cliente') {
      status = 'em_atendimento'
      await this.evento(id, {
        tipo: 'status_alterado',
        statusDe: 'aguardando_cliente',
        statusPara: 'em_atendimento',
        dados: { motivo: 'resposta_do_solicitante' },
      })
    }
    await db.execute(sql`
      UPDATE chamados SET status = ${status}::status_chamado,
        status_alterado_em = CASE WHEN ${status} <> ${l.status} THEN now() ELSE status_alterado_em END,
        atualizado_em = now()
      WHERE id = ${id}`)
    await this.avisarEquipe(id, 'mensagem', mensagemId)
    return this.obter(id)
  }

  // ----------------------------------------------------------------------------------------- reabrir

  async reabrir(id: string): Promise<ChamadoDoPortal> {
    const l = await this.linha(id)
    if (l.status !== 'resolvido') {
      throw new ErroApi('nao_resolvido', 'Só um chamado resolvido pode ser reaberto.', 409)
    }
    if (!podeReabrir(l.status, l.resolvido_em)) {
      throw new ErroApi(
        'prazo_de_reabertura_vencido',
        `O prazo de ${PRAZO_DE_REABERTURA_DIAS} dias para reabrir já passou: abra um novo chamado.`,
        409,
      )
    }
    await this.ctx.db().execute(sql`
      UPDATE chamados SET status = 'em_atendimento', resolvido_em = NULL, reaberturas = reaberturas + 1,
        status_alterado_em = now(), atualizado_em = now()
      WHERE id = ${id}`)
    await this.evento(id, { tipo: 'reaberto', statusDe: 'resolvido', statusPara: 'em_atendimento' })
    await this.avisarEquipe(id, 'reaberto')
    return this.obter(id)
  }

  // ----------------------------------------------------------------------------------------- avaliar

  async avaliar(id: string, dados: AvaliarChamadoEntrada): Promise<ChamadoDoPortal> {
    const l = await this.linha(id)
    if (l.status !== 'resolvido' && l.status !== 'fechado') {
      throw new ErroApi('nao_resolvido', 'Só se avalia um chamado resolvido ou fechado.', 409)
    }
    const db = this.ctx.db()
    const [ja] = await db.execute(sql`SELECT 1 FROM chamado_avaliacoes WHERE chamado_id = ${id}`)
    if (ja) throw new ErroApi('ja_avaliado', 'Este chamado já foi avaliado.', 409)
    const p = this.ctx.portal
    await db.execute(sql`
      INSERT INTO chamado_avaliacoes (id, tenant_id, chamado_id, acesso_id, nota, comentario)
      VALUES (${novoId()}, ${p.tenantId}, ${id}, ${p.acessoId}, ${dados.nota}, ${dados.comentario ?? null})`)
    await auditarAtoDoPortal(db, {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'chamado',
      entidadeId: id,
      acao: 'avaliar',
      alteracoes: { nota: dados.nota },
      ip: this.ctx.ip,
    })
    return this.obter(id)
  }
}
