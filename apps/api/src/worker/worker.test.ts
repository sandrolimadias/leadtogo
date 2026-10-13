import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste } from '../testes/app-teste.js'
import { compilarApi, subirWorker, type WorkerFilho } from '../testes/processo-worker.js'
import { criarFila, FILAS, RETENCAO } from './filas.js'
import { esperarAte } from '../testes/espera.js'

const raiz = fileURLToPath(new URL('../..', import.meta.url))
const valkey = new Redis(process.env['REDIS_URL'] ?? '')

// Cada teste usa um prefixo de fila próprio: workers de testes diferentes nunca se enxergam
let prefixo = ''
let n = 0
const filhos: WorkerFilho[] = []
const filas: Queue[] = []

beforeAll(() => compilarApi(), 120_000)
afterAll(async () => {
  await valkey.quit()
})
afterEach(async () => {
  for (const f of filhos.splice(0)) if (f.processo.exitCode === null) f.processo.kill('SIGKILL')
  for (const q of filas.splice(0)) {
    await q.obliterate({ force: true }).catch(() => undefined)
    await q.close()
  }
})

function novoPrefixo() {
  n += 1
  prefixo = `leadtogo:fila:t${Date.now()}-${n}`
  return prefixo
}
async function worker(extra: Record<string, string> = {}) {
  const f = await subirWorker({ FILA_PREFIXO: prefixo, FILA_LOCK_MS: '3000', ...extra })
  filhos.push(f)
  return f
}
function fila() {
  const q = criarFila(
    FILAS.teste,
    configuracaoDeTeste({ FILA_PREFIXO: prefixo, LOG_LEVEL: 'silent' }),
  )
  filas.push(q)
  return q
}

describe('worker: processo e healthcheck', () => {
  it('sobe, processa um job, e o healthcheck responde pelo servidor e pelo comando saude-worker', async () => {
    novoPrefixo()
    const w = await worker()
    await w.aguardarPronto()
    const r = await fetch(`http://127.0.0.1:${w.porta}/health`)
    expect(await r.json()).toMatchObject({
      status: 'ok',
      checks: { consumidores: true, valkey: true, database: true },
    })

    // o comando que o Coolify executa
    execFileSync(process.execPath, ['dist/saude-worker.js'], {
      cwd: raiz,
      env: { ...process.env, WORKER_SAUDE_PORTA: String(w.porta) },
    })

    const chave = `${prefixo}:feito:1`
    await fila().add('espera', { ms: 0, chave })
    await esperarAte(async () => (await valkey.get(chave)) !== null)
  }, 30_000)

  it('o servidor de saúde só existe no loopback e só responde a GET /health', async () => {
    novoPrefixo()
    const w = await worker()
    await w.aguardarPronto()
    expect((await fetch(`http://127.0.0.1:${w.porta}/outra`)).status).toBe(404)
    expect((await fetch(`http://127.0.0.1:${w.porta}/health`, { method: 'POST' })).status).toBe(404)
    // escuta em 127.0.0.1: o endereço externo da máquina não aceita a conexão
    const externo = (await import('node:os')).networkInterfaces()
    const ip = Object.values(externo)
      .flat()
      .find((i) => i && i.family === 'IPv4' && !i.internal)?.address
    if (ip)
      await expect(
        fetch(`http://${ip}:${w.porta}/health`, { signal: AbortSignal.timeout(1500) }),
      ).rejects.toThrow()
  }, 30_000)

  it('o comando de saúde sai com 1 quando não há worker', () => {
    expect(() =>
      execFileSync(process.execPath, ['dist/saude-worker.js'], {
        cwd: raiz,
        env: { ...process.env, WORKER_SAUDE_PORTA: '59999' },
        stdio: 'pipe',
      }),
    ).toThrow()
  })
})

