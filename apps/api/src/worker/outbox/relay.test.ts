import { criarConexao, novoId, type Conexao } from '@leadtogo/db'
import { pino } from 'pino'
import { Redis } from 'ioredis'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EnviadorSmtp } from '../../email/enviador.js'
import { configuracaoDeTeste } from '../../testes/app-teste.js'
import { dono, empresaDeOutraConta } from '../../testes/mundo.js'
import { FILAS } from '../filas.js'
import { processadorDeTeste } from '../processadores.js'
import { WorkerFilas } from '../worker-filas.service.js'
import { jobIdDoEvento, manipuladoresPadrao } from './manipuladores.js'
import { esperaProgressivaMs, RelayDoOutbox } from './relay.js'
import { esperarAte } from '../../testes/espera.js'

const log = pino({ level: 'silent' })
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const bancos: Conexao[] = []
const banco = () => {
  const b = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4, onnotice: () => {} })
  bancos.push(b)
  return b
}
const principal = banco()

afterAll(async () => {
  await valkey.quit()
  await dono.end()
  for (const b of bancos) await b.cliente.end()
})

let prefixo = ''
let n = 0
let filas: WorkerFilas
beforeEach(() => {
  n += 1
  prefixo = `leadtogo:fila:r${Date.now()}-${n}`
  const config = configuracaoDeTeste({
    FILA_PREFIXO: prefixo,
    LOG_LEVEL: 'silent',
    FILA_LOCK_MS: '5000',
  })
  filas = new WorkerFilas(config, log)
  filas.consumir(FILAS.teste, processadorDeTeste(valkey))
})
afterEach(async () => {
  await filas
    .fila(FILAS.teste)
    .obliterate({ force: true })
    .catch(() => undefined)
  await filas.encerrar(5000)
})

const config = () => configuracaoDeTeste({ FILA_PREFIXO: prefixo, LOG_LEVEL: 'silent' })
const relay = (extra: { maxTentativas?: number; lote?: number } = {}, b: Conexao = principal) =>
  new RelayDoOutbox({
    banco: b,
    filas,
    log,
    manipuladores: manipuladoresPadrao(config(), new EnviadorSmtp(config(), log)),
    ...extra,
  })

