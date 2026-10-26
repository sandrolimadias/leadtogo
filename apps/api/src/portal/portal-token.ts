import { createHash, randomBytes } from 'node:crypto'

import type { Request } from 'express'

import type { Configuracao } from '../configuracao/configuracao.js'

/**
 * Tokens do portal (link e sessão): `<tenant>.<256 bits em base64url>`. O tenant vai no valor para achar a
 * empresa antes de abrir a transação (o RLS exige o tenant); não é segredo. Só o hash SHA-256 do valor
 * inteiro fica no banco.
 */
const FORMATO =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/

export const novoTokenDoPortal = (tenantId: string): { token: string; hash: string } => {
  const token = `${tenantId}.${randomBytes(32).toString('base64url')}`
  return { token, hash: hashDoTokenDoPortal(token) }
}

export const hashDoTokenDoPortal = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

/** O tenant de dentro do token, ou nulo se o formato não for o esperado. */
export const tenantDoToken = (token: string | undefined): string | null =>
  (token !== undefined ? FORMATO.exec(token)?.[1] : undefined) ?? null

/** Nome do cookie: `__Host-` (exige Secure, Path=/ e nenhum Domain) em produção; simples fora dela. */
export const nomeDoCookieDoPortal = (config: Pick<Configuracao, 'NODE_ENV'>): string =>
  config.NODE_ENV === 'production' ? '__Host-portal' : 'portal_dev'

/** Lê um cookie do cabeçalho sem depender de um parser. */
export function lerCookie(req: Pick<Request, 'headers'>, nome: string): string | undefined {
  const cabecalho = req.headers.cookie
  if (!cabecalho) return undefined
  for (const par of cabecalho.split(';')) {
    const i = par.indexOf('=')
    if (i < 0) continue
    if (par.slice(0, i).trim() === nome) return decodeURIComponent(par.slice(i + 1).trim())
  }
  return undefined
}
