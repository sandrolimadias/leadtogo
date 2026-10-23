import { type SQL, sql } from '@leadtogo/db'
import type {
  ConsultaDeNotificacoes,
  ListaDeNotificacoes,
  MarcadasComoLidas,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'

/**
 * O sino do CRM: as notificações do PRÓPRIO membro na empresa ativa (canal "sino"; as linhas de e-mail são só o
 * registro do envio). Ninguém lê nem marca a notificação de outra pessoa.
 */
@Injectable()
export class NotificacoesService {
  constructor(private readonly ctx: ContextoTenantService) {}

  private get minhas(): SQL {
    return sql`membro_id = ${this.ctx.membro.id} AND canal = 'sino'`
  }

  private async naoLidas(): Promise<number> {
    const [n] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM notificacoes WHERE ${this.minhas} AND lida_em IS NULL`)
    return n?.n ?? 0
  }

  async listar(c: ConsultaDeNotificacoes): Promise<ListaDeNotificacoes> {
    const db = this.ctx.db()
    const onde =
      c.somenteNaoLidas === 'true' ? sql`${this.minhas} AND lida_em IS NULL` : this.minhas
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM notificacoes WHERE ${onde}`,
    )
    const linhas = await db.execute<{
      id: string
      tipo: string
      titulo: string
      mensagem: string | null
      link: string | null
      chamado_id: string | null
      lida_em: string | null
      criado_em: string
    }>(sql`
      SELECT id, tipo, titulo, mensagem, link, chamado_id, lida_em, criado_em FROM notificacoes
      WHERE ${onde} ORDER BY criado_em DESC, id DESC
      LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return {
      itens: linhas.map((l) => ({
        id: l.id,
        tipo: l.tipo,
        titulo: l.titulo,
        mensagem: l.mensagem,
        link: l.link,
        chamadoId: l.chamado_id,
        lida: l.lida_em !== null,
        criadoEm: new Date(l.criado_em).toISOString(),
      })),
      total: total?.n ?? 0,
      naoLidas: await this.naoLidas(),
    }
  }

  async marcarComoLida(id: string): Promise<MarcadasComoLidas> {
    const marcadas = await this.ctx.db().execute<{ id: string }>(sql`
      UPDATE notificacoes SET lida_em = now() WHERE id = ${id} AND ${this.minhas} AND lida_em IS NULL RETURNING id`)
    if (marcadas.length === 0) {
      const [existe] = await this.ctx.db().execute<{ id: string }>(sql`
        SELECT id FROM notificacoes WHERE id = ${id} AND ${this.minhas}`)
      if (!existe)
        throw new ErroApi('notificacao_nao_encontrada', 'Notificação não encontrada.', 404)
    }
    return { marcadas: marcadas.length, naoLidas: await this.naoLidas() }
  }

  async marcarTodasComoLidas(): Promise<MarcadasComoLidas> {
    const marcadas = await this.ctx.db().execute<{ id: string }>(sql`
      UPDATE notificacoes SET lida_em = now() WHERE ${this.minhas} AND lida_em IS NULL RETURNING id`)
    return { marcadas: marcadas.length, naoLidas: 0 }
  }
}
