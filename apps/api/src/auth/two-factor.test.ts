import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import {
  bancoDeTeste,
  criarUsuario,
  entrar,
  limparLimitesAuth,
  ORIGEM_DO_FRONT,
  SENHA_PADRAO,
} from '../testes/auth-teste.js'
import { codigoTotp, segredoDaUri } from '../testes/totp.js'

const banco = bancoDeTeste()
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await banco.end()
  await valkey.quit()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarApp(configuracaoDeTeste())
  await app.init()
})
afterEach(() => app.close())

const http = () => request(app.getHttpServer())
const post = (caminho: string, cookie: string, corpo: object) =>
  http().post(caminho).set('Cookie', cookie).set('Origin', ORIGEM_DO_FRONT).send(corpo)

interface AtivacaoDe2fa {
  totpURI: string
  backupCodes: string[]
}

/** Cookie válido em um Set-Cookie de sessão (ignora o que veio apagado: valor vazio ou Max-Age=0). */
function cookieDeSessao(setCookie: string[]): string | undefined {
  return (
    setCookie
      .filter((c) => /session_token=[^;]+/.test(c) && !/Max-Age=0/i.test(c))
      .map((c) => c.split(';')[0])
      .join('; ') || undefined
  )
}

/** Usuário logado que já ativou e confirmou o 2FA (com o cookie NOVO: a confirmação gira a sessão). */
async function usuarioCom2fa() {
  const usuario = await criarUsuario(app)
  const { cookie } = await entrar(app, usuario.email)
  const ativacao = await post('/v1/auth/two-factor/enable', cookie, { password: SENHA_PADRAO })
  expect(ativacao.status).toBe(200)
  const { totpURI, backupCodes } = ativacao.body as AtivacaoDe2fa
  const segredo = segredoDaUri(totpURI)
  const verificado = await post('/v1/auth/two-factor/verify-totp', cookie, {
    code: codigoTotp(segredo),
  })
  expect(verificado.status).toBe(200)
  const cookieNovo = cookieDeSessao(
    (verificado.headers['set-cookie'] as unknown as string[] | undefined) ?? [],
  )
  expect(cookieNovo).toBeDefined()
  return {
    ...usuario,
    cookie: cookieNovo ?? '',
    cookieAntigo: cookie,
    segredo,
    backupCodes,
    totpURI,
  }
}

/** Faz o login de quem tem 2FA: devolve o cookie temporário (ainda sem sessão). */
async function loginAteO2fa(email: string) {
  const r = await entrar(app, email)
  return { ...r, pede2fa: (r.body as { twoFactorRedirect?: boolean }).twoFactorRedirect === true }
}

const temSessao = (setCookie: string[]) => cookieDeSessao(setCookie) !== undefined