/** Grava um evento como a API faz: numa transação com o tenant ativo (aqui, o próprio papel do app). */
async function gravarEvento(tenantId: string, tipo = 'teste.evento', payload: object = {}) {
  const id = novoId()
  await principal.cliente.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, payload) VALUES (${id}, ${tenantId}, ${tipo}, ${JSON.stringify(payload)}::jsonb)`
  })
  return id
}
type LinhaDoEvento = {
  processado_em: Date | null
  falhou_em: Date | null
  payload: unknown
  tentativas: number
  proxima_tentativa_em: Date | null
  ultimo_erro: string | null
  reservado_ate: Date | null
}
const linha = (id: string, tenantId: string) =>
  principal.cliente.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    const [l] = await tx<LinhaDoEvento[]>`
      SELECT processado_em, falhou_em, payload, tentativas, proxima_tentativa_em, ultimo_erro, reservado_ate
      FROM eventos_outbox WHERE id = ${id}`
    // jsonb volta como texto neste cliente (o do Drizzle)
    return (
      l && {
        ...l,
        payload: typeof l.payload === 'string' ? (JSON.parse(l.payload) as unknown) : l.payload,
      }
    )
  })
const contagem = async (chave: string) => Number((await valkey.get(`${chave}:n`)) ?? 0)

describe('relay do outbox (Postgres e Valkey reais, sem BYPASSRLS)', () => {
  it('um evento gravado numa transação é entregue UMA vez: marcado, payload apagado, um só efeito', async () => {
    const { tenantId } = await empresaDeOutraConta()
    const chave = `${prefixo}:ef:1`
    const id = await gravarEvento(tenantId, 'teste.evento', { chave, ms: 0 })
    const r = relay()
    expect(await r.rodarCiclo()).toMatchObject({
      reservados: expect.any(Number) as number,
      entregues: expect.any(Number) as number,
    })
    await esperarAte(async () => (await contagem(chave)) === 1)
    await r.rodarCiclo()
    await r.rodarCiclo()
    await new Promise((res) => setTimeout(res, 400))
    expect(await contagem(chave)).toBe(1) // continua um só

    const e = await linha(id, tenantId)
    expect(e?.processado_em).not.toBeNull()
    expect(e?.payload).toEqual({}) // payload apagado ao entregar
    expect(e?.tentativas).toBe(1)
    expect(e?.reservado_ate).toBeNull()
  })

  it('o evento roda no tenant dele: o banco enxerga app.tenant_id igual ao do evento', async () => {
    const [a, b] = [await empresaDeOutraConta(), await empresaDeOutraConta()]
    const ca = `${prefixo}:ef:a`
    const cb = `${prefixo}:ef:b`
    await gravarEvento(a.tenantId, 'teste.evento', { chave: ca })
    await gravarEvento(b.tenantId, 'teste.evento', { chave: cb })
    await relay().rodarCiclo()
    await esperarAte(
      async () =>
        (await valkey.get(`${ca}:tenant`)) !== null && (await valkey.get(`${cb}:tenant`)) !== null,
    )
    expect(await valkey.get(`${ca}:tenant`)).toBe(a.tenantId)
    expect(await valkey.get(`${cb}:tenant`)).toBe(b.tenantId)
  })

  it('três relays concorrentes e 120 eventos de dois tenants: cada evento tem exatamente um efeito', async () => {
    const [a, b] = [await empresaDeOutraConta(), await empresaDeOutraConta()]
    const eventos: { id: string; chave: string; tenantId: string }[] = []
    for (let i = 0; i < 120; i++) {
      const tenantId = i % 2 === 0 ? a.tenantId : b.tenantId
      const chave = `${prefixo}:ef:m${i}`
      eventos.push({ id: await gravarEvento(tenantId, 'teste.evento', { chave }), chave, tenantId })
    }
    // cada relay com a sua conexão ao banco, como workers separados
    const relays = [
      relay({ lote: 20 }, banco()),
      relay({ lote: 20 }, banco()),
      relay({ lote: 20 }, banco()),
    ]
    await Promise.all(
      relays.map(async (r) => {
        for (let ciclo = 0; ciclo < 12; ciclo++) await r.rodarCiclo()
      }),
    )
    await esperarAte(async () => {
      const feitos = await Promise.all(eventos.map((e) => contagem(e.chave)))
      return feitos.every((c) => c >= 1)
    }, 20_000)
    await new Promise((res) => setTimeout(res, 500))
    for (const e of eventos) expect(await contagem(e.chave), e.chave).toBe(1)
    for (const e of eventos.slice(0, 10))
      expect((await linha(e.id, e.tenantId))?.processado_em).not.toBeNull()
  }, 60_000)

  it('falha: espera progressiva (5 s, 10 s), sem nova tentativa antes da hora, e ao esgotar vira falhou_em com o payload mantido (para o reprocessamento)', async () => {
    const { tenantId } = await empresaDeOutraConta()
    const id = await gravarEvento(tenantId, 'teste.falha', { segredo: 'token-que-nao-pode-ficar' })
    const r = relay({ maxTentativas: 3 })

    await r.rodarCiclo() // tentativa 1
    let e = await linha(id, tenantId)
    expect(e?.tentativas).toBe(1)
    expect(e?.processado_em).toBeNull()
    expect(e?.ultimo_erro).toContain('falha de teste')
    const espera1 =
      (e?.proxima_tentativa_em ? new Date(e.proxima_tentativa_em).getTime() : 0) - Date.now()
    expect(espera1).toBeGreaterThan(3000)
    expect(espera1).toBeLessThanOrEqual(5100)

    expect((await r.rodarCiclo()).reservados).toBe(0) // ainda não é hora
    expect((await linha(id, tenantId))?.tentativas).toBe(1)

    await principal.cliente.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      await tx`UPDATE eventos_outbox SET proxima_tentativa_em = now() - interval '1 second' WHERE id = ${id}`
    })
    await r.rodarCiclo() // tentativa 2
    e = await linha(id, tenantId)
    expect(e?.tentativas).toBe(2)
    const espera2 =
      (e?.proxima_tentativa_em ? new Date(e.proxima_tentativa_em).getTime() : 0) - Date.now()
    expect(espera2).toBeGreaterThan(8000)
    expect(espera2).toBeLessThanOrEqual(10_100)

    await principal.cliente.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      await tx`UPDATE eventos_outbox SET proxima_tentativa_em = now() - interval '1 second' WHERE id = ${id}`
    })
    await r.rodarCiclo() // tentativa 3 = a última
    e = await linha(id, tenantId)
    expect(e?.tentativas).toBe(3)
    expect(e?.falhou_em).not.toBeNull()
    // mantido na falha final: o `outbox-tratar --reprocessar` precisa dele (o --descartar o apaga)
    expect(e?.payload).toEqual({ segredo: 'token-que-nao-pode-ficar' })
    expect(e?.processado_em).toBeNull()
    expect((await r.rodarCiclo()).reservados).toBe(0) // nunca mais reservado
    expect(esperaProgressivaMs(1)).toBe(5000)
    expect(esperaProgressivaMs(2)).toBe(10_000)
    expect(esperaProgressivaMs(30)).toBe(3_600_000) // teto de 1 h
  })

  it('tipo de evento desconhecido é falha (esgota as tentativas), não perda silenciosa', async () => {
    const { tenantId } = await empresaDeOutraConta()
    const id = await gravarEvento(tenantId, 'tipo.que.nao.existe')
    await relay({ maxTentativas: 1 }).rodarCiclo()
    const e = await linha(id, tenantId)
    expect(e?.falhou_em).not.toBeNull()
    expect(e?.ultimo_erro).toContain('tipo de evento desconhecido')
  })

  it('o relay não entrega duas vezes se já havia um job do mesmo evento (jobId descarta a repetição)', async () => {
    const { tenantId } = await empresaDeOutraConta()
    const chave = `${prefixo}:ef:dup`
    const id = await gravarEvento(tenantId, 'teste.evento', { chave })
    // como se um relay tivesse enfileirado e caído antes de marcar o evento
    await filas
      .fila(FILAS.teste)
      .add('espera', { chave, eventoId: id }, { jobId: jobIdDoEvento(id) })
    await relay().rodarCiclo()
    await esperarAte(async () => (await contagem(chave)) >= 1)
    await new Promise((res) => setTimeout(res, 500))
    expect(await contagem(chave)).toBe(1)
    expect((await linha(id, tenantId))?.processado_em).not.toBeNull() // e o evento ficou marcado
  })

  it('reenfileirar o mesmo evento DEPOIS de o job concluído e removido não gera um segundo efeito', async () => {
    const { tenantId } = await empresaDeOutraConta()
    const chave = `${prefixo}:ef:idem`
    const id = await gravarEvento(tenantId, 'teste.evento', { chave })
    await relay().rodarCiclo()
    await esperarAte(async () => (await contagem(chave)) === 1)
    // a retenção do BullMQ venceu: o job concluído já não existe, então o jobId não protege mais
    const job = await filas.fila(FILAS.teste).getJob(jobIdDoEvento(id))
    await esperarAte(async () => (await job?.getState()) === 'completed')
    await job?.remove()
    expect(await filas.fila(FILAS.teste).getJob(jobIdDoEvento(id))).toBeUndefined()
    // e o evento volta a ficar pendente (ex.: o relay caiu entre enfileirar e marcar)
    await principal.cliente.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      await tx`UPDATE eventos_outbox SET processado_em = NULL, reservado_ate = NULL WHERE id = ${id}`
    })
    await relay().rodarCiclo()
    await esperarAte(
      async () => (await filas.fila(FILAS.teste).getJob(jobIdDoEvento(id))) !== undefined,
    )
    await new Promise((res) => setTimeout(res, 800))
    expect(await contagem(chave)).toBe(1) // o consumidor idempotente ignorou o segundo job
  })

  it('o app, que o worker usa, continua sem ler o outbox fora do tenant depois de rodar o relay', async () => {
    const { tenantId } = await empresaDeOutraConta()
    await gravarEvento(tenantId, 'teste.evento', { chave: `${prefixo}:ef:x` })
    await relay().rodarCiclo()
    expect(await principal.cliente`SELECT 1 FROM eventos_outbox`).toHaveLength(0)
  })
})
