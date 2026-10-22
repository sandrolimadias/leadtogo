import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { carregarConfiguracao } from '../configuracao/configuracao.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { dono, novoDono } from '../testes/mundo.js'

const URL_DO_MAPA = 'https://mapa.crm.exemplo.com.br/es-20261018.pmtiles'
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
})
afterEach(() => app.close())

const abrir = async (troca: Record<string, string> = {}) => {
  app = await criarAppComRotas([], configuracaoDeTeste(troca))
  return app
}

describe('GET /v1/mapa/base (de onde ler o mapa)', () => {
  it('devolve a URL pública versionada (MAPA_BASE_URL); sem sessão é 401', async () => {
    await abrir({ MAPA_BASE_URL: URL_DO_MAPA })
    expect((await request(app.getHttpServer()).get('/v1/mapa/base')).status).toBe(401)
    const d = await novoDono(app)
    const r = await request(app.getHttpServer()).get('/v1/mapa/base').set('Cookie', d.cookie)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ url: URL_DO_MAPA })
  })

  it('sem MAPA_BASE_URL (só em desenvolvimento) a URL vem nula e as opções dizem que o mapa não está instalado', async () => {
    await abrir()
    const d = await novoDono(app)
    const r = await request(app.getHttpServer()).get('/v1/mapa/base').set('Cookie', d.cookie)
    expect(r.body).toEqual({ url: null })
    const o = await request(app.getHttpServer()).get('/v1/mapa/opcoes').set('Cookie', d.cookie)
    expect((o.body as { mapaInstalado: boolean }).mapaInstalado).toBe(false)
  })

  it('com a URL configurada as opções dizem que o mapa está instalado', async () => {
    await abrir({ MAPA_BASE_URL: URL_DO_MAPA })
    const d = await novoDono(app)
    const o = await request(app.getHttpServer()).get('/v1/mapa/opcoes').set('Cookie', d.cookie)
    expect((o.body as { mapaInstalado: boolean }).mapaInstalado).toBe(true)
  })

  it('o endpoint antigo, que servia o PMTiles pela API, não existe mais', async () => {
    await abrir({ MAPA_BASE_URL: URL_DO_MAPA })
    const d = await novoDono(app)
    const r = await request(app.getHttpServer())
      .get('/v1/mapa/base.pmtiles')
      .set('Cookie', d.cookie)
      .set('Range', 'bytes=0-10')
    expect(r.status).toBe(404)
  })
})

describe('MAPA_BASE_URL na configuração', () => {
  const base = { ...process.env, LOG_LEVEL: 'silent' }

  it('é obrigatória em produção', () => {
    expect(() =>
      carregarConfiguracao({ ...base, NODE_ENV: 'production', MAPA_BASE_URL: '' }),
    ).toThrow(/MAPA_BASE_URL/)
  })

  it('em desenvolvimento é opcional e, em produção, aceita a URL do bucket', () => {
    expect(carregarConfiguracao({ ...base, NODE_ENV: 'development' }).MAPA_BASE_URL).toBeUndefined()
    expect(
      carregarConfiguracao({
        ...base,
        NODE_ENV: 'production',
        MAPA_BASE_URL: URL_DO_MAPA,
        VERIFICACAO_EMAIL: 'false',
      }).MAPA_BASE_URL,
    ).toBe(URL_DO_MAPA)
  })
})
