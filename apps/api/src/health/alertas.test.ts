import type { Server } from 'node:http'

import { novoId, type Conexao, criarConexao } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { carregarConfiguracao } from '../configuracao/configuracao.js'
import { MonitorDoPool } from '../infra/monitor-do-pool.js'
import { FILAS } from '../worker/filas.js'
import { dono, empresaDeOutraConta } from '../testes/mundo.js'
import { tokenConfere } from './alertas.controller.js'
import { FILAS_MONITORADAS, type RelatorioAlertas } from './alertas.service.js'
import { esperarAte } from '../testes/espera.js'

// Serviços reais do `pnpm dev:up`: Postgres (leadtogo_api_test) e Valkey (db 1).
const TOKEN = 'token-de-teste-com-pelo-menos-32-caracteres-ok'
const valkey = new Redis(process.env['REDIS_URL'] ?? '', { maxRetriesPerRequest: null })
const principal: Conexao = criarConexao(process.env['DATABASE_URL'] ?? '', {
  max: 2,
  onnotice: () => {},
})

let app: INestApplication<Server> | undefined
let prefixo = ''
let n = 0

beforeEach(async () => {
  n += 1
  prefixo = `leadtogo:fila:alertas${Date.now()}-${n}`
  // eventos esgotados de outros testes não podem acender este alerta
  const pendentes = await principal.cliente<
    { id: string }[]
  >`SELECT id FROM app_listar_eventos_esgotados(500)`
  for (const e of pendentes) {
    await principal.cliente`SELECT app_tratar_evento_esgotado(${e.id}, 'descartar', 'teste')`
  }
})
afterEach(async () => {
  await app?.close()
  app = undefined
  for (const chave of await valkey.keys(`${prefixo}:*`)) await valkey.del(chave)
})
afterAll(async () => {
  await valkey.quit()
  await principal.cliente.end()
  await dono.end()
})

async function consultar(
  opcoes: {
    token?: string | null
    env?: Record<string, string>
    aoCriar?: (app: INestApplication<Server>) => void
  } = {},
) {
  const config = carregarConfiguracao({
    ...process.env,
    LOG_LEVEL: 'silent',
    FILA_PREFIXO: prefixo,
    ALERTAS_TOKEN: TOKEN,
    ...opcoes.env,
  })
  app = await criarApp(config)
  await app.init()
  opcoes.aoCriar?.(app)
  const pedido = request(app.getHttpServer()).get('/health/alertas')
  const token = opcoes.token === undefined ? TOKEN : opcoes.token
  if (token !== null) void pedido.set('X-Alertas-Token', token)
  const resposta = await pedido
  return {
    status: resposta.status,
    body: resposta.body as RelatorioAlertas,
    cabecalhos: resposta.headers,
  }
}