describe('2FA (TOTP)', () => {
  it('ativar exige sessão e a senha do usuário', async () => {
    const { email } = await criarUsuario(app)
    const { cookie } = await entrar(app, email)
    const semSessao = await http()
      .post('/v1/auth/two-factor/enable')
      .set('Origin', ORIGEM_DO_FRONT)
      .send({ password: SENHA_PADRAO })
    expect(semSessao.status).toBe(401)
    const errada = await post('/v1/auth/two-factor/enable', cookie, {
      password: 'senha-errada-123',
    })
    expect(errada.status).toBeGreaterThanOrEqual(400)
    expect(errada.status).toBeLessThan(500)
    const semSenha = await post('/v1/auth/two-factor/enable', cookie, {})
    expect(semSenha.status).toBeGreaterThanOrEqual(400)
  })

  it('ativar devolve a URI otpauth e 10 códigos de backup; só vale depois de confirmar o código', async () => {
    const { id, email } = await criarUsuario(app)
    const { cookie } = await entrar(app, email)
    const r = await post('/v1/auth/two-factor/enable', cookie, { password: SENHA_PADRAO })
    expect(r.status).toBe(200)
    const { totpURI, backupCodes } = r.body as AtivacaoDe2fa
    expect(totpURI).toMatch(/^otpauth:\/\/totp\/Leadtogo:/)
    expect(new URL(totpURI).searchParams.get('issuer')).toBe('Leadtogo')
    expect(backupCodes).toHaveLength(10)

    // ainda não confirmado: o login segue direto
    const [antes] = await banco<
      { two_factor_enabled: boolean }[]
    >`SELECT two_factor_enabled FROM auth."user" WHERE id = ${id}`
    expect(antes?.two_factor_enabled).toBe(false)
    expect((await loginAteO2fa(email)).pede2fa).toBe(false)
  })

  it('confirmar com código errado falha; com o código certo liga o 2FA', async () => {
    const { id, email } = await criarUsuario(app)
    const { cookie } = await entrar(app, email)
    const { totpURI } = (
      await post('/v1/auth/two-factor/enable', cookie, { password: SENHA_PADRAO })
    ).body as AtivacaoDe2fa
    const segredo = segredoDaUri(totpURI)
    const errado = await post('/v1/auth/two-factor/verify-totp', cookie, { code: '000000' })
    expect(errado.status).toBeGreaterThanOrEqual(400)
    const certo = await post('/v1/auth/two-factor/verify-totp', cookie, {
      code: codigoTotp(segredo),
    })
    expect(certo.status).toBe(200)
    const [depois] = await banco<
      { two_factor_enabled: boolean }[]
    >`SELECT two_factor_enabled FROM auth."user" WHERE id = ${id}`
    expect(depois?.two_factor_enabled).toBe(true)
  })

  it('confirmar o 2FA gira a sessão: o cookie anterior deixa de valer', async () => {
    const { cookie, cookieAntigo, id } = await usuarioCom2fa()
    const antigo = await http().get('/v1/auth/get-session').set('Cookie', cookieAntigo)
    expect(antigo.body).toBeNull()
    const novo = await http().get('/v1/auth/get-session').set('Cookie', cookie)
    expect(novo.body).toMatchObject({ user: { id } })
  })

  it('o segredo e os códigos de backup ficam cifrados no banco', async () => {
    const { id, segredo, backupCodes } = await usuarioCom2fa()
    const [linha] = await banco<{ secret: string; backup_codes: string }[]>`
      SELECT secret, backup_codes FROM auth.two_factor WHERE user_id = ${id}`
    expect(linha?.secret).not.toContain(segredo)
    for (const codigo of backupCodes) expect(linha?.backup_codes).not.toContain(codigo)
  })

  it('login com 2FA: a senha sozinha não dá sessão; com o código TOTP dá', async () => {
    const { id, email, segredo } = await usuarioCom2fa()
    const etapa1 = await loginAteO2fa(email)
    expect(etapa1.status).toBe(200)
    expect(etapa1.pede2fa).toBe(true)
    expect(temSessao(etapa1.setCookie)).toBe(false)
    expect(await banco`SELECT 1 FROM auth.session WHERE user_id = ${id}`).toHaveLength(1) // só a da ativação
    // com o cookie temporário e sem o código, nenhuma sessão
    const semCodigo = await http().get('/v1/auth/get-session').set('Cookie', etapa1.cookie)
    expect(semCodigo.body).toBeNull()

    const etapa2 = await post('/v1/auth/two-factor/verify-totp', etapa1.cookie, {
      code: codigoTotp(segredo),
    })
    expect(etapa2.status).toBe(200)
    const cookiesDaSessao = (etapa2.headers['set-cookie'] as unknown as string[]) ?? []
    expect(temSessao(cookiesDaSessao)).toBe(true)
    const sessaoCookie = cookieDeSessao(cookiesDaSessao) ?? ''
    const sessao = await http().get('/v1/auth/get-session').set('Cookie', sessaoCookie)
    expect(sessao.body).toMatchObject({ user: { id, email, twoFactorEnabled: true } })
  })

  it('código errado no login não dá sessão', async () => {
    const { email, segredo } = await usuarioCom2fa()
    const etapa1 = await loginAteO2fa(email)
    const errado = await post('/v1/auth/two-factor/verify-totp', etapa1.cookie, {
      code: codigoTotp(segredo) === '123456' ? '654321' : '123456',
    })
    expect(errado.status).toBeGreaterThanOrEqual(400)
    expect(temSessao((errado.headers['set-cookie'] as unknown as string[] | undefined) ?? [])).toBe(
      false,
    )
  })

  it('código de backup entra uma vez e deixa de valer', async () => {
    const { email, backupCodes } = await usuarioCom2fa()
    const codigo = backupCodes[0] ?? ''
    const primeira = await loginAteO2fa(email)
    const ok = await post('/v1/auth/two-factor/verify-backup-code', primeira.cookie, {
      code: codigo,
    })
    expect(ok.status).toBe(200)
    expect(temSessao((ok.headers['set-cookie'] as unknown as string[] | undefined) ?? [])).toBe(
      true,
    )

    const segunda = await loginAteO2fa(email)
    const reuso = await post('/v1/auth/two-factor/verify-backup-code', segunda.cookie, {
      code: codigo,
    })
    expect(reuso.status).toBeGreaterThanOrEqual(400)
    // outro código de backup ainda funciona
    const outro = await post('/v1/auth/two-factor/verify-backup-code', segunda.cookie, {
      code: backupCodes[1] ?? '',
    })
    expect(outro.status).toBe(200)
  })

  it('força bruta dos 6 dígitos: depois de poucas tentativas erradas, 429', async () => {
    const { email, segredo } = await usuarioCom2fa()
    const etapa1 = await loginAteO2fa(email)
    const certo = codigoTotp(segredo)
    const statuses: number[] = []
    for (let i = 0; i < 8; i++) {
      const palpite = String(100000 + i)
      statuses.push(
        (
          await post('/v1/auth/two-factor/verify-totp', etapa1.cookie, {
            code: palpite === certo ? '999999' : palpite,
          })
        ).status,
      )
    }
    expect(statuses).toContain(429)
    // e o código certo também fica bloqueado enquanto o limite vale (não dá para testar palpites sem custo)
    const depois = await post('/v1/auth/two-factor/verify-totp', etapa1.cookie, { code: certo })
    expect(depois.status).toBe(429)
  })

  it('desativar exige a senha; depois o login volta a ser direto', async () => {
    const { email, cookie } = await usuarioCom2fa()
    const semSenha = await post('/v1/auth/two-factor/disable', cookie, {})
    expect(semSenha.status).toBeGreaterThanOrEqual(400)
    const errada = await post('/v1/auth/two-factor/disable', cookie, {
      password: 'senha-errada-123',
    })
    expect(errada.status).toBeGreaterThanOrEqual(400)
    const ok = await post('/v1/auth/two-factor/disable', cookie, { password: SENHA_PADRAO })
    expect(ok.status).toBe(200)
    const login = await entrar(app, email)
    expect((login.body as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBeUndefined()
    expect(temSessao(login.setCookie)).toBe(true)
  })
})
