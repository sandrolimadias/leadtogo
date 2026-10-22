import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import {
  bancoDeTeste,
  criarUsuario,
  emailUnico,
  entrar,
  limparLimitesAuth,
  ORIGEM_DO_FRONT,
  SENHA_PADRAO,
} from '../testes/auth-teste.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { PREFIXO_LIMITE_AUTH } from './rate-limit-valkey.js'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const banco = bancoDeTeste()
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await banco.end()
  await valkey.quit()
})

let app: INestApplication<Server> | undefined
async function subir(troca: Record<string, string> = {}) {
  app = await criarApp(configuracaoDeTeste(troca))
  await app.init()
  return app
}
beforeEach(() => limparLimitesAuth(valkey))
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('login com e-mail e senha (Better Auth)', () => {
  it('entra, devolve cookie de sessão HttpOnly/SameSite=Lax e grava a sessão no Postgres', async () => {
    const a = await subir()
    const { id, email } = await criarUsuario(a)
    const r = await entrar(a, email)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ user: { id, email, emailVerified: true } })
    // Nada de hash de senha nem segredo na resposta
    expect(JSON.stringify(r.body)).not.toMatch(/password|scrypt|secret/i)

    const cookie = r.setCookie.find((c) => c.startsWith('leadtogo.session_token='))
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).not.toMatch(/;\s*Domain=/i) // só no host da API
    expect(cookie).not.toMatch(/;\s*Secure/i) // desenvolvimento é http

    const sessoes = await banco<{ id: string; user_id: string; ip_address: string | null }[]>`
      SELECT id, user_id, ip_address FROM auth.session WHERE user_id = ${id}`
    expect(sessoes).toHaveLength(1)
    expect(sessoes[0]?.user_id).toBe(id)
  })

  it('usa UUID v7 nos ids do usuário e da sessão', async () => {
    const a = await subir()
    const { id, email } = await criarUsuario(a)
    await entrar(a, email)
    expect(id).toMatch(UUID_V7)
    const [s] = await banco<{ id: string }[]>`SELECT id FROM auth.session WHERE user_id = ${id}`
    expect(s?.id).toMatch(UUID_V7)
    const [conta] = await banco<{ id: string }[]>`SELECT id FROM auth.account WHERE user_id = ${id}`
    expect(conta?.id).toMatch(UUID_V7)
  })

  it('guarda a senha só como hash scrypt, nunca em texto', async () => {
    const a = await subir()
    const { id } = await criarUsuario(a, { senha: 'minha-senha-secreta-1' })
    const [conta] = await banco<{ password: string }[]>`
      SELECT password FROM auth.account WHERE user_id = ${id} AND provider_id = 'credential'`
    expect(conta?.password).toBeDefined()
    expect(conta?.password).not.toContain('minha-senha-secreta-1')
    expect(conta?.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/) // sal:hash do scrypt
  })

  it('get-session com o cookie devolve usuário e sessão; sem cookie, nada', async () => {
    const a = await subir()
    const { id, email } = await criarUsuario(a)
    const { cookie } = await entrar(a, email)
    const com = await request(a.getHttpServer()).get('/v1/auth/get-session').set('Cookie', cookie)
    expect(com.status).toBe(200)
    expect(com.body).toMatchObject({ user: { id, email }, session: { userId: id } })
    // a empresa ativa começa vazia (campo nosso, definido por POST /v1/sessao/empresa-ativa)
    expect(
      (com.body as { session: Record<string, unknown> }).session['empresaAtivaId'] ?? null,
    ).toBeNull()

    const sem = await request(a.getHttpServer()).get('/v1/auth/get-session')
    expect(sem.body).toBeNull()
  })

  it('senha errada e e-mail inexistente dão a MESMA resposta (não revela quem tem conta)', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    const errada = await entrar(a, email, 'senha-errada-123')
    const inexistente = await entrar(a, emailUnico('ninguem'), SENHA_PADRAO)
    expect(errada.status).toBe(401)
    expect(inexistente.status).toBe(401)
    expect(errada.body).toEqual(inexistente.body)
    expect(errada.setCookie).toHaveLength(0)
  })

  it('logout invalida a sessão: o cookie deixa de valer e a linha some do banco', async () => {
    const a = await subir()
    const { id, email } = await criarUsuario(a)
    const { cookie } = await entrar(a, email)
    await request(a.getHttpServer())
      .post('/v1/auth/sign-out')
      .set('Cookie', cookie)
      .set('Origin', ORIGEM_DO_FRONT)
      .send({})
      .expect(200)
    const depois = await request(a.getHttpServer())
      .get('/v1/auth/get-session')
      .set('Cookie', cookie)
    expect(depois.body).toBeNull()
    expect(await banco`SELECT 1 FROM auth.session WHERE user_id = ${id}`).toHaveLength(0)
  })

  it('as sessões ficam só no Postgres: o Valkey não guarda token de sessão', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    const { cookie } = await entrar(a, email)
    const token = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? ''
    expect(token.length).toBeGreaterThan(10)
    for (const chave of await valkey.keys('*')) {
      expect(chave).not.toContain(token)
      const valor = (await valkey.get(chave).catch(() => null)) ?? ''
      expect(valor).not.toContain(token)
    }
  })
})

