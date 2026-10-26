import type { PapelDoPortal } from '@leadtogo/shared'
import type { Request } from 'express'

/** Quem é o cliente na requisição (resolvido da sessão do portal, sempre na transação com o isolamento). */
export interface ContextoDoPortal {
  tenantId: string
  acessoId: string
  contatoId: string
  empresaId: string
  empresaNome: string
  papel: PapelDoPortal
  sessaoId: string
  nome: string
  email: string
  nomeDoPortal: string
  /** A pessoa já ligou o 2FA */
  segundoFatorAtivo: boolean
  /** O 2FA vale para ela: ligado por ela, ou exigido pela empresa ao Responsável */
  segundoFatorExigido: boolean
  /** Exigido e ainda não conferido nesta sessão */
  segundoFatorPendente: boolean
}

export type RequisicaoDoPortal = Request & {
  /** Valor bruto do cookie do portal (ainda não conferido) */
  portalCookie?: string | undefined
}
