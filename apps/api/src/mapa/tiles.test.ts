import { randomBytes } from 'node:crypto'
import type { Server } from 'node:http'

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { dono, novoDono } from '../testes/mundo.js'

// Arquivo de mentira (bytes aleatórios): o endpoint só repassa bytes, não lê o formato PMTiles.
const config = configuracaoDeTeste({ GEO_PMTILES_CHAVE: 'teste-mapa/base.pmtiles' })
const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
})
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const arquivo = randomBytes(300_000)

beforeAll(async () => {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: 'teste-mapa/base.pmtiles',
      Body: arquivo,
    }),
  )
})
afterAll(async () => {
  await s3.send(
    new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: 'teste-mapa/base.pmtiles' }),
  )
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], config)
})
afterEach(() => app.close())

const pedir = (cookie: string | undefined, range?: string) => {
  let r = request(app.getHttpServer())
    .get('/v1/mapa/base.pmtiles')
    .buffer(true)
    .parse((res, cb) => {
      const partes: Buffer[] = []
      res.on('data', (c: Buffer) => partes.push(c))
      res.on('end', () => cb(null, Buffer.concat(partes)))
    })
  if (cookie) r = r.set('Cookie', cookie)
  return range ? r.set('Range', range) : r
}

describe('GET /v1/mapa/base.pmtiles', () => {
  it('sem sessão é 401', async () => {
    expect((await pedir(undefined)).status).toBe(401)
  })

  it('com Range devolve só o trecho (206) com Content-Range e Accept-Ranges', async () => {
    const d = await novoDono(app)
    const r = await pedir(d.cookie, 'bytes=1000-1999')
    expect(r.status).toBe(206)
    expect(r.headers['content-range']).toBe('bytes 1000-1999/300000')
    expect(r.headers['accept-ranges']).toBe('bytes')
    expect(r.headers['content-length']).toBe('1000')
    expect((r.body as Buffer).equals(arquivo.subarray(1000, 2000))).toBe(true)
  })

  it('vários pedidos de faixa seguidos, inclusive o cabeçalho (primeiros 127 bytes) e o fim', async () => {
    const d = await novoDono(app)
    for (const [de, ate] of [
      [0, 126],
      [150_000, 150_511],
      [299_000, 299_999],
    ] as const) {
      const r = await pedir(d.cookie, `bytes=${de}-${ate}`)
      expect(r.status).toBe(206)
      expect((r.body as Buffer).equals(arquivo.subarray(de, ate + 1))).toBe(true)
    }
  })

  it('sem Range devolve o arquivo inteiro (200)', async () => {
    const d = await novoDono(app)
    const r = await pedir(d.cookie)
    expect(r.status).toBe(200)
    expect((r.body as Buffer).length).toBe(300_000)
  })

  it('faixa fora do arquivo é 416', async () => {
    const d = await novoDono(app)
    expect((await pedir(d.cookie, 'bytes=400000-400100')).status).toBe(416)
  })

  it('arquivo que ainda não foi enviado ao Garage: 404 mapa_indisponivel', async () => {
    const outro = await criarAppComRotas(
      [],
      configuracaoDeTeste({ GEO_PMTILES_CHAVE: 'teste-mapa/nao-existe.pmtiles' }),
    )
    try {
      const d = await novoDono(outro)
      const r = await request(outro.getHttpServer())
        .get('/v1/mapa/base.pmtiles')
        .set('Cookie', d.cookie)
        .set('Range', 'bytes=0-10')
      expect(r.status).toBe(404)
      expect((r.body as { erro: string }).erro).toBe('mapa_indisponivel')
    } finally {
      await outro.close()
    }
  })
})