describe('cadastro, origem e cookies', () => {
  it('o cadastro público está desligado: /sign-up/email não cria usuário', async () => {
    const a = await subir()
    const email = emailUnico('intruso')
    const r = await request(a.getHttpServer())
      .post('/v1/auth/sign-up/email')
      .set('Origin', ORIGEM_DO_FRONT)
      .send({ name: 'Intruso', email, password: SENHA_PADRAO })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(await banco`SELECT 1 FROM auth."user" WHERE email = ${email}`).toHaveLength(0)
  })

  it('recusa requisição de outra origem (proteção contra CSRF)', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    const r = await entrar(a, email, SENHA_PADRAO, 'https://malicioso.example')
    expect(r.status).toBe(403)
    expect(r.setCookie).toHaveLength(0)
  })

  it('o CORS do /v1/auth libera só o front, com credenciais', async () => {
    const a = await subir()
    const ok = await request(a.getHttpServer())
      .options('/v1/auth/sign-in/email')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
    expect(ok.status).toBe(204)
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGEM_DO_FRONT)
    expect(ok.headers['access-control-allow-credentials']).toBe('true')
    const outro = await request(a.getHttpServer())
      .options('/v1/auth/sign-in/email')
      .set('Origin', 'https://malicioso.example')
      .set('Access-Control-Request-Method', 'POST')
    expect(outro.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('em produção (front e API em domínios irmãos): cookie Secure, HttpOnly, Lax e sem Domain', async () => {
    const a = await subir({
      NODE_ENV: 'production',
      MAPA_BASE_URL: 'https://mapa.crm.exemplo.com.br/es.pmtiles',
      APP_URL: 'https://crm.aledias.com.br',
      API_URL: 'https://api.crm.aledias.com.br',
    })
    const { email } = await criarUsuario(a)
    const r = await entrar(a, email, SENHA_PADRAO, 'https://crm.aledias.com.br')
    expect(r.status).toBe(200)
    const cookie = r.setCookie.find((c) => c.includes('session_token'))
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(/^__Secure-leadtogo\.session_token=/)
    expect(cookie).toMatch(/;\s*Secure/i)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).not.toMatch(/;\s*Domain=/i)
    // CORS: o front em outro host (mesmo site) consegue chamar com credenciais
    const cors = await request(a.getHttpServer())
      .options('/v1/auth/get-session')
      .set('Origin', 'https://crm.aledias.com.br')
      .set('Access-Control-Request-Method', 'GET')
    expect(cors.headers['access-control-allow-origin']).toBe('https://crm.aledias.com.br')
    expect(cors.headers['access-control-allow-credentials']).toBe('true')
  })
})

describe('proteções de login', () => {
  it('limita tentativas de login por IP: 429 depois de algumas, com contador no Valkey', async () => {
    const a = await subir({ TRUST_PROXY: '0' })
    const { email } = await criarUsuario(a)
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await entrar(a, email, 'errada-errada-1')).status)
    expect(statuses).toContain(429)
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401])
    expect((await valkey.keys(`${PREFIXO_LIMITE_AUTH}*`)).length).toBeGreaterThan(0)
  })

  it('regras explícitas além do login: /sign-up/* também responde 429 depois de 3 tentativas por 10 s', async () => {
    const a = await subir({ TRUST_PROXY: '0' })
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) {
      const r = await request(a.getHttpServer())
        .post('/v1/auth/sign-up/email')
        .set('Origin', ORIGEM_DO_FRONT)
        .send({ name: 'Intruso', email: emailUnico('intruso'), password: SENHA_PADRAO })
      statuses.push(r.status)
    }
    expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true)
    expect(statuses.slice(3)).toEqual([429, 429])
  })

  it('/reset-password: 10 tentativas por 60 s, a 11ª responde 429', async () => {
    const a = await subir({ TRUST_PROXY: '0' })
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      const r = await request(a.getHttpServer())
        .post('/v1/auth/reset-password')
        .set('Origin', ORIGEM_DO_FRONT)
        .send({ token: 'token-que-nao-existe', newPassword: SENHA_PADRAO })
      statuses.push(r.status)
    }
    expect(statuses.slice(0, 10).includes(429)).toBe(false)
    expect(statuses[10]).toBe(429)
  })

  it('o limite é por IP real: X-Forwarded-For forjado não burla (sem proxy confiável)', async () => {
    const a = await subir({ TRUST_PROXY: '0' })
    const { email } = await criarUsuario(a)
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const r = await request(a.getHttpServer())
        .post('/v1/auth/sign-in/email')
        .set('Origin', ORIGEM_DO_FRONT)
        .set('X-Forwarded-For', `198.51.100.${i + 1}`) // um IP "novo" a cada tentativa
        .send({ email, password: 'errada-errada-1' })
      statuses.push(r.status)
    }
    expect(statuses).toContain(429)
  })

  it('com a verificação de e-mail ligada, e-mail não verificado não entra', async () => {
    const a = await subir({ VERIFICACAO_EMAIL: 'true' })
    const naoVerificado = await criarUsuario(a, { emailVerificado: false })
    const verificado = await criarUsuario(a, { emailVerificado: true })
    const bloqueado = await entrar(a, naoVerificado.email)
    expect(bloqueado.status).toBe(403)
    expect(bloqueado.setCookie.find((c) => c.includes('session_token'))).toBeUndefined()
    expect((await entrar(a, verificado.email)).status).toBe(200)
  })

  it('em desenvolvimento a verificação de e-mail é opcional (padrão desligado)', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a, { emailVerificado: false })
    expect((await entrar(a, email)).status).toBe(200)
  })

  it('criarUsuarioComSenha: senha curta é recusada e e-mail repetido dá 409', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    await expect(criarUsuario(a, { senha: 'curta' })).rejects.toThrow(/senha deve ter/)
    await expect(criarUsuario(a, { email: email.toUpperCase() })).rejects.toMatchObject({
      status: 409,
    })
  })
})
