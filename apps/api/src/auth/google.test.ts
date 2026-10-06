import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import type { Auth } from './auth.factory.js'
import { AUTH } from './auth.tokens.js'
import { carregarConfiguracao, loginGoogleLigado } from '../configuracao/configuracao.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { bancoDeTeste, criarUsuario, emailUnico, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'

const banco = bancoDeTeste()
afterAll(() => banco.end())

let app: INestApplication<Server> | undefined
async function subir(troca: Record<string, string> = {}) {
  app = await criarApp(configuracaoDeTeste(troca))
  await app.init()
  return app
}
afterEach(async () => {
  await app?.close()
  app = undefined
})

const iniciarGoogle = (a: INestApplication<Server>) =>
  request(a.getHttpServer())
    .post('/v1/auth/sign-in/social')
    .set('Origin', ORIGEM_DO_FRONT)
    .send({ provider: 'google', callbackURL: ORIGEM_DO_FRONT })

describe('login com Google: preparado, mas desligado', () => {
  it('desligado (padrão): não há rota de Google, nem sem credenciais nem com credenciais mas sem a flag', async () => {
    const a = await subir()
    expect((await iniciarGoogle(a)).status).toBeGreaterThanOrEqual(400)
    expect(
      (await request(a.getHttpServer()).get('/v1/auth/callback/google?code=x&state=y').redirects(0))
        .status,
    ).toBeGreaterThanOrEqual(300)
    await app?.close()

    // credenciais presentes, flag desligada: continua desligado
    const b = await subir({
      GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'segredo',
    })
    expect(
      loginGoogleLigado(configuracaoDeTeste({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })),
    ).toBe(false)
    const r = await iniciarGoogle(b)
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(r.body)).not.toContain('accounts.google.com')
  })

  it('ligado: devolve a URL de autorização do Google, com o redirecionamento certo e sem chamar a rede', async () => {
    const a = await subir({
      LOGIN_GOOGLE: 'true',
      GOOGLE_CLIENT_ID: 'meu-cliente.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'segredo-do-cliente',
    })
    const r = await iniciarGoogle(a)
    expect(r.status).toBe(200)
    const corpo = r.body as { url?: string }
    const url = new URL(corpo.url ?? '')
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('meu-cliente.apps.googleusercontent.com')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/v1/auth/callback/google',
    )
    expect(url.searchParams.get('scope')).toContain('email')
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(url.searchParams.get('code_challenge')).toBeTruthy() // PKCE
    expect(JSON.stringify(r.body)).not.toContain('segredo-do-cliente')
  })

  it('ligado, ainda não cria conta nova: o cadastro por Google continua desligado', async () => {
    const a = await subir({
      LOGIN_GOOGLE: 'true',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 's',
    })
    const opcoes = (await a.get<Auth>(AUTH).$context).options
    expect(opcoes.socialProviders?.google?.disableSignUp).toBe(true)
    expect(opcoes.emailAndPassword?.disableSignUp).toBe(true)
    // o estado do OAuth não pode ser forjado para criar usuário: sem passar pelo Google não há conta
    const antes = (await banco<{ n: number }[]>`SELECT count(*)::int AS n FROM auth."user"`)[0]?.n
    const email = emailUnico('google')
    await request(a.getHttpServer())
      .get('/v1/auth/callback/google?code=falso&state=falso')
      .redirects(0)
    expect(await banco`SELECT 1 FROM auth."user" WHERE email = ${email}`).toHaveLength(0)
    expect((await banco<{ n: number }[]>`SELECT count(*)::int AS n FROM auth."user"`)[0]?.n).toBe(
      antes,
    )
    await criarUsuario(a) // e a criação pelo servidor segue funcionando
  })

  it('a configuração exige as credenciais quando a flag está ligada', () => {
    const base = {
      APP_URL: 'http://localhost:5173',
      API_URL: 'http://localhost:3000',
      DATABASE_URL: 'postgres://leadtogo_app:senha@localhost:5432/leadtogo',
      REDIS_URL: 'redis://localhost:6379',
      BETTER_AUTH_SECRET: 'um-segredo-de-teste-com-mais-de-32-caracteres',
      S3_ENDPOINT: 'http://localhost:3900',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY: 'a',
      S3_SECRET_KEY: 's',
      LOGIN_GOOGLE: 'true',
    }
    expect(() => carregarConfiguracao(base)).toThrow(/GOOGLE_CLIENT_ID.*obrigatória/s)
    expect(
      loginGoogleLigado(
        carregarConfiguracao({ ...base, GOOGLE_CLIENT_ID: 'i', GOOGLE_CLIENT_SECRET: 's' }),
      ),
    ).toBe(true)
  })
})
