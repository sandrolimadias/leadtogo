import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Cifra AES-256-GCM para dados sensíveis que esperam na fila (links com token nos e-mails de
 * identidade). O texto cifrado leva a versão da chave (`v1:`), para trocar a chave sem perder o que
 * ainda está na fila: a nova versão cifra, e as antigas continuam decifrando enquanto constarem aqui.
 */
export const VERSAO_ATUAL = 'v1'

export type Chaves = Record<string, Buffer>

/** Monta as chaves a partir da configuração (hoje só a v1). */
export function chavesDe(config: { TOKEN_ENCRYPTION_KEY?: string | undefined }): Chaves {
  if (!config.TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY não está definida: não é possível cifrar o conteúdo da fila',
    )
  }
  return { v1: Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'base64') }
}

/** `v1:` + base64url(iv(12) | tag(16) | texto cifrado). O IV é novo a cada chamada. */
export function cifrar(texto: string, chaves: Chaves, versao: string = VERSAO_ATUAL): string {
  const chave = chaves[versao]
  if (!chave) throw new Error(`chave de cifra desconhecida: ${versao}`)
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave, iv)
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return `${versao}:${Buffer.concat([iv, cifra.getAuthTag(), dados]).toString('base64url')}`
}

export function decifrar(cifrado: string, chaves: Chaves): string {
  const separador = cifrado.indexOf(':')
  const versao = separador > 0 ? cifrado.slice(0, separador) : ''
  const chave = chaves[versao]
  if (!chave) throw new Error('texto cifrado com versão de chave desconhecida')
  const bruto = Buffer.from(cifrado.slice(separador + 1), 'base64url')
  if (bruto.length < 28) throw new Error('texto cifrado inválido')
  const decifra = createDecipheriv('aes-256-gcm', chave, bruto.subarray(0, 12))
  decifra.setAuthTag(bruto.subarray(12, 28))
  // Falha de autenticação (adulterado ou chave errada) lança erro
  return Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]).toString('utf8')
}
