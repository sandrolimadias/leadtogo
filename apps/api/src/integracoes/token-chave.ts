import { createHash, randomBytes } from 'node:crypto'

/** `live` em produção, `test` fora dela: a chave de um ambiente não vale no outro. */
export type AmbienteDaChave = 'live' | 'test'

const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Formato do token: `ltg_<ambiente>_<segredo>`, segredo de 256 bits em base62 (43 caracteres). */
export const FORMATO_DO_TOKEN = /^ltg_(live|test)_([0-9A-Za-z]{43})$/

const base62 = (bytes: Buffer): string => {
  let n = BigInt(`0x${bytes.toString('hex')}`)
  let s = ''
  while (n > 0n) {
    s = ALFABETO[Number(n % 62n)] + s
    n /= 62n
  }
  return s.padStart(43, '0')
}

export const ambienteDe = (nodeEnv: string): AmbienteDaChave =>
  nodeEnv === 'production' ? 'live' : 'test'

/** SHA-256 (hex) do token: é o que fica no banco. A entropia de 256 bits dispensa um hash lento. */
export const hashDoTokenDaChave = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex')

/** Token novo: o valor (mostrado uma vez), o prefixo visível na tela e o hash gravado. */
export function gerarTokenDaChave(ambiente: AmbienteDaChave): {
  token: string
  prefixo: string
  hash: string
} {
  const segredo = base62(randomBytes(32)).slice(-43)
  const token = `ltg_${ambiente}_${segredo}`
  return { token, prefixo: segredo.slice(0, 8), hash: hashDoTokenDaChave(token) }
}

/** O token do cabeçalho `Authorization: Bearer ...`, se estiver no formato; senão `null`. */
export function tokenDoCabecalho(
  valor: string | undefined,
): { token: string; ambiente: AmbienteDaChave } | null {
  const m = /^Bearer\s+(\S+)$/i.exec(valor ?? '')
  const token = m?.[1]
  const formato = token ? FORMATO_DO_TOKEN.exec(token) : null
  if (!token || !formato) return null
  return { token, ambiente: formato[1] as AmbienteDaChave }
}
