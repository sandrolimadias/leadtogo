import { createHmac } from 'node:crypto'

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32ParaBytes(texto: string): Buffer {
  let bits = ''
  for (const c of texto.replace(/=+$/, '').toUpperCase()) {
    const indice = ALFABETO.indexOf(c)
    if (indice < 0) throw new Error(`Caractere base32 inválido: ${c}`)
    bits += indice.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

/** Código TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 dígitos) de um segredo base32. `passo` desloca a janela. */
export function codigoTotp(segredoBase32: string, passo = 0, agora = Date.now()): string {
  const contador = Math.floor(agora / 1000 / 30) + passo
  const mensagem = Buffer.alloc(8)
  mensagem.writeBigUInt64BE(BigInt(contador))
  const hmac = createHmac('sha1', base32ParaBytes(segredoBase32)).update(mensagem).digest()
  const deslocamento = (hmac[hmac.length - 1] ?? 0) & 0x0f
  const numero =
    (((hmac[deslocamento] ?? 0) & 0x7f) << 24) |
    (((hmac[deslocamento + 1] ?? 0) & 0xff) << 16) |
    (((hmac[deslocamento + 2] ?? 0) & 0xff) << 8) |
    ((hmac[deslocamento + 3] ?? 0) & 0xff)
  return String(numero % 1_000_000).padStart(6, '0')
}

/** Segredo base32 de uma URI otpauth://totp/...?secret=XXXX. */
export function segredoDaUri(uri: string): string {
  const segredo = new URL(uri).searchParams.get('secret')
  if (!segredo) throw new Error('A URI não tem secret')
  return segredo
}
