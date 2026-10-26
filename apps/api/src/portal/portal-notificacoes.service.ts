import { sql } from '@leadtogo/db'
import type { ConsultaDeNotificacoes, NotificacaoDoPortal } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'

/** O sino do cliente: as notificações do PRÓPRIO contato (canal "sino"). O banco já limita ao contato da sessão. */
@Injectable()
export class PortalNotificacoesService {
  constructor(private readonly ctx: ContextoTenantService) {}

  private get minhas() {
    return sql`destinatario_tipo = 'contato' AND contato_id = ${this.ctx.portal.contatoId} AND canal = 'sino'`
  }

  private async naoLidas(): Promise<number> {
    const [n] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM notificacoes WHERE ${this.minhas} AND lida_em IS NULL`)
    return n?.n ?? 0
  }

  async listar(
    c: ConsultaDeNotificacoes,
  ): Promise<{ itens: NotificacaoDoPortal[]; naoLidas: number }> {
    const onde =
      c.somenteNaoLidas === 'true' ? sql`${this.minhas} AND lida_em IS NULL` : this.minhas
    const linhas = await this.ctx.db().execute<{
      id: string
      tipo: string
      titulo: string
      mensagem: string | null
      link: string | null
      lida_em: string | Date | null
      criado_em: string | Date
    }>(sql`
      SELECT id, tipo, titulo, mensagem, link, lida_em, criado_em FROM notificacoes
      WHERE ${onde} ORDER BY criado_em DESC, id DESC
      LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return {
      itens: [...linhas].map((l) => ({
        id: l.id,
        tipo: l.tipo,
        titulo: l.titulo,
        corpo: l.mensagem,
        destino: l.link,
        lida: l.lida_em !== null,
        criadaEm: new Date(l.criado_em).toISOString(),
      })),
      naoLidas: await this.naoLidas(),
    }
  }

  async marcarComoLida(id: string): Promise<{ naoLidas: number }> {
    const db = this.ctx.db()
    const marcadas = await db.execute(sql`
      UPDATE notificacoes SET lida_em = now() WHERE id = ${id} AND ${this.minhas} AND lida_em IS NULL RETURNING id`)
    if (marcadas.length > 0) await this.marcarAvisosComoLidos(sql`notificacao_id = ${id}`)
    if (marcadas.length === 0) {
      const [existe] = await db.execute(
        sql`SELECT 1 FROM notificacoes WHERE id = ${id} AND ${this.minhas}`,
      )
      if (!existe)
        throw new ErroApi('notificacao_nao_encontrada', 'Notificação não encontrada.', 404)
    }
    return { naoLidas: await this.naoLidas() }
  }

  /** Ler a notificação de um aviso marca o aviso como lido (as estatísticas da equipe). O banco limita ao próprio acesso. */
  private async marcarAvisosComoLidos(onde: ReturnType<typeof sql>): Promise<void> {
    await this.ctx.db().execute(sql`
      UPDATE aviso_entregas SET lido_em = now(), atualizado_em = now()
      WHERE lido_em IS NULL AND acesso_id = ${this.ctx.portal.acessoId} AND ${onde}`)
  }

  async marcarTodasComoLidas(): Promise<{ naoLidas: number }> {
    await this.marcarAvisosComoLidos(
      sql`notificacao_id IN (SELECT id FROM notificacoes WHERE ${this.minhas} AND lida_em IS NULL)`,
    )
    await this.ctx.db().execute(sql`
      UPDATE notificacoes SET lida_em = now() WHERE ${this.minhas} AND lida_em IS NULL`)
    return { naoLidas: 0 }
  }
}