describe('worker: encerramento gracioso (SIGTERM)', () => {
  it('termina o job em andamento, grava o resultado e sai com 0 (nada se perde)', async () => {
    novoPrefixo()
    const w = await worker({ WORKER_ENCERRAMENTO_S: '20' })
    await w.aguardarPronto()
    const q = fila()
    const chave = `${prefixo}:feito:graciosa`
    const job = await q.add('espera', { ms: 3000, chave })
    await esperarAte(async () => (await job.getState()) === 'active')

    w.processo.kill('SIGTERM')
    const saida = await w.aguardarSaida()
    expect(saida.codigo).toBe(0)
    expect(saida.emMs).toBeGreaterThan(1000) // esperou o job, não saiu na hora
    expect(await valkey.get(chave)).toBe(job.id) // o job terminou e gravou
    await esperarAte(async () => (await job.getState()) === 'completed') // o estado vem logo depois do efeito
    expect(w.saida()).toContain('"noPrazo":true')
  }, 40_000)

  it('não pega job novo depois do SIGTERM e para o healthcheck', async () => {
    novoPrefixo()
    const w = await worker({ WORKER_ENCERRAMENTO_S: '20' })
    await w.aguardarPronto()
    const q = fila()
    const longo = await q.add('espera', { ms: 2500, chave: `${prefixo}:feito:longo` })
    await esperarAte(async () => (await longo.getState()) === 'active')
    w.processo.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 300))
    const novo = await q.add('espera', { ms: 0, chave: `${prefixo}:feito:novo` })
    await w.aguardarSaida()
    expect(await valkey.get(`${prefixo}:feito:novo`)).toBeNull()
    expect(await novo.getState()).toBe('waiting') // continua na fila para outro worker
  }, 40_000)

  it('prazo esgotado: sai no prazo e o job NÃO se perde, outro worker o conclui', async () => {
    novoPrefixo()
    const w1 = await worker({ WORKER_ENCERRAMENTO_S: '1' })
    await w1.aguardarPronto()
    const q = fila()
    const chave = `${prefixo}:feito:forcada`
    const job = await q.add('espera', { ms: 6000, chave })
    await esperarAte(async () => (await job.getState()) === 'active')

    w1.processo.kill('SIGTERM')
    const saida = await w1.aguardarSaida()
    expect(saida.codigo).toBe(0)
    expect(saida.emMs).toBeLessThan(4000) // saiu perto do prazo de 1 s, sem esperar os 6 s do job
    expect(await valkey.get(chave)).toBeNull() // o job não terminou no primeiro worker

    // o lock expira (3 s) e o job parado volta para a fila: o segundo worker o conclui
    const w2 = await worker({ WORKER_ENCERRAMENTO_S: '20' })
    await w2.aguardarPronto()
    await esperarAte(async () => (await valkey.get(chave)) !== null)
    await esperarAte(async () => (await job.getState()) === 'completed') // o estado vem logo depois do efeito
  }, 60_000)
})

describe('fila: retenção e descarte de duplicados', () => {
  it('concluídos ficam 24 h e falhos 14 dias (retenção configurada em todo job)', async () => {
    novoPrefixo()
    const q = fila()
    const job = await q.add('espera', { ms: 0 })
    expect(job.opts.removeOnComplete).toEqual(RETENCAO.concluidos)
    expect(job.opts.removeOnFail).toEqual(RETENCAO.falhos)
    expect(RETENCAO.concluidos.age).toBe(86_400)
    expect(RETENCAO.falhos.age).toBeGreaterThan(RETENCAO.concluidos.age)
  })

  it('o jobId descarta a repetição enquanto o job existe: um só efeito', async () => {
    novoPrefixo()
    const w = await worker()
    await w.aguardarPronto()
    const q = fila()
    const chave = `${prefixo}:feito:dup`
    await q.add('espera', { ms: 0, chave }, { jobId: 'evento-1' })
    await esperarAte(async () => (await valkey.get(chave)) !== null)
    await valkey.del(chave)
    await q.add('espera', { ms: 0, chave }, { jobId: 'evento-1' }) // job ainda retido: descartado
    await new Promise((r) => setTimeout(r, 800))
    expect(await valkey.get(chave)).toBeNull()
  }, 30_000)
})

describe('manutenção agendada com dois workers de verdade', () => {
  it('dois processos juntos deixam um só agendador de cada tarefa e um só job de partições na partida', async () => {
    novoPrefixo()
    const [w1, w2] = [await worker(), await worker()]
    await Promise.all([w1.aguardarPronto(), w2.aguardarPronto()])
    const q = new Queue('manutencao', { connection: valkey, prefix: prefixo })
    try {
      const agendadores = await q.getJobSchedulers()
      expect(agendadores.map((a) => a.key).sort()).toEqual([
        'auditoria-particoes',
        'limpeza-convites',
        'limpeza-outbox',
      ])
      await esperarAte(async () => (await q.getJobCounts('completed'))['completed'] === 1)
      const concluidos = await q.getJobs(['completed'])
      expect(concluidos.map((j) => j.name)).toEqual(['particoes']) // só UMA execução, mesmo com dois workers
    } finally {
      await q.obliterate({ force: true }).catch(() => undefined)
      await q.close()
    }
  }, 40_000)
})
