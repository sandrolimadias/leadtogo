import type { Server } from 'node:http'

import type { MeResposta } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { entrar, limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import {
  dono,
  mudarMembro,
  mudarSituacao,
  novaEmpresa,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'

// Empresa ativa ao criar a sessão (login): a última usada; senão, a única da pessoa; senão, nenhuma
// (o /me indica `precisaEscolherEmpresa` e o front mostra o seletor).

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  for (const chave of await valkey.keys('leadtogo:rl:*')) await valkey.del(chave)
  app = await criarApp(configuracaoDeTeste({ TRUST_PROXY: '1', LOG_LEVEL: 'silent' }))
  await app.init()
})
afterEach(() => app.close())

const me = async (cookie: string) =>
  (await request(app.getHttpServer()).get('/v1/me').set('Cookie', cookie)).body as MeResposta
const trocar = (cookie: string, empresaId: string) =>
  request(app.getHttpServer())
    .post('/v1/sessao/empresa-ativa')
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send({ empresaId })
const novoLogin = async (email: string) => (await entrar(app, email)).cookie

/** Usuário (com 2FA ligado, para o /me não ser o assunto) com os vínculos dados; devolve um LOGIN NOVO. */
async function pessoaCom(tenants: string[]) {
  const u = await usuarioSimples(app)
  for (const t of tenants) await vincular(t, u.id, 'vendedor')
  return { ...u, cookie: await novoLogin(u.email) }
}

describe('empresa ativa no login', () => {
  it('uma só empresa: a sessão já nasce nela e o /me não pede escolha', async () => {
    const d = await novoDono(app)
    const sessao = await me(d.cookie)
    expect(sessao.empresaAtivaId).toBe(d.tenantId)
    expect(sessao.empresas.find((e) => e.ativa)?.id).toBe(d.tenantId)
    expect(sessao.precisaEscolherEmpresa).toBe(false)
    // e as rotas de empresa já funcionam, sem nenhuma chamada de troca
    const r = await request(app.getHttpServer()).get('/v1/membros').set('Cookie', d.cookie)
    expect(r.status).toBe(200)
  })

  it('várias empresas e nenhuma usada antes: sem empresa ativa, e o /me pede a escolha', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    const p = await pessoaCom([d.tenantId, b])
    const sessao = await me(p.cookie)
    expect(sessao.empresaAtivaId).toBeNull()
    expect(sessao.empresas).toHaveLength(2)
    expect(sessao.empresas.some((e) => e.ativa)).toBe(false)
    expect(sessao.precisaEscolherEmpresa).toBe(true)
    const r = await request(app.getHttpServer()).get('/v1/membros').set('Cookie', p.cookie)
    expect(r.status).toBe(409)
  })

  it('várias empresas e uma já usada: o próximo login (outra sessão) começa nela', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    const c = await novaEmpresa(d.contaId)
    const p = await pessoaCom([d.tenantId, b, c])
    expect((await me(p.cookie)).precisaEscolherEmpresa).toBe(true)
    expect((await trocar(p.cookie, b)).status).toBe(200)
    // sessão nova (outro aparelho, ou depois de sair): já entra na B
    const outra = await novoLogin(p.email)
    const sessao = await me(outra)
    expect(sessao.empresaAtivaId).toBe(b)
    expect(sessao.precisaEscolherEmpresa).toBe(false)
    // trocar de novo muda a "última usada"
    expect((await trocar(outra, c)).status).toBe(200)
    expect((await me(await novoLogin(p.email))).empresaAtivaId).toBe(c)
  })

  it('a última usada que foi suspensa ou perdida não vale: cai para a única que sobra, ou pede a escolha', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    const c = await novaEmpresa(d.contaId)
    const p = await pessoaCom([d.tenantId, b, c])
    await trocar(p.cookie, b)

    await mudarSituacao(b, 'suspenso') // sobram A e C: duas utilizáveis, nenhuma usada → escolher
    let sessao = await me(await novoLogin(p.email))
    expect(sessao.empresaAtivaId).toBeNull()
    expect(sessao.precisaEscolherEmpresa).toBe(true)

    await mudarMembro(c, p.id, 'excluido_em = now()') // sobra só a A → vai direto nela
    sessao = await me(await novoLogin(p.email))
    expect(sessao.empresaAtivaId).toBe(d.tenantId)
    expect(sessao.precisaEscolherEmpresa).toBe(false)
  })

  it('quem não tem empresa nenhuma fica sem empresa ativa, sem pedir escolha', async () => {
    const u = await usuarioSimples(app)
    const sessao = await me(u.cookie)
    expect(sessao.empresas).toHaveLength(0)
    expect(sessao.empresaAtivaId).toBeNull()
    expect(sessao.precisaEscolherEmpresa).toBe(false)
  })

  it('perder o vínculo com a empresa ativa no meio da sessão faz o /me pedir a escolha', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    const p = await pessoaCom([b])
    expect((await me(p.cookie)).empresaAtivaId).toBe(b)
    await mudarMembro(b, p.id, 'ativo = false')
    const outra = await vincular(d.tenantId, p.id, 'vendedor')
    expect(outra).toBeTruthy()
    const sessao = await me(p.cookie)
    expect(sessao.precisaEscolherEmpresa).toBe(true)
  })
})
