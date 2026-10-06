import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { carregarConfiguracao } from '../configuracao/configuracao.js'
import type { RelatorioSaude } from './health.service.js'

// Serviços reais do `pnpm dev:up`: Postgres (leadtogo_api_test), Valkey (db 1) e Garage.
function configuracao(troca: Record<string, string> = {}) {
  return carregarConfiguracao({ ...process.env, LOG_LEVEL: 'silent', ...troca })
}

let app: INestApplication<Server> | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

async function consultar(troca: Record<string, string> = {}) {
  app = await criarApp(configuracao(troca))
  await app.init()
  const resposta = await request(app.getHttpServer()).get('/health')
  return { status: resposta.status, body: resposta.body as RelatorioSaude }
}

describe('GET /health', () => {
  it('200 com banco, Valkey e Garage saudáveis, a versão e fora do prefixo /v1', async () => {
    const resposta = await consultar({ APP_VERSION: 'abc1234' })
    expect(resposta.status).toBe(200)
    expect(resposta.body).toMatchObject({
      status: 'ok',
      version: 'abc1234',
      checks: {
        database: { status: 'ok' },
        valkey: { status: 'ok' },
        garage: { status: 'ok' },
      },
    })
    for (const check of Object.values(resposta.body.checks)) {
      expect(check.ms).toBeGreaterThanOrEqual(0)
    }
  })

  it('503 quando o banco não responde, e os outros checks seguem ok', async () => {
    const resposta = await consultar({
      DATABASE_URL: 'postgres://leadtogo_app:senha@localhost:1/leadtogo',
    })
    expect(resposta.status).toBe(503)
    expect(resposta.body.status).toBe('erro')
    expect(resposta.body.checks).toMatchObject({
      database: { status: 'erro' },
      valkey: { status: 'ok' },
      garage: { status: 'ok' },
    })
  })

  it('503 quando o Valkey não responde', async () => {
    const resposta = await consultar({ REDIS_URL: 'redis://localhost:1' })
    expect(resposta.status).toBe(503)
    expect(resposta.body.checks).toMatchObject({
      database: { status: 'ok' },
      valkey: { status: 'erro' },
      garage: { status: 'ok' },
    })
  })

  it('503 quando o Garage não responde ou o bucket não existe', async () => {
    const semGarage = await consultar({ S3_ENDPOINT: 'http://localhost:1' })
    expect(semGarage.status).toBe(503)
    expect(semGarage.body.checks).toMatchObject({
      garage: { status: 'erro' },
      database: { status: 'ok' },
    })
    await app?.close()

    const semBucket = await consultar({ S3_BUCKET: 'bucket-que-nao-existe' })
    expect(semBucket.status).toBe(503)
    expect(semBucket.body.checks.garage.status).toBe('erro')
  })

  it('não pendura: um serviço que não responde vira erro em ~2 s', async () => {
    const inicio = Date.now()
    // 10.255.255.1 não roteia: a conexão fica esperando até o tempo limite
    const resposta = await consultar({ S3_ENDPOINT: 'http://10.255.255.1:3900' })
    expect(resposta.status).toBe(503)
    expect(resposta.body.checks.garage.status).toBe('erro')
    expect(Date.now() - inicio).toBeLessThan(5000)
  }, 10_000)

  it('não vaza detalhes do erro (host, porta, credenciais) na resposta', async () => {
    const resposta = await consultar({
      DATABASE_URL: 'postgres://leadtogo_app:senha@localhost:1/leadtogo',
      S3_ENDPOINT: 'http://localhost:1',
      REDIS_URL: 'redis://localhost:1',
    })
    const texto = JSON.stringify(resposta.body)
    for (const proibido of ['ECONNREFUSED', 'localhost', 'senha', '127.0.0.1']) {
      expect(texto).not.toContain(proibido)
    }
  })
})
