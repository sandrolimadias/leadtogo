import { novoId, sql } from '@leadtogo/db'
import {
  type AlterarWebhookEntrada,
  type ConsultaDeEntregas,
  type CriarWebhookEntrada,
  EVENTO_DE_TESTE,
  type EntregaDeWebhook,
  type ListaDeEntregas,
  type ListaDeWebhooks,
  type ReenvioDeEntregas,
  type Webhook,
  type WebhookCriado,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../../auditoria/auditoria.service.js'
import type { Configuracao } from '../../configuracao/configuracao.js'
import { CONFIGURACAO } from '../../configuracao/configuracao.module.js'
import { ErroApi } from '../../http/erro-api.js'
import { chavesDe, cifrar } from '../../seguranca/cifra.js'
import { conferirUrl, gerarSegredo, type PoliticaDeDestino } from './entrega.js'
import { EVENTO_ENTREGAR, montarEnvelope } from './eventos.js'

type LinhaWebhook = {
  id: string
  descricao: string
  url: string
  eventos: string[]
  ativo: boolean
  desativado_motivo: string | null
  segredo_anterior_ate: string | Date | null
  ultimo_sucesso_em: string | Date | null
  falhando_desde: string | Date | null
  criado_em: string | Date
  criado_por: string | null
  criado_por_nome: string | null
  sucesso: number
  falhou: number
  pendente: number
}

type LinhaEntrega = {
  id: string
  evento_id: string
  tipo: string
  situacao: 'pendente' | 'sucesso' | 'falhou'
  tentativas: number
  status_http: number | null
  duracao_ms: number | null
  resposta: string | null
  erro: string | null
  proxima_tentativa_em: string | Date | null
  entregue_em: string | Date | null
  criado_em: string | Date
}

const iso = (v: string | Date | null): string | null => (v ? new Date(v).toISOString() : null)

const SELECAO = sql`
  SELECT w.id, w.descricao, w.url, w.eventos, w.ativo, w.desativado_motivo,
    CASE WHEN w.segredo_anterior_ate > now() THEN w.segredo_anterior_ate END AS segredo_anterior_ate,
    w.ultimo_sucesso_em, w.falhando_desde, w.criado_em, w.criado_por, cp.nome AS criado_por_nome,
    count(e.id) FILTER (WHERE e.situacao = 'sucesso')::int AS sucesso,
    count(e.id) FILTER (WHERE e.situacao = 'falhou')::int AS falhou,
    count(e.id) FILTER (WHERE e.situacao = 'pendente')::int AS pendente
  FROM webhooks w
  LEFT JOIN membros cp ON cp.id = w.criado_por
  LEFT JOIN webhook_entregas e ON e.webhook_id = w.id AND e.criado_em > now() - interval '24 hours'`

/** A política de destino (seção 6.4 do plano): https em produção e os hosts da rede interna liberados. */
export function politicaDe(config: Configuracao): PoliticaDeDestino {
  return {
    exigirHttps: config.NODE_ENV === 'production',
    hostsInternos: config.WEBHOOK_HOSTS_INTERNOS,
  }
}

/**
 * Webhooks da empresa ativa (Configurações → Integrações → Webhooks): cadastro, teste, rotação do segredo e log
 * de entregas. O segredo só existe na resposta da criação e da rotação; no banco fica cifrado (TOKEN_ENCRYPTION_KEY).
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  async listar(): Promise<ListaDeWebhooks> {
    const linhas = await this.ctx.db().execute<LinhaWebhook>(sql`
      ${SELECAO} WHERE w.excluido_em IS NULL
      GROUP BY w.id, cp.nome ORDER BY w.criado_em DESC`)
    return { itens: linhas.map((l) => this.dto(l)) }
  }

  async criar(dados: CriarWebhookEntrada, com2fa: boolean): Promise<WebhookCriado> {
    this.exigir2fa(com2fa)
    this.conferir(dados.url)
    const id = novoId()
    const segredo = gerarSegredo()
    await this.ctx.db().execute(sql`
      INSERT INTO webhooks (id, tenant_id, descricao, url, eventos, segredo, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${dados.descricao}, ${dados.url},
        ${`{${[...new Set(dados.eventos)].join(',')}}`}::text[], ${cifrar(segredo, chavesDe(this.config))},
        ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    await this.auditoria.registrar({
      entidade: 'webhook',
      entidadeId: id,
      acao: 'criado',
      alteracoes: { descricao: dados.descricao, url: dados.url, eventos: dados.eventos },
    })
    return { webhook: await this.obter(id), segredo }
  }

  async alterar(id: string, dados: AlterarWebhookEntrada): Promise<Webhook> {
    const antes = await this.obter(id)
    if (dados.url) this.conferir(dados.url)
    await this.ctx.db().execute(sql`
      UPDATE webhooks SET
        descricao = coalesce(${dados.descricao ?? null}, descricao),
        url = coalesce(${dados.url ?? null}, url),
        eventos = coalesce(${dados.eventos ? `{${[...new Set(dados.eventos)].join(',')}}` : null}::text[], eventos),
        ativo = coalesce(${dados.ativo ?? null}::boolean, ativo),
        desativado_motivo = CASE WHEN ${dados.ativo ?? null}::boolean IS NOT NULL THEN NULL ELSE desativado_motivo END,
        falhando_desde = CASE WHEN ${dados.ativo ?? null}::boolean THEN NULL ELSE falhando_desde END,
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    const depois = await this.obter(id)
    await this.auditoria.registrar({
      entidade: 'webhook',
      entidadeId: id,
      acao: 'alterado',
      alteracoes: {
        antes: {
          descricao: antes.descricao,
          url: antes.url,
          eventos: antes.eventos,
          ativo: antes.ativo,
        },
        depois: {
          descricao: depois.descricao,
          url: depois.url,
          eventos: depois.eventos,
          ativo: depois.ativo,
        },
      },
    })
    return depois
  }

  /** Só exclui sem entregas; com entregas, desative (o log fica). */
  async excluir(id: string): Promise<void> {
    await this.obter(id)
    const [uso] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM webhook_entregas WHERE webhook_id = ${id}`)
    if ((uso?.n ?? 0) > 0) {
      throw new ErroApi(
        'webhook_com_entregas',
        'Este webhook já tem entregas no log: desative-o em vez de excluir.',
        409,
      )
    }
    await this.ctx.db().execute(sql`
      UPDATE webhooks SET excluido_em = now(), ativo = false, atualizado_por = ${this.ctx.membro.id} WHERE id = ${id}`)
    await this.auditoria.registrar({ entidade: 'webhook', entidadeId: id, acao: 'excluido' })
  }

  /** Segredo novo; o antigo continua assinando junto por 24 h (troca sem parada no destino). */
  async rotacionarSegredo(id: string, com2fa: boolean): Promise<WebhookCriado> {
    this.exigir2fa(com2fa)
    await this.obter(id)
    const segredo = gerarSegredo()
    await this.ctx.db().execute(sql`
      UPDATE webhooks SET segredo_anterior = segredo, segredo_anterior_ate = now() + interval '24 hours',
        segredo = ${cifrar(segredo, chavesDe(this.config))}, atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'webhook',
      entidadeId: id,
      acao: 'segredo_rotacionado',
    })
    return { webhook: await this.obter(id), segredo }
  }

  /** Envia o evento `webhook.teste` só para este webhook (ativo ou não). */
  async testar(id: string): Promise<EntregaDeWebhook> {
    await this.obter(id)
    const envelope = await montarEnvelope(this.ctx.db(), {
      tenantId: this.ctx.tenantId,
      tipo: EVENTO_DE_TESTE,
      membroId: this.ctx.membro.id,
      dados: { mensagem: 'Teste do webhook do Leadtogo. Se chegou, a configuração está certa.' },
    })
    const entregaId = novoId()
    await this.ctx.db().execute(sql`
      INSERT INTO webhook_entregas (id, tenant_id, webhook_id, evento_id, tipo, corpo, avulsa)
      VALUES (${entregaId}, ${this.ctx.tenantId}, ${id}, ${envelope.id}, ${EVENTO_DE_TESTE},
              ${JSON.stringify(envelope)}::jsonb, true)`)
    await this.agendarEntrega(entregaId)
    return this.entrega(id, entregaId)
  }

  async entregas(id: string, c: ConsultaDeEntregas): Promise<ListaDeEntregas> {
    await this.obter(id)
    const filtro = sql`e.webhook_id = ${id}
      ${c.situacao ? sql`AND e.situacao = ${c.situacao}` : sql``}
      ${c.tipo ? sql`AND e.tipo = ${c.tipo}` : sql``}`
    const db = this.ctx.db()
    const [total] = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM webhook_entregas e WHERE ${filtro}`)
    const linhas = await db.execute<LinhaEntrega>(sql`
      SELECT e.id, e.evento_id, e.tipo, e.situacao, e.tentativas, e.status_http, e.duracao_ms, e.resposta,
        e.erro, e.proxima_tentativa_em, e.entregue_em, e.criado_em
      FROM webhook_entregas e WHERE ${filtro}
      ORDER BY e.criado_em DESC, e.id DESC
      LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return {
      itens: linhas.map((l) => this.dtoDaEntrega(l)),
      total: total?.n ?? 0,
      pagina: c.pagina,
      porPagina: c.porPagina,
    }
  }

  /** Reenvia uma entrega (qualquer situação): volta a pendente, com as tentativas zeradas. */
  async reenviar(id: string, entregaId: string): Promise<EntregaDeWebhook> {
    await this.obter(id)
    const linhas = await this.ctx.db().execute<{ id: string }>(sql`
      UPDATE webhook_entregas SET situacao = 'pendente', tentativas = 0, proxima_tentativa_em = now(),
        erro = NULL, atualizado_em = now()
      WHERE id = ${entregaId} AND webhook_id = ${id} RETURNING id`)
    if (linhas.length === 0)
      throw new ErroApi('entrega_nao_encontrada', 'Entrega não encontrada.', 404)
    await this.agendarEntrega(entregaId)
    return this.entrega(id, entregaId)
  }

  /** Reenvia todas as entregas que falharam (no máximo 500 por vez). */
  async reenviarFalhas(id: string): Promise<ReenvioDeEntregas> {
    await this.obter(id)
    const linhas = await this.ctx.db().execute<{ id: string }>(sql`
      UPDATE webhook_entregas SET situacao = 'pendente', tentativas = 0, proxima_tentativa_em = now(),
        erro = NULL, atualizado_em = now()
      WHERE id IN (SELECT id FROM webhook_entregas WHERE webhook_id = ${id} AND situacao = 'falhou'
                   ORDER BY criado_em LIMIT 500)
      RETURNING id`)
    for (const { id: entregaId } of linhas) await this.agendarEntrega(entregaId)
    return { reenviadas: linhas.length }
  }

  // ------------------------------------------------------------------------------------------------- apoio

  /** O relay do outbox entrega à fila `webhooks` depois do commit (a API não fala com o BullMQ). */
  private async agendarEntrega(entregaId: string): Promise<void> {
    await this.ctx.db().execute(sql`
      INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
      VALUES (${novoId()}, ${this.ctx.tenantId}, ${EVENTO_ENTREGAR}, ${entregaId},
              ${JSON.stringify({ entregaId })}::jsonb)`)
  }

  private async obter(id: string): Promise<Webhook> {
    const [linha] = await this.ctx.db().execute<LinhaWebhook>(sql`
      ${SELECAO} WHERE w.id = ${id} AND w.excluido_em IS NULL GROUP BY w.id, cp.nome`)
    if (!linha) throw new ErroApi('webhook_nao_encontrado', 'Webhook não encontrado.', 404)
    return this.dto(linha)
  }

  private async entrega(id: string, entregaId: string): Promise<EntregaDeWebhook> {
    const [linha] = await this.ctx.db().execute<LinhaEntrega>(sql`
      SELECT e.id, e.evento_id, e.tipo, e.situacao, e.tentativas, e.status_http, e.duracao_ms, e.resposta,
        e.erro, e.proxima_tentativa_em, e.entregue_em, e.criado_em
      FROM webhook_entregas e WHERE e.id = ${entregaId} AND e.webhook_id = ${id}`)
    if (!linha) throw new ErroApi('entrega_nao_encontrada', 'Entrega não encontrada.', 404)
    return this.dtoDaEntrega(linha)
  }

  private conferir(url: string): void {
    const motivo = conferirUrl(url, politicaDe(this.config))
    if (motivo) {
      throw new ErroApi('url_invalida', `Endereço do webhook recusado: ${motivo}.`, 422, [
        { campo: 'url', mensagem: motivo },
      ])
    }
  }

  private exigir2fa(com2fa: boolean): void {
    if (!com2fa) {
      throw new ErroApi(
        '2fa_obrigatorio',
        'Ative a verificação em duas etapas para cadastrar webhooks e trocar o segredo.',
        403,
      )
    }
  }

  private dto(l: LinhaWebhook): Webhook {
    return {
      id: l.id,
      descricao: l.descricao,
      url: l.url,
      eventos: l.eventos,
      ativo: l.ativo,
      desativadoMotivo: l.desativado_motivo,
      segredoAnteriorAte: iso(l.segredo_anterior_ate),
      ultimoSucessoEm: iso(l.ultimo_sucesso_em),
      falhandoDesde: iso(l.falhando_desde),
      entregas24h: { sucesso: l.sucesso, falhou: l.falhou, pendente: l.pendente },
      criadoEm: new Date(l.criado_em).toISOString(),
      criadoPor: l.criado_por ? { id: l.criado_por, nome: l.criado_por_nome ?? '' } : null,
    }
  }

  private dtoDaEntrega(l: LinhaEntrega): EntregaDeWebhook {
    return {
      id: l.id,
      eventoId: l.evento_id,
      tipo: l.tipo,
      situacao: l.situacao,
      tentativas: l.tentativas,
      statusHttp: l.status_http,
      duracaoMs: l.duracao_ms,
      resposta: l.resposta,
      erro: l.erro,
      proximaTentativaEm: iso(l.proxima_tentativa_em),
      entregueEm: iso(l.entregue_em),
      criadoEm: new Date(l.criado_em).toISOString(),
    }
  }
}
