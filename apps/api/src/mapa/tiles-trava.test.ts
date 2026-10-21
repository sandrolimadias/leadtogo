import { randomBytes } from 'node:crypto'
import http, { type Agent, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Conexao } from '@leadtogo/db'

import { ARMAZENAMENTO, BANCO } from '../infra/infra.module.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { dono, novoDono } from '../testes/mundo.js'

/**
 * A trava de 19/10/2026: o MapLibre aborta dezenas de pedidos de faixa a cada movimento; o corpo do Garage
 * não era destruído, os sockets do S3Client ficavam presos (e cada pedido preso segurava uma conexão do
 * banco, aberta pela transação da requisição), e a API inteira parava. Estes testes abortam centenas de
 * pedidos e exigem que nada fique preso.
 */
const CHAVE = 'teste-mapa/base-trava.pmtiles'
const config = configuracaoDeTeste({ GEO_PMTILES_CHAVE: CHAVE })
const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
})
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
// 24 MB: um pedido de faixa grande não cabe nos buffers dos sockets, então o corpo fica em andamento
const arquivo = randomBytes(1_000_000)
const GRANDE = 24

beforeAll(async () => {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: CHAVE,
      Body: Buffer.concat(Array.from({ length: GRANDE }, () => arquivo)),
    }),
  )
})
afterAll(async () => {
  await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: CHAVE }))
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
let porta: number
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], config)
  await app.listen(0, '127.0.0.1')
  porta = (app.getHttpServer().address() as AddressInfo).port
})
afterEach(() => app.close())

/** Sockets do S3Client da API em uso agora (conectados a um pedido) e pedidos na fila do agente. */
function socketsDoS3(): { emUso: number; naFila: number } {
  const cliente = app.get<S3Client>(ARMAZENAMENTO)
  const agente = (
    cliente.config.requestHandler as unknown as {
      httpHandlerConfigs: () => Record<string, unknown>
    }
  ).httpHandlerConfigs()['httpAgent'] as Agent
  const contar = (o: NodeJS.ReadOnlyDict<unknown[]>) =>
    Object.values(o).reduce<number>((n, l) => n + (l?.length ?? 0), 0)
  return { emUso: contar(agente.sockets), naFila: contar(agente.requests) }
}

/** Abre um pedido de faixa grande e o aborta assim que chega o primeiro pedaço (ou a resposta). */
const pedirEAbortar = (cookie: string) =>
  new Promise<void>((resolver) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: porta,
        path: '/v1/mapa/base.pmtiles',
        headers: { Cookie: cookie, Range: `bytes=0-${GRANDE * 1_000_000 - 1}` },
        agent: false,
      },
      (res) => {
        res.once('data', () => {
          req.destroy()
          resolver()
        })
        res.on('error', () => undefined)
      },
    )
    req.on('error', () => resolver())
    setTimeout(() => {
      req.destroy()
      resolver()
    }, 3000)
  })

const comPrazo = async (_ms: number, fn: () => Promise<number>) => {
  const inicio = Date.now()
  const status = await fn()
  return { status, ms: Date.now() - inicio }
}
const get = (path: string, cookie: string, range?: string) =>
  new Promise<number>((resolver, rejeitar) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: porta,
        path,
        headers: { Cookie: cookie, ...(range ? { Range: range } : {}) },
        agent: false,
      },
      (res) => {
        res.resume()
        res.on('end', () => resolver(res.statusCode ?? 0))
      },
    )
    req.on('error', rejeitar)
    req.setTimeout(8000, () => {
      req.destroy()
      rejeitar(new Error('sem resposta em 8 s'))
    })
  })

async function esperarSocketsLivres(limiteMs: number): Promise<{ emUso: number; naFila: number }> {
  const fim = Date.now() + limiteMs
  let s = socketsDoS3()
  while ((s.emUso > 0 || s.naFila > 0) && Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 100))
    s = socketsDoS3()
  }
  return s
}

describe('GET /v1/mapa/base.pmtiles abortado pelo navegador', () => {
  it('300 pedidos abortados não deixam socket do Garage nem conexão do banco presos', async () => {
    const d = await novoDono(app)
    for (let lote = 0; lote < 6; lote++) {
      await Promise.all(Array.from({ length: 50 }, () => pedirEAbortar(d.cookie)))
    }
    // o banco: o pool (10 conexões) segue livre. Antes, cada pedido na fila do Garage segurava uma conexão
    // numa transação aberta, o pool esgotava e até o `SELECT 1` do /health ficava esperando
    const banco = app.get<Conexao>(BANCO)
    const consultas = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const inicio = Date.now()
        await Promise.race([
          banco.cliente`SELECT 1`,
          new Promise((_, rejeitar) =>
            setTimeout(() => rejeitar(new Error('pool esgotado')), 2000),
          ),
        ])
        return Date.now() - inicio
      }),
    )
    expect(Math.max(...consultas)).toBeLessThan(500)
    expect(await esperarSocketsLivres(5000)).toEqual({ emUso: 0, naFila: 0 })

    // e a API segue respondendo: um pedido normal e o /health, rápidos
    const faixa = await comPrazo(3000, () => get('/v1/mapa/base.pmtiles', d.cookie, 'bytes=0-1023'))
    expect(faixa.status).toBe(206)
    expect(faixa.ms).toBeLessThan(3000)
    const saude = await comPrazo(3000, () => get('/health', d.cookie))
    expect(saude.status).toBe(200)
    expect(saude.ms).toBeLessThan(3000)
  }, 60_000)

  it('rajada de abortos enquanto o /health e o banco são consultados: nenhum dos dois fica na fila', async () => {
    const d = await novoDono(app)
    const rajada = Promise.all(Array.from({ length: 120 }, () => pedirEAbortar(d.cookie)))
    // no meio da rajada, o /health tem de responder dentro do prazo dele (2 s por verificação)
    const meio = await comPrazo(4000, () => get('/health', d.cookie))
    await rajada
    expect(meio.status).toBe(200)
    // o servidor e os 120 clientes dividem o mesmo processo (24 MB de faixa cada): o prazo da verificação é de 2 s
    // por serviço, e o que o teste pega é o /health preso na fila (503 ou sem resposta), não a folga do processo
    expect(meio.ms).toBeLessThan(4000)
    expect(await esperarSocketsLivres(5000)).toEqual({ emUso: 0, naFila: 0 })
  }, 60_000)
})
