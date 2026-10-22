import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'

let app: INestApplication<Server> | undefined
async function subir(troca: Record<string, string> = {}) {
  app = await criarApp(configuracaoDeTeste(troca))
  await app.init()
  return request(app.getHttpServer())
}
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('GET /v1/primeiro-acesso/estado (público)', () => {
  it('responde { aberto: true } sem sessão quando o primeiro acesso está aberto', async () => {
    const r = await (await subir({ PRIMEIRO_ACESSO: 'aberto' })).get('/v1/primeiro-acesso/estado')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ aberto: true })
  })
  it('responde { aberto: false } quando fechado, e nada além disso', async () => {
    const r = await (await subir({ PRIMEIRO_ACESSO: 'fechado' })).get('/v1/primeiro-acesso/estado')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ aberto: false })
  })
  it('em produção o padrão é fechado (a configuração decide, não o endpoint)', async () => {
    const r = await (
      await subir({
        NODE_ENV: 'production',
        MAPA_BASE_URL: 'https://mapa.crm.exemplo.com.br/es.pmtiles',
        APP_URL: 'https://crm.exemplo.com.br',
        API_URL: 'https://api.exemplo.com.br',

        VERIFICACAO_EMAIL: 'false',
        TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      })
    ).get('/v1/primeiro-acesso/estado')
    expect(r.body).toEqual({ aberto: false })
  })
})

describe('GET /v1/acesso/opcoes (público)', () => {
  it('Google desligado por padrão', async () => {
    const r = await (await subir()).get('/v1/acesso/opcoes')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ loginGoogle: false })
  })
  it('Google ligado só com a flag e as credenciais', async () => {
    const r = await (
      await subir({ LOGIN_GOOGLE: 'true', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'segredo' })
    ).get('/v1/acesso/opcoes')
    expect(r.body).toEqual({ loginGoogle: true })
  })
})
