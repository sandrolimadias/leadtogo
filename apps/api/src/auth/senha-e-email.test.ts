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
  emailUnico,
  entrar,
  limparLimitesAuth,
  ORIGEM_DO_FRONT,
  SENHA_PADRAO,
} from '../testes/auth-teste.js'
import { aguardarMensagem, limparCaixa, mensagensPara, primeiroLink } from '../testes/mailpit.js'

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
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  await limparCaixa()
})
afterEach(async () => {
  await app?.close()
  app = undefined
})

const REDIRECIONAR = `${ORIGEM_DO_FRONT}/redefinir-senha`
const NOVA_SENHA = 'outra-senha-forte-456'

const pedirRedefinicao = (a: INestApplication<Server>, email: string, redirectTo = REDIRECIONAR) =>
  request(a.getHttpServer())
    .post('/v1/auth/request-password-reset')
    .set('Origin', ORIGEM_DO_FRONT)
    .send({ email, redirectTo })

/** Clica no link do e-mail (o endereço da API) e devolve o token que o Better Auth entrega ao front. */
async function tokenDoLink(a: INestApplication<Server>, link: string): Promise<string> {
  const caminho = new URL(link)
  const r = await request(a.getHttpServer())
    .get(`${caminho.pathname}${caminho.search}`)
    .redirects(0)
  expect(r.status).toBe(302)
  const destino = new URL(String(r.headers['location']))
  expect(destino.origin + destino.pathname).toBe(REDIRECIONAR)
  const token = destino.searchParams.get('token')
  expect(token).toBeTruthy()
  return token ?? ''
}

describe('recuperação de senha (e-mail pelo Mailpit)', () => {
  it('fluxo completo: pede, recebe o e-mail em pt-BR, clica, define a nova senha e entra', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a, { nome: 'Ana Souza' })
    const pedido = await pedirRedefinicao(a, email)
    expect(pedido.status).toBe(200)

    const mensagem = await aguardarMensagem(email)
    expect(mensagem.Subject).toBe('Redefinir sua senha no Leadtogo')
    expect(mensagem.Text).toContain('Olá, Ana Souza.')
    expect(mensagem.Text).toContain('1 hora')
    expect(mensagem.Text).not.toContain(SENHA_PADRAO) // o e-mail nunca leva senha

    const token = await tokenDoLink(a, primeiroLink(mensagem))
    const troca = await request(a.getHttpServer())
      .post('/v1/auth/reset-password')
      .set('Origin', ORIGEM_DO_FRONT)
      .send({ newPassword: NOVA_SENHA, token })
    expect(troca.status).toBe(200)

    expect((await entrar(a, email, SENHA_PADRAO)).status).toBe(401) // a antiga deixou de valer
    expect((await entrar(a, email, NOVA_SENHA)).status).toBe(200)
  })

  it('redefinir a senha encerra as sessões que já estavam abertas', async () => {
    const a = await subir()
    const { id, email } = await criarUsuario(a)
    const { cookie } = await entrar(a, email)
    expect(await banco`SELECT 1 FROM auth.session WHERE user_id = ${id}`).toHaveLength(1)

    await pedirRedefinicao(a, email)
    const token = await tokenDoLink(a, primeiroLink(await aguardarMensagem(email)))
    await request(a.getHttpServer())
      .post('/v1/auth/reset-password')
      .set('Origin', ORIGEM_DO_FRONT)
      .send({ newPassword: NOVA_SENHA, token })
      .expect(200)

    expect(
      (await request(a.getHttpServer()).get('/v1/auth/get-session').set('Cookie', cookie)).body,
    ).toBeNull()
    expect(await banco`SELECT 1 FROM auth.session WHERE user_id = ${id}`).toHaveLength(0)
  })

  it('o link é de uso único', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    await pedirRedefinicao(a, email)
    const token = await tokenDoLink(a, primeiroLink(await aguardarMensagem(email)))
    const trocar = (senha: string) =>
      request(a.getHttpServer())
        .post('/v1/auth/reset-password')
        .set('Origin', ORIGEM_DO_FRONT)
        .send({ newPassword: senha, token })
    expect((await trocar(NOVA_SENHA)).status).toBe(200)
    const reuso = await trocar('mais-uma-senha-789')
    expect(reuso.status).toBeGreaterThanOrEqual(400)
    expect((await entrar(a, email, NOVA_SENHA)).status).toBe(200)
  })

  it('o link expira (1 hora)', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    await pedirRedefinicao(a, email)
    const mensagem = await aguardarMensagem(email)
    const link = primeiroLink(mensagem)
    const tokenNoLink = link.split('/reset-password/')[1]?.split('?')[0] ?? ''
    await banco`UPDATE auth.verification SET expires_at = now() - interval '1 minute' WHERE identifier LIKE ${`%${tokenNoLink}%`}`
    const r = await request(a.getHttpServer())
      .get(new URL(link).pathname + new URL(link).search)
      .redirects(0)
    // expirado: o Better Auth redireciona com erro, nunca com um token utilizável
    expect(String(r.headers['location'] ?? '')).not.toMatch(/token=[^&]+$/)
  })

  it('exige a senha nova com pelo menos 10 caracteres', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    await pedirRedefinicao(a, email)
    const token = await tokenDoLink(a, primeiroLink(await aguardarMensagem(email)))
    const curta = await request(a.getHttpServer())
      .post('/v1/auth/reset-password')
      .set('Origin', ORIGEM_DO_FRONT)
      .send({ newPassword: 'curta', token })
    expect(curta.status).toBeGreaterThanOrEqual(400)
    expect((await entrar(a, email, SENHA_PADRAO)).status).toBe(200) // continua a antiga
  })

  it('e-mail desconhecido responde igual e NÃO envia nada (não revela quem tem conta)', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    const existente = await pedirRedefinicao(a, email)
    const desconhecido = emailUnico('ninguem')
    const inexistente = await pedirRedefinicao(a, desconhecido)
    expect(inexistente.status).toBe(existente.status)
    expect(inexistente.body).toEqual(existente.body)
    await aguardarMensagem(email)
    await new Promise((r) => setTimeout(r, 400))
    expect(await mensagensPara(desconhecido)).toHaveLength(0)
  })

  it('recusa redirecionar para fora do front (sem open redirect)', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    const r = await pedirRedefinicao(a, email, 'https://malicioso.example/captura')
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(await mensagensPara(email)).toHaveLength(0)
  })

  it('um link adulterado com callbackURL de fora nunca entrega o token a outro site', async () => {
    const a = await subir()
    const { email } = await criarUsuario(a)
    await pedirRedefinicao(a, email)
    const link = new URL(primeiroLink(await aguardarMensagem(email)))
    link.searchParams.set('callbackURL', 'https://malicioso.example/captura')
    const r = await request(a.getHttpServer()).get(`${link.pathname}${link.search}`).redirects(0)
    expect(String(r.headers['location'] ?? '')).not.toContain('malicioso.example')
    expect(String(r.headers['location'] ?? '')).not.toMatch(/token=/)
  })

  it('limita os pedidos: poucos por 5 minutos, depois 429', async () => {
    const a = await subir({ TRUST_PROXY: '0' })
    const { email } = await criarUsuario(a)
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) statuses.push((await pedirRedefinicao(a, email)).status)
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200])
    expect(statuses).toContain(429)
  })
})

