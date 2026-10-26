import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// TOTP (RFC 6238: HMAC-SHA1, passo de 30 s, 6 dígitos): o formato que os aplicativos autenticadores aceitam.

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PASSO_S = 30

export function novoSegredoBase32(): string {
  const bytes = randomBytes(20)
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  let texto = ''
  for (let i = 0; i + 5 <= bits.length; i += 5) texto += ALFABETO[parseInt(bits.slice(i, i + 5), 2)]
  return texto
}

function base32ParaBytes(texto: string): Buffer {
  let bits = ''
  for (const c of texto.toUpperCase()) {
    const i = ALFABETO.indexOf(c)
    if (i < 0) throw new Error('segredo base32 inválido')
    bits += i.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

function codigoDoPasso(segredo: string, contador: number): string {
  const mensagem = Buffer.alloc(8)
  mensagem.writeBigUInt64BE(BigInt(contador))
  const hmac = createHmac('sha1', base32ParaBytes(segredo)).update(mensagem).digest()
  const desvio = (hmac[hmac.length - 1] ?? 0) & 0x0f
  const numero =
    (((hmac[desvio] ?? 0) & 0x7f) << 24) |
    (((hmac[desvio + 1] ?? 0) & 0xff) << 16) |
    (((hmac[desvio + 2] ?? 0) & 0xff) << 8) |
    ((hmac[desvio + 3] ?? 0) & 0xff)
  return String(numero % 1_000_000).padStart(6, '0')
}

/** Passo (janela de 30 s) do código aceito, ou nulo. Aceita o passo anterior e o seguinte (relógio torto). */
export function passoDoCodigo(segredo: string, codigo: string, agora = Date.now()): number | null {
  if (!/^\d{6}$/.test(codigo)) return null
  const atual = Math.floor(agora / 1000 / PASSO_S)
  for (const passo of [atual, atual - 1, atual + 1]) {
    const esperado = Buffer.from(codigoDoPasso(segredo, passo))
    if (timingSafeEqual(esperado, Buffer.from(codigo))) return passo
  }
  return null
}

/** A URI que o aplicativo autenticador lê (QR code): otpauth://totp/... */
export function uriOtpauth(segredo: string, conta: string, emissor: string): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`)
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=${PASSO_S}`
}