async function eventoEsgotado() {
  const { tenantId } = await empresaDeOutraConta()
  const id = novoId()
  await principal.cliente.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, falhou_em, tentativas) VALUES (${id}, ${tenantId}, 'teste.evento', now(), 8)`
  })
  return { id, tenantId }
}

describe('GET /health/alertas: acesso', () => {
  it('sem ALERTAS_TOKEN configurado o endpoint não existe (404)', async () => {
    const r = await consultar({ env: { ALERTAS_TOKEN: '' } })
    expect(r.status).toBe(404)
  })

  it('sem token ou com token errado: 401, sem nenhuma contagem', async () => {
    for (const token of [null, '', 'errado', `${TOKEN}x`, TOKEN.slice(1)]) {
      const r = await consultar({ token })
      expect(r.status, String(token)).toBe(401)
      expect(JSON.stringify(r.body)).not.toContain('eventos_esgotados')
      await app?.close()
      app = undefined
    }
  })

  it('a comparação do token é exata e não quebra com tamanhos diferentes', () => {
    expect(tokenConfere(TOKEN, TOKEN)).toBe(true)
    expect(tokenConfere(undefined, TOKEN)).toBe(false)
    expect(tokenConfere('', TOKEN)).toBe(false)
    expect(tokenConfere(`${TOKEN}x`, TOKEN)).toBe(false)
  })

  it('o token não é aceito por query string', async () => {
    const config = carregarConfiguracao({
      ...process.env,
      LOG_LEVEL: 'silent',
      ALERTAS_TOKEN: TOKEN,
    })
    app = await criarApp(config)
    await app.init()
    const r = await request(app.getHttpServer()).get(`/health/alertas?token=${TOKEN}`)
    expect(r.status).toBe(401)
  })
})

describe('GET /health/alertas: situação', () => {
  it('200 com tudo em dia, só contagens, sem cache', async () => {
    const r = await consultar()
    expect(r.status).toBe(200)
    expect(r.cabecalhos['cache-control']).toBe('no-store')
    expect(r.body).toEqual({
      status: 'ok',
      eventos_esgotados: 0,
      jobs_falhos: Object.fromEntries(FILAS_MONITORADAS.map((f) => [f, 0])),
      jobs_falhos_total: 0,
      limite_jobs_falhos: 1,
      pool_banco: { pico_pct: 0, limite_pct: 80 },
    })
  })

  it('503 com um evento esgotado de qualquer empresa; sem dados de tenant na resposta', async () => {
    const { id, tenantId } = await eventoEsgotado()
    const r = await consultar()
    expect(r.status).toBe(503)
    expect(r.body).toMatchObject({ status: 'alerta', eventos_esgotados: 1 })
    const texto = JSON.stringify(r.body)
    expect(texto).not.toContain(id)
    expect(texto).not.toContain(tenantId)
    expect(Object.keys(r.body).sort()).toEqual([
      'eventos_esgotados',
      'jobs_falhos',
      'jobs_falhos_total',
      'limite_jobs_falhos',
      'pool_banco',
      'status',
    ])
  })

  it('503 quando o pico do pool do banco passa de 80% (e 200 em 80%)', async () => {
    const ocupar = (n: number) => (a: INestApplication<Server>) => {
      const monitor = a.get(MonitorDoPool)
      for (let i = 0; i < n; i++) monitor.iniciar()
    }
    const env = { DB_POOL_MAX: '10' }
    const limite = await consultar({ env, aoCriar: ocupar(8) })
    expect(limite.status).toBe(200)
    expect(limite.body).toMatchObject({ pool_banco: { pico_pct: 80, limite_pct: 80 } })
    await app?.close()
    const alto = await consultar({ env, aoCriar: ocupar(9) })
    expect(alto.status).toBe(503)
    expect(alto.body).toMatchObject({ status: 'alerta', pool_banco: { pico_pct: 90 } })
  })

  it('o evento tratado (descartado) deixa de acender o alerta', async () => {
    const { id } = await eventoEsgotado()
    await principal.cliente`SELECT app_tratar_evento_esgotado(${id}, 'descartar', 'teste')`
    expect((await consultar()).status).toBe(200)
  })

  it('503 com uma falha final de job nas últimas 24 h (BullMQ de verdade) e o limite configurável', async () => {
    const fila = new Queue(FILAS.email, { connection: valkey, prefix: prefixo })
    const worker = new Worker(
      FILAS.email,
      () => {
        throw new Error('falha de teste')
      },
      { connection: valkey.duplicate(), prefix: prefixo },
    )
    try {
      await fila.add('x', {}, { attempts: 1 })
      await esperarAte(async () => (await fila.getFailedCount()) > 0)
      const r = await consultar()
      expect(r.status).toBe(503)
      expect(r.body.jobs_falhos['email']).toBe(1)
      expect(r.body.jobs_falhos_total).toBe(1)
      await app?.close()
      app = undefined
      // com o limite em 2, uma falha só não alerta
      const tolerante = await consultar({ env: { ALERTAS_LIMITE_JOBS_FALHOS: '2' } })
      expect(tolerante.status).toBe(200)
      expect(tolerante.body.jobs_falhos_total).toBe(1)
    } finally {
      await worker.close()
      await fila.obliterate({ force: true }).catch(() => undefined)
      await fila.close()
    }
  })

  it('falha antiga (mais de 24 h) e job que ainda tem tentativas não alertam', async () => {
    const antiga = Date.now() - 25 * 3600 * 1000
    await valkey.zadd(`${prefixo}:${FILAS.email}:failed`, antiga, 'job-antigo')
    expect((await consultar()).body.jobs_falhos['email']).toBe(0)
    await app?.close()
    app = undefined
    // uma falha recente na mesma chave passa a contar (a nota da chave é o finishedOn)
    await valkey.zadd(`${prefixo}:${FILAS.email}:failed`, Date.now(), 'job-recente')
    const r = await consultar()
    expect(r.status).toBe(503)
    expect(r.body.jobs_falhos['email']).toBe(1)
  })

  it('503 `erro` quando não consegue verificar (Valkey fora): o silêncio também alerta', async () => {
    const r = await consultar({ env: { REDIS_URL: 'redis://localhost:1' } })
    expect(r.status).toBe(503)
    expect(r.body.status).toBe('erro')
    expect(r.body.jobs_falhos['email']).toBeNull()
  })

  it('não aparece no OpenAPI nem sob /v1', async () => {
    const config = carregarConfiguracao({
      ...process.env,
      LOG_LEVEL: 'silent',
      ALERTAS_TOKEN: TOKEN,
    })
    app = await criarApp(config)
    await app.init()
    const r = await request(app.getHttpServer())
      .get('/v1/health/alertas')
      .set('X-Alertas-Token', TOKEN)
    expect(r.status).not.toBe(200)
  })
})
