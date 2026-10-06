import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import { Body, Controller, Get, type INestApplication, Post } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Logger, PinoLogger } from 'nestjs-pino'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { carregarConfiguracao, type Configuracao } from '../configuracao/configuracao.js'
import { ConfiguracaoModule } from '../configuracao/configuracao.module.js'
import { identificarNoLog } from './contexto-log.js'
import { LogModule } from './log.module.js'

const ambiente = {
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://leadtogo_app:senha@localhost:5432/leadtogo',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:3900',
  S3_BUCKET: 'b',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 's',
  LOG_LEVEL: 'info',
}
const config: Configuracao = carregarConfiguracao(ambiente)

type Linha = Record<string, unknown> & { msg?: string }

/** Destino de log que guarda cada linha JSON, para os testes inspecionarem. */
function capturar() {
  const linhas: Linha[] = []
  const destino = new Writable({
    write(pedaco, _codificacao, pronto) {
      for (const texto of String(pedaco).split('\n').filter(Boolean))
        linhas.push(JSON.parse(texto) as Linha)
      pronto()
    },
  })
  return { linhas, destino }
}

@Controller('teste-log')
class RotaDeTeste {
  constructor(private readonly log: PinoLogger) {}

  @Get()
  rota() {
    // O que os guards do tenant e da sessão farão
    identificarNoLog({ tenantId: 'tenant-123', userId: 'usuario-456' })
    this.log.info('dentro da rota')
    return { ok: true }
  }

  @Post()
  corpo(@Body() corpo: unknown) {
    this.log.info({ corpo }, 'recebido')
    return { ok: true }
  }
}

describe('logs estruturados (Pino)', () => {
  let app: INestApplication<Server>
  const { linhas, destino } = capturar()

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfiguracaoModule.com(config), LogModule.com(config, destino)],
      controllers: [RotaDeTeste],
    }).compile()
    app = modulo.createNestApplication<INestApplication<Server>>({ bufferLogs: true })
    app.useLogger(app.get(Logger))
    await app.init()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    linhas.length = 0
  })

  it('gera um request_id (UUID v7) por requisição e o devolve em x-request-id', async () => {
    const resposta = await request(app.getHttpServer()).get('/teste-log').expect(200)
    const id = resposta.headers['x-request-id']
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const doRequest = linhas.filter((l) => l['request_id'] === id)
    expect(doRequest.length).toBeGreaterThanOrEqual(2) // a linha da rota e a de "request completed"
  })

  it('reaproveita um x-request-id válido e troca um inválido', async () => {
    const aceito = await request(app.getHttpServer())
      .get('/teste-log')
      .set('x-request-id', 'abc-12345-xyz')
      .expect(200)
    expect(aceito.headers['x-request-id']).toBe('abc-12345-xyz')
    expect(linhas.every((l) => l['request_id'] === 'abc-12345-xyz')).toBe(true)

    const recusado = await request(app.getHttpServer())
      .get('/teste-log')
      .set('x-request-id', '<script>alert(1)</script>')
      .expect(200)
    expect(recusado.headers['x-request-id']).not.toContain('<script>')
    expect(recusado.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('tenant_id e user_id, atribuídos no meio da requisição, vão para os logs seguintes e para o de conclusão', async () => {
    await request(app.getHttpServer()).get('/teste-log').expect(200)
    const dentro = linhas.find((l) => l.msg === 'dentro da rota')
    const concluida = linhas.find((l) => l.msg === 'request completed')
    for (const linha of [dentro, concluida]) {
      expect(linha).toMatchObject({ tenant_id: 'tenant-123', user_id: 'usuario-456' })
    }
    expect(concluida).toMatchObject({
      req: { method: 'GET', url: '/teste-log' },
      res: { statusCode: 200 },
    })
  })

  it('uma requisição não vaza tenant nem usuário para a seguinte', async () => {
    await request(app.getHttpServer()).get('/teste-log').expect(200)
    linhas.length = 0
    await request(app.getHttpServer()).post('/teste-log').send({}).expect(201)
    const log = linhas.find((l) => l.msg === 'recebido')
    expect(log?.['request_id']).toBeDefined()
    expect(log).not.toHaveProperty('tenant_id')
    expect(log).not.toHaveProperty('user_id')
  })

  it('não registra cabeçalhos de sessão nem campos de senha e token', async () => {
    await request(app.getHttpServer())
      .post('/teste-log')
      .set('Cookie', 'sessao=SEGREDO-DE-SESSAO')
      .set('Authorization', 'Bearer SEGREDO-BEARER')
      .send({
        email: 'a@b.com',
        password: 'SENHA-EM-TEXTO',
        senha: 'OUTRA-SENHA',
        token: 'TOKEN-X',
      })
      .expect(201)
    const tudo = JSON.stringify(linhas)
    for (const segredo of [
      'SEGREDO-DE-SESSAO',
      'SEGREDO-BEARER',
      'SENHA-EM-TEXTO',
      'OUTRA-SENHA',
      'TOKEN-X',
    ]) {
      expect(tudo).not.toContain(segredo)
    }
    expect(tudo).toContain('[removido]')
    expect(tudo).toContain('a@b.com') // o que não é segredo continua visível
  })
})

describe('logs do app real', () => {
  it('não registra /health e devolve o request_id', async () => {
    const { linhas, destino } = capturar()
    const app = await criarApp(carregarConfiguracao({ ...process.env, LOG_LEVEL: 'info' }), {
      destinoLog: destino,
    })
    await app.init()
    try {
      const resposta = await request(app.getHttpServer()).get('/health').expect(200)
      expect(resposta.headers['x-request-id']).toBeDefined()
      expect(linhas.filter((l) => l.msg === 'request completed')).toHaveLength(0)
    } finally {
      await app.close()
    }
  })
})
