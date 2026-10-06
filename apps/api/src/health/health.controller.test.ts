import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'

describe('GET /health', () => {
  let app: INestApplication<Server>

  beforeAll(async () => {
    app = await criarApp()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('responde ok com a versão em execução, fora do prefixo /v1', async () => {
    const resposta = await request(app.getHttpServer()).get('/health').expect(200)
    expect(resposta.body).toEqual({ status: 'ok', version: process.env['APP_VERSION'] ?? 'dev' })
  })
})
