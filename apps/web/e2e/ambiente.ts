import { createHmac } from 'node:crypto'

import { type APIRequestContext, request } from '@playwright/test'
import { Redis } from 'ioredis'

import { REDIS_E2E, URL_WEB } from '../playwright.config'

export const SENHA = 'senha-forte-e2e-1'
const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8025'

let contador = 0
export const emailUnico = (rotulo: string) =>
  `e2e-${rotulo}-${Date.now().toString(36)}${(contador += 1)}@exemplo.com.br`

/** Zera os contadores de rate limit do Valkey do E2E (a API e o Better Auth), para repetir sem esperar. */
export async function limparLimites(): Promise<void> {
  const valkey = new Redis(REDIS_E2E)
  try {
    const chaves = [
      ...(await valkey.keys('leadtogo:rl:*')),
      ...(await valkey.keys('leadtogo:ba:*')),
    ]
    if (chaves.length > 0) await valkey.del(...chaves)
  } finally {
    valkey.disconnect()
  }
}

// ---------- Mailpit ----------
interface Mensagem {
  ID: string
  Created: string
}
interface MensagemCompleta {
  Subject: string
  Text: string
  HTML: string
}

/** Espera chegar um e-mail para o endereço e devolve o primeiro link dele. */
export async function linkDoEmail(
  para: string,
  ms = 20_000,
  /** Espera até haver pelo menos tantos e-mails para o endereço (o link novo, e não o antigo) */
  minimo = 1,
): Promise<{ assunto: string; link: string }> {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${para}`)}`)
    const { messages } = (await r.json()) as { messages: Mensagem[] }
    // o e-mail mais recente (a pessoa pode ter recebido mais de um)
    const primeira = [...messages].sort((x, y) => y.Created.localeCompare(x.Created))[0]
    if (primeira && messages.length >= minimo) {
      const m = (await (
        await fetch(`${MAILPIT}/api/v1/message/${primeira.ID}`)
      ).json()) as MensagemCompleta
      const achado = /https?:\/\/[^\s"<>]+/.exec(m.Text || m.HTML)
      if (!achado) throw new Error('O e-mail não tem link')
      return { assunto: m.Subject, link: achado[0] }
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Nenhum e-mail para ${para} em ${ms} ms`)
}

export async function quantosEmails(para: string): Promise<number> {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${para}`)}`)
  return ((await r.json()) as { messages: Mensagem[] }).messages.length
}

// ---------- TOTP (RFC 6238: SHA-1, 30 s, 6 dígitos) ----------
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32(texto: string): Buffer {
  let bits = ''
  for (const c of texto.replace(/=+$/, '').toUpperCase())
    bits += ALFABETO.indexOf(c).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
export function codigoTotp(chave: string, instante = Date.now()): string {
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(Math.floor(instante / 30_000)))
  const h = createHmac('sha1', base32(chave)).update(contador).digest()
  const o = h[h.length - 1]! & 0xf
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!
  return String(n % 1_000_000).padStart(6, '0')
}

// ---------- Contas pela API (a UI testa o que vem depois) ----------
export interface ContaCriada {
  email: string
  senha: string
  empresa: string
}

/** Cria conta + empresa + administrador (primeiro acesso). Ainda sem 2FA. */
export async function criarAdministrador(rotulo: string): Promise<ContaCriada> {
  const email = emailUnico(rotulo)
  const empresa = `Empresa E2E ${rotulo} ${Date.now().toString(36)}`
  const ctx = await request.newContext({ baseURL: URL_WEB })
  const r = await ctx.post('/v1/primeiro-acesso', {
    data: { nome: `Admin ${rotulo}`, email, senha: SENHA, empresa: { razaoSocial: empresa } },
  })
  if (r.status() !== 201) throw new Error(`primeiro-acesso: ${r.status()} ${await r.text()}`)
  await ctx.dispose()
  return { email, senha: SENHA, empresa }
}

/** Administrador com 2FA ativo e sessão aberta (para chamar rotas que exigem 2FA, como convidar). */
export async function administradorComSessao(rotulo: string): Promise<{
  conta: ContaCriada
  api: APIRequestContext
  chave: string
}> {
  const conta = await criarAdministrador(rotulo)
  const api = await request.newContext({ baseURL: URL_WEB, extraHTTPHeaders: { Origin: URL_WEB } })
  const entrada = await api.post('/v1/auth/sign-in/email', {
    data: { email: conta.email, password: conta.senha },
  })
  if (!entrada.ok()) throw new Error(`login: ${entrada.status()} ${await entrada.text()}`)
  const ativar = await api.post('/v1/auth/two-factor/enable', { data: { password: conta.senha } })
  const corpo = (await ativar.json()) as { totpURI?: string }
  if (!corpo.totpURI) throw new Error(`2fa/enable: ${ativar.status()} ${JSON.stringify(corpo)}`)
  const totpURI = corpo.totpURI
  const chave = new URL(totpURI).searchParams.get('secret') ?? ''
  const confirmar = await api.post('/v1/auth/two-factor/verify-totp', {
    data: { code: codigoTotp(chave) },
  })
  if (!confirmar.ok()) throw new Error(`2fa: ${confirmar.status()} ${await confirmar.text()}`)
  const me = (await (await api.get('/v1/me')).json()) as { empresas: { id: string }[] }
  const empresaId = me.empresas[0]?.id
  await api.post('/v1/sessao/empresa-ativa', { data: { empresaId } })
  return { conta, api, chave }
}

/**
 * Código TOTP para usar AGORA: se a janela de 30 s está para virar, espera a próxima (senão o código
 * pode vencer entre digitar e o servidor conferir, e o teste fica intermitente).
 */
export async function codigoValido(chave: string): Promise<string> {
  const resto = Date.now() % 30_000
  if (resto > 24_000) await new Promise((r) => setTimeout(r, 30_000 - resto + 500))
  return codigoTotp(chave)
}
