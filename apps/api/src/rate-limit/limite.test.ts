import type { Server } from 'node:http'

import { Controller, Get, type INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { Publica } from '../acesso/acesso.decorators.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { Limite } from './limite.decorator.js'
import { PREFIXO_LIMITE } from './limite.guard.js'

@Publica()
@Controller('teste-limite')
class RotasDeLimite {
  @Get()
  livre() {
    return { ok: true }
  }

  @Get('estrita')
  @Limite({ nome: 'estrita', max: 2, janelaS: 60 })
  estrita() {
    return { ok: true }
  }

  @Get('sensivel')
  @Limite({ nome: 'sensivel', max: 5, janelaS: 60, falhaFechada: true })
  sensivel() {
    return { ok: true }
  }
}

const erroDe = (r: request.Response) => r.body as RespostaDeErro

// Valkey de teste (db 1): o teste limpa só as chaves do rate limit
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
async function limparLimites() {
  const chaves = await valkey.keys(`${PREFIXO_LIMITE}*`)
  if (chaves.length > 0) await valkey.del(...chaves)
}

let app: INestApplication<Server> | undefined
async function subir(troca: Record<string, string>) {
  app = await criarAppComRotas([RotasDeLimite], configuracaoDeTeste(troca))
  return app.getHttpServer()
}

// Contador zerado antes de cada teste: não depende do que outros arquivos consumiram
beforeEach(limparLimites)
afterEach(async () => {
  await app?.close()
  app = undefined
  await limparLimites()
})
afterAll(() => valkey.quit())

describe('rate limit no Valkey', () => {
  it('passa do limite: 429 muitas_requisicoes com Retry-After e request_id', async () => {
    const servidor = await subir({ RATE_LIMIT_MAX: '3' })
    for (let i = 0; i < 3; i++) await request(servidor).get('/v1/teste-limite').expect(200)
    const r = await request(servidor).get('/v1/teste-limite').expect(429)
    expect(erroDe(r)).toMatchObject({ statusCode: 429, erro: 'muitas_requisicoes' })
    expect(erroDe(r).request_id).toBe(r.headers['x-request-id'])
    const espera = Number(r.headers['retry-after'])
    expect(espera).toBeGreaterThanOrEqual(1)
    expect(espera).toBeLessThanOrEqual(60)
  })

  it('o contador é por IP real (X-Forwarded-For com 1 proxy confiável)', async () => {
    const servidor = await subir({ RATE_LIMIT_MAX: '2', TRUST_PROXY: '1' })
    const como = (ip: string) =>
      request(servidor).get('/v1/teste-limite').set('X-Forwarded-For', ip)
    await como('203.0.113.1').expect(200)
    await como('203.0.113.1').expect(200)
    await como('203.0.113.1').expect(429)
    // outro cliente não é afetado
    await como('203.0.113.2').expect(200)
  })

  it('sem proxy confiável, X-Forwarded-For forjado não burla o limite', async () => {
    const servidor = await subir({ RATE_LIMIT_MAX: '2', TRUST_PROXY: '0' })
    await request(servidor)
      .get('/v1/teste-limite')
      .set('X-Forwarded-For', '198.51.100.1')
      .expect(200)
    await request(servidor)
      .get('/v1/teste-limite')
      .set('X-Forwarded-For', '198.51.100.2')
      .expect(200)
    await request(servidor)
      .get('/v1/teste-limite')
      .set('X-Forwarded-For', '198.51.100.3')
      .expect(429)
  })

  it('regra mais dura por rota tem contador próprio e não esgota o limite global', async () => {
    const servidor = await subir({ RATE_LIMIT_MAX: '50' })
    await request(servidor).get('/v1/teste-limite/estrita').expect(200)
    await request(servidor).get('/v1/teste-limite/estrita').expect(200)
    const r = await request(servidor).get('/v1/teste-limite/estrita').expect(429)
    expect(erroDe(r).erro).toBe('muitas_requisicoes')
    // a outra rota segue livre
    await request(servidor).get('/v1/teste-limite').expect(200)
  })

  it('a janela renova: depois do tempo, volta a aceitar', async () => {
    const servidor = await subir({ RATE_LIMIT_MAX: '1', RATE_LIMIT_JANELA_S: '1' })
    await request(servidor).get('/v1/teste-limite').expect(200)
    await request(servidor).get('/v1/teste-limite').expect(429)
    await new Promise((r) => setTimeout(r, 1200))
    await request(servidor).get('/v1/teste-limite').expect(200)
  })

  it('o /health não é limitado', async () => {
    const servidor = await subir({ RATE_LIMIT_MAX: '1' })
    for (let i = 0; i < 5; i++) await request(servidor).get('/health').expect(200)
  })

  it('guarda os contadores no Valkey, com prefixo e expiração', async () => {
    const servidor = await subir({ RATE_LIMIT_MAX: '10', RATE_LIMIT_JANELA_S: '30' })
    await request(servidor).get('/v1/teste-limite').expect(200)
    const chaves = await valkey.keys(`${PREFIXO_LIMITE}global*`)
    expect(chaves).toHaveLength(1)
    const ttl = await valkey.ttl(chaves[0] ?? '')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(30)
  })

  it('Valkey fora: a rota comum deixa passar; a sensível (falhaFechada) responde 503', async () => {
    const servidor = await subir({ REDIS_URL: 'redis://localhost:1' })
    await request(servidor).get('/v1/teste-limite').expect(200)
    const r = await request(servidor).get('/v1/teste-limite/sensivel').expect(503)
    expect(erroDe(r)).toMatchObject({ statusCode: 503, erro: 'servico_indisponivel' })
  }, 15_000)
})