describe('verificação de e-mail (flag ligada)', () => {
  it('quem não verificou não entra, recebe o e-mail, confirma pelo link e então entra', async () => {
    const a = await subir({ VERIFICACAO_EMAIL: 'true' })
    const { id, email } = await criarUsuario(a, { emailVerificado: false, nome: 'Bruno Lima' })

    const bloqueado = await entrar(a, email)
    expect(bloqueado.status).toBe(403)

    const mensagem = await aguardarMensagem(email) // reenviado ao tentar entrar (sendOnSignIn)
    expect(mensagem.Subject).toBe('Confirme seu e-mail no Leadtogo')
    expect(mensagem.Text).toContain('Olá, Bruno Lima.')

    const link = new URL(primeiroLink(mensagem))
    const clique = await request(a.getHttpServer())
      .get(`${link.pathname}${link.search}`)
      .redirects(0)
    expect(clique.status).toBe(302)
    const [u] = await banco<
      { email_verified: boolean }[]
    >`SELECT email_verified FROM auth."user" WHERE id = ${id}`
    expect(u?.email_verified).toBe(true)

    expect((await entrar(a, email)).status).toBe(200)
  })

  it('pode pedir um novo e-mail de confirmação, e o link de outro usuário não vale para este', async () => {
    const a = await subir({ VERIFICACAO_EMAIL: 'true' })
    const um = await criarUsuario(a, { emailVerificado: false })
    const outro = await criarUsuario(a, { emailVerificado: false })
    const reenvio = await request(a.getHttpServer())
      .post('/v1/auth/send-verification-email')
      .set('Origin', ORIGEM_DO_FRONT)
      .send({ email: um.email, callbackURL: ORIGEM_DO_FRONT })
    expect(reenvio.status).toBe(200)
    const mensagem = await aguardarMensagem(um.email)
    const link = new URL(primeiroLink(mensagem))
    await request(a.getHttpServer()).get(`${link.pathname}${link.search}`).redirects(0)
    expect((await entrar(a, um.email)).status).toBe(200)
    expect((await entrar(a, outro.email)).status).toBe(403) // o outro segue sem verificar
  })

  it('recusa callbackURL de fora no pedido de novo e-mail de confirmação', async () => {
    const a = await subir({ VERIFICACAO_EMAIL: 'true' })
    const { email } = await criarUsuario(a, { emailVerificado: false })
    const r = await request(a.getHttpServer())
      .post('/v1/auth/send-verification-email')
      .set('Origin', ORIGEM_DO_FRONT)
      .send({ email, callbackURL: 'https://malicioso.example' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(await mensagensPara(email)).toHaveLength(0)
  })

  it('a API não sobe com a verificação ligada e sem SMTP configurado', async () => {
    const { carregarConfiguracao } = await import('../configuracao/configuracao.js')
    const env = { ...process.env, VERIFICACAO_EMAIL: 'true' } as NodeJS.ProcessEnv
    delete env['SMTP_HOST']
    expect(() => carregarConfiguracao(env)).toThrow(/SMTP_HOST/)
  })
})
