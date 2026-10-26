import { novoId, sql } from '@leadtogo/db'
import { VALIDADE_DO_CONVITE_DIAS, VALIDADE_DO_LINK_DE_ENTRADA_MIN } from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { novoTokenDoPortal } from './portal-token.js'

export type FinalidadeDoLink = 'convite' | 'entrada' | 'troca_email'

const VALIDADE_MIN: Record<FinalidadeDoLink, number> = {
  convite: VALIDADE_DO_CONVITE_DIAS * 24 * 60,
  entrada: VALIDADE_DO_LINK_DE_ENTRADA_MIN,
  troca_email: 60,
}

/** Links de uso único do portal (convite, entrada, troca de e-mail): criação e endereço. */
@Injectable()
export class PortalLinksService {
  constructor(@Inject(CONFIGURACAO) private readonly config: Configuracao) {}

  /** O portal só existe com PORTAL_URL definida (sem ela os links não teriam para onde apontar). */
  get ligado(): boolean {
    return Boolean(this.config.PORTAL_URL)
  }

  origemDoPortal(): string {
    if (!this.config.PORTAL_URL) {
      throw new ErroApi(
        'portal_indisponivel',
        'O portal do cliente ainda não está configurado.',
        503,
      )
    }
    return new URL(this.config.PORTAL_URL).origin
  }

  /** O token vai no fragmento (`#`): não chega aos logs do servidor nem ao cabeçalho Referer. */
  enderecoDoLink(token: string): string {
    return `${this.origemDoPortal()}/acesso#${token}`
  }

  /**
   * Cria o link e devolve o token (só existe agora; o banco guarda o hash). Os links anteriores da mesma
   * finalidade, ainda não usados, deixam de valer: pedir outro cancela o anterior.
   */
  async criar(
    tx: Transacao,
    p: {
      tenantId: string
      acessoId: string
      finalidade: FinalidadeDoLink
      emailDestino?: string
      ip?: string | undefined
    },
  ): Promise<string> {
    await tx.execute(sql`
      UPDATE portal_links SET usado_em = now(), atualizado_em = now()
      WHERE acesso_id = ${p.acessoId} AND finalidade = ${p.finalidade}::finalidade_link_portal AND usado_em IS NULL`)
    const { token, hash } = novoTokenDoPortal(p.tenantId)
    await tx.execute(sql`
      INSERT INTO portal_links (id, tenant_id, acesso_id, finalidade, token_hash, email_destino, expira_em, ip)
      VALUES (${novoId()}, ${p.tenantId}, ${p.acessoId}, ${p.finalidade}::finalidade_link_portal, ${hash},
              ${p.emailDestino ?? null}, now() + ${`${VALIDADE_MIN[p.finalidade]} minutes`}::interval, ${p.ip ?? null})`)
    return token
  }
}
