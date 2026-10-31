import { novoId, sql } from '@leadtogo/db'
import {
  type ConfiguracaoDePush,
  type InscreverPushEntrada,
  PREFERENCIAS_PADRAO_DO_PORTAL,
  type PreferenciasDoPortal,
  type RemoverInscricaoDePushEntrada,
  type SalvarPreferenciasDoPortalEntrada,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { ErroApi } from '../http/erro-api.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'

/** Texto do erro e de toda a cadeia de causas (o Drizzle embrulha o erro do Postgres). */
const textoDoErro = (erro: unknown): string => {
  const partes: string[] = []
  for (let e = erro as { message?: string; cause?: unknown } | undefined; e;) {
    partes.push(String(e.message ?? ''))
    e = e.cause as typeof e | undefined
  }
  return partes.join(' | ')
}

/** Preferências do PRÓPRIO cliente e os aparelhos dele que recebem push. O banco já limita ao acesso da sessão. */
@Injectable()
export class PortalPreferenciasService {
  constructor(
    private readonly ctx: ContextoTenantService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  async obter(): Promise<PreferenciasDoPortal> {
    const [p] = await this.ctx.db().execute<{
      silencio_inicio: string | null
      silencio_fim: string | null
      email_chamados: boolean
      email_eventos: boolean
      email_avisos: boolean
      tema: PreferenciasDoPortal['tema']
    }>(sql`
      SELECT to_char(silencio_inicio, 'HH24:MI') AS silencio_inicio, to_char(silencio_fim, 'HH24:MI') AS silencio_fim,
             email_chamados, email_eventos, email_avisos, tema
      FROM portal_preferencias WHERE acesso_id = ${this.ctx.portal.acessoId}`)
    if (!p) return { ...PREFERENCIAS_PADRAO_DO_PORTAL }
    return {
      silencioInicio: p.silencio_inicio,
      silencioFim: p.silencio_fim,
      emailChamados: p.email_chamados,
      emailEventos: p.email_eventos,
      emailAvisos: p.email_avisos,
      tema: p.tema,
    }
  }

  /** O tema do portal (claro, escuro ou sistema), guardado para seguir a pessoa entre aparelhos. */
  async salvarTema(tema: PreferenciasDoPortal['tema']): Promise<PreferenciasDoPortal> {
    const { acessoId, tenantId } = this.ctx.portal
    await this.ctx.db().execute(sql`
      INSERT INTO portal_preferencias (id, tenant_id, acesso_id, tema)
      VALUES (${novoId()}, ${tenantId}, ${acessoId}, ${tema})
      ON CONFLICT (acesso_id) DO UPDATE SET tema = EXCLUDED.tema, atualizado_em = now()`)
    return this.obter()
  }

  async salvar(d: SalvarPreferenciasDoPortalEntrada): Promise<PreferenciasDoPortal> {
    const { acessoId, tenantId } = this.ctx.portal
    await this.ctx.db().execute(sql`
      INSERT INTO portal_preferencias (id, tenant_id, acesso_id, silencio_inicio, silencio_fim, email_chamados,
                                       email_eventos, email_avisos, tema)
      VALUES (${novoId()}, ${tenantId}, ${acessoId}, ${d.silencioInicio}::time, ${d.silencioFim}::time,
              ${d.emailChamados}, ${d.emailEventos}, ${d.emailAvisos}, ${d.tema ?? 'sistema'})
      ON CONFLICT (acesso_id) DO UPDATE SET
        silencio_inicio = EXCLUDED.silencio_inicio, silencio_fim = EXCLUDED.silencio_fim,
        email_chamados = EXCLUDED.email_chamados, email_eventos = EXCLUDED.email_eventos,
        email_avisos = EXCLUDED.email_avisos,
        tema = ${d.tema === undefined ? sql`portal_preferencias.tema` : d.tema}, atualizado_em = now()`)
    return this.obter()
  }

  // ------------------------------------------------------------------------------------------ push

  private get pushLigado(): boolean {
    return Boolean(
      this.config.VAPID_PUBLIC_KEY && this.config.VAPID_PRIVATE_KEY && this.config.VAPID_SUBJECT,
    )
  }

  async configuracaoDePush(): Promise<ConfiguracaoDePush> {
    const [n] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM portal_push_inscricoes
      WHERE acesso_id = ${this.ctx.portal.acessoId} AND revogada_em IS NULL`)
    return {
      disponivel: this.pushLigado,
      chavePublica: this.pushLigado ? (this.config.VAPID_PUBLIC_KEY ?? null) : null,
      inscricoes: n?.n ?? 0,
    }
  }

  /** O cliente aceitou receber push neste aparelho. Idempotente por endereço do aparelho. */
  async inscrever(d: InscreverPushEntrada): Promise<ConfiguracaoDePush> {
    if (!this.pushLigado) {
      throw new ErroApi('push_indisponivel', 'O envio de push ainda não está configurado.', 503)
    }
    const { acessoId, tenantId, contatoId } = this.ctx.portal
    const db = this.ctx.db()
    try {
      await db.execute(sql`
        INSERT INTO portal_push_inscricoes (id, tenant_id, acesso_id, endpoint, chave_p256dh, chave_auth)
        VALUES (${novoId()}, ${tenantId}, ${acessoId}, ${d.endpoint}, ${d.keys.p256dh}, ${d.keys.auth})
        ON CONFLICT (endpoint) DO UPDATE SET
          chave_p256dh = EXCLUDED.chave_p256dh, chave_auth = EXCLUDED.chave_auth,
          falhas = 0, revogada_em = NULL, atualizado_em = now()`)
    } catch (erro) {
      // O mesmo aparelho já recebe push de OUTRA conta (o banco não deixa uma conta mexer na inscrição de outra)
      if (/row-level security|portal_push_endpoint_uq/i.test(textoDoErro(erro))) {
        throw new ErroApi(
          'aparelho_em_uso',
          'Este aparelho já recebe avisos de outra conta. Desative lá primeiro.',
          409,
        )
      }
      throw erro
    }
    await auditarAtoDoPortal(db, {
      tenantId,
      acessoId,
      contatoId,
      acao: 'push_ativar',
      entidade: 'portal_push',
    })
    return this.configuracaoDePush()
  }

  async remover(d: RemoverInscricaoDePushEntrada): Promise<ConfiguracaoDePush> {
    await this.ctx.db().execute(sql`
      UPDATE portal_push_inscricoes SET revogada_em = now(), atualizado_em = now()
      WHERE endpoint = ${d.endpoint} AND acesso_id = ${this.ctx.portal.acessoId} AND revogada_em IS NULL`)
    return this.configuracaoDePush()
  }
}
