import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

/**
 * Matriz de permissão: em cada módulo migrado para perfis de acesso, a mesma pessoa (papel legado
 * `vendedor`) leva 403 com um perfil SEM a permissão e passa com um perfil que só tem a permissão.
 * Prova que a decisão é do perfil, não do papel.
 */
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([])
})
afterEach(() => app.close())

const chamar = (metodo: 'get' | 'post', caminho: string, cookie: string, corpo?: object) =>
  request(app.getHttpServer())
    [metodo](caminho)
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send(corpo)

/** Uma pessoa (papel vendedor) numa empresa nova e um jeito de trocar o perfil dela */
async function pessoa() {
  const d = await novoDono(app)
  const u = await usuarioSimples(app)
  const membroId = await vincular(d.tenantId, u.id, 'vendedor', 'Pessoa')
  await ativar(u.id, d.tenantId)
  const usarPerfil = async (permissoes: Record<string, string | null>) => {
    const id = novoId()
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${id}, ${d.tenantId}, ${`P ${id.slice(-6)}`})`
      for (const [permissao, alcance] of Object.entries(permissoes)) {
        await tx`INSERT INTO perfil_permissoes (tenant_id, perfil_id, permissao, alcance)
          VALUES (${d.tenantId}, ${id}, ${permissao}, ${alcance}::alcance_permissao)`
      }
      await tx`UPDATE membros SET perfil_id = ${id} WHERE id = ${membroId}`
    })
  }
  return { d, u, usarPerfil }
}

describe('matriz de permissão por módulo', () => {
  it('cadastros.gerir: escrever nos cadastros auxiliares; ler é de todo membro', async () => {
    const { u, usarPerfil } = await pessoa()
    await usarPerfil({})
    expect((await chamar('get', '/v1/configuracoes/origens', u.cookie)).status).toBe(200)
    const negado = await chamar('post', '/v1/configuracoes/origens', u.cookie, { nome: 'Feira' })
    expect(negado.status).toBe(403)
    await usarPerfil({ 'cadastros.gerir': null })
    expect(
      (await chamar('post', '/v1/configuracoes/origens', u.cookie, { nome: 'Feira' })).status,
    ).toBe(201)
  })

  it('carteira.configurar e seguranca.gerir: alterar as configurações; ler é de todo membro', async () => {
    const { u, usarPerfil } = await pessoa()
    await usarPerfil({})
    for (const rota of ['/v1/configuracoes/carteira', '/v1/configuracoes/seguranca']) {
      expect((await chamar('get', rota, u.cookie)).status).toBe(200)
    }
    const carteira = () =>
      request(app.getHttpServer())
        .patch('/v1/configuracoes/carteira')
        .set('Cookie', u.cookie)
        .set('Origin', ORIGEM_DO_FRONT)
        .send({ bloquearEmpresaNaoAtiva: false })
    const seguranca = () =>
      request(app.getHttpServer())
        .patch('/v1/configuracoes/seguranca')
        .set('Cookie', u.cookie)
        .set('Origin', ORIGEM_DO_FRONT)
        .send({ doisFatoresExigido: 'admin' })
    expect((await carteira()).status).toBe(403)
    expect((await seguranca()).status).toBe(403)
    await usarPerfil({ 'carteira.configurar': null, 'seguranca.gerir': null })
    expect((await carteira()).status).toBe(200)
    expect((await seguranca()).status).toBe(200)
  })
})
