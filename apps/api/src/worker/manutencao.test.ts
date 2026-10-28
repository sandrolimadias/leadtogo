import { criarConexao, novoId } from '@leadtogo/db'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configuracaoDeTeste } from '../testes/app-teste.js'
import { dono, empresaDeOutraConta } from '../testes/mundo.js'
import { FILAS } from './filas.js'
import { AGENDADORES, registrarAgendadores, processadorDeManutencao } from './manutencao.js'
import { WorkerFilas } from './worker-filas.service.js'

const log = pino({ level: 'silent' })
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
const workers: WorkerFilas[] = []
let prefixo = ''
let n = 0
beforeEach(() => {
  n += 1
  prefixo = `leadtogo:fila:m${Date.now()}-${n}`
})
afterEach(async () => {
  const [primeiro] = workers
  await primeiro
    ?.fila(FILAS.manutencao)
    .obliterate({ force: true })
    .catch(() => undefined)
  for (const w of workers.splice(0)) await w.encerrar(2000)
})
afterAll(async () => {
  valkey.disconnect()
  await banco.cliente.end({ timeout: 5 })
  await dono.end()
})

function novoWorker() {
  const w = new WorkerFilas(configuracaoDeTeste({ FILA_PREFIXO: prefixo }), log)
  workers.push(w)
  return w
}

describe('agendadores (upsertJobScheduler)', () => {
  it('os de produção: partições no dia 1º e limpezas diárias, em UTC, com ids únicos', () => {
    expect(AGENDADORES.map((a) => a.id)).toEqual([
      'auditoria-particoes',
      'limpeza-convites',
      'limpeza-outbox',
      'varredura-importacoes',
      'publicar-agendadas',
      'lembrar-eventos',
      'enviar-avisos',
      'enviar-pushes',
      'avisar-chaves',
    ])
    expect(new Set(AGENDADORES.map((a) => a.id)).size).toBe(AGENDADORES.length)
    expect(AGENDADORES[0]?.quando).toEqual({ pattern: '0 3 1 * *' })
  })

  it('registrar várias vezes, em dois workers, deixa um só agendador de cada', async () => {
    const [a, b] = [novoWorker(), novoWorker()]
    await Promise.all([registrarAgendadores(a), registrarAgendadores(b)])
    await registrarAgendadores(a)
    const agendadores = await a.fila(FILAS.manutencao).getJobSchedulers()
    expect(agendadores.map((s) => s.key).sort()).toEqual(AGENDADORES.map((s) => s.id).sort())
  })

  it('dois workers rodando juntos NÃO duplicam o job agendado: cada horário executa uma vez só', async () => {
    const [a, b] = [novoWorker(), novoWorker()]
    const execucoes = `${prefixo}:execucoes`
    const ids = `${prefixo}:ids`
    const contador = async (job: { id?: string }) => {
      await valkey.rpush(execucoes, job.id ?? '?')
      await valkey.sadd(ids, job.id ?? '?')
      return 'ok'
    }
    // Cada worker consome e registra o MESMO agendador (como dois containers subindo juntos)
    a.consumir(FILAS.manutencao, contador)
    b.consumir(FILAS.manutencao, contador)
    const rapido = [{ id: 'tique', tarefa: 'tique', quando: { every: 200 } }]
    await Promise.all([registrarAgendadores(a, rapido), registrarAgendadores(b, rapido)])
    await new Promise((r) => setTimeout(r, 2500))

    const total = await valkey.llen(execucoes)
    const unicos = await valkey.scard(ids)
    expect(total).toBeGreaterThanOrEqual(5)
    expect(total).toBe(unicos) // nenhum job executou duas vezes
    expect(total).toBeLessThanOrEqual(2500 / 200 + 3) // e o ritmo é o de UM agendador, não de dois
    await valkey.del(execucoes, ids)
  }, 20_000)
})

describe('processador de manutenção (banco real)', () => {
  const rodar = (nome: string) =>
    processadorDeManutencao(
      banco,
      log,
    )({ name: nome } as Parameters<ReturnType<typeof processadorDeManutencao>>[0])

  it('partições: recria a que faltar; convites: apaga os cancelados há mais de 30 dias; outbox: os entregues há mais de 14', async () => {
    const nome =
      (
        await dono<{ n: string }[]>`
      SELECT 'auditoria_' || to_char(date_trunc('month', now()) + interval '7 months', 'YYYY_MM') AS n`
      )[0]?.n ?? ''
    await dono.unsafe(`DROP TABLE IF EXISTS ${nome}`)
    expect((await rodar('particoes')).resultado).toBeGreaterThanOrEqual(1)
    expect((await dono`SELECT to_regclass(${'public.' + nome}) AS r`)[0]?.['r']).not.toBeNull()

    const { tenantId } = await empresaDeOutraConta()
    const membroId = novoId()
    const conviteId = novoId()
    const eventoId = novoId()
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Quem convida')`
      await tx`INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por, revogado_em)
        VALUES (${conviteId}, ${tenantId}, ${`m-${conviteId}@exemplo.com`}, 'vendedor', ${conviteId}, now() + interval '7 days', ${membroId}, now() - interval '31 days')`
      await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, processado_em) VALUES (${eventoId}, ${tenantId}, 'teste.evento', now() - interval '15 days')`
    })
    expect((await rodar('limpar-convites')).resultado).toBeGreaterThanOrEqual(1)
    expect((await rodar('limpar-outbox')).resultado).toBeGreaterThanOrEqual(1)
    const resta = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return [
        (await tx`SELECT 1 FROM convites WHERE id = ${conviteId}`).length,
        (await tx`SELECT 1 FROM eventos_outbox WHERE id = ${eventoId}`).length,
      ]
    })
    expect(resta).toEqual([0, 0])
  })

  it('publicar-agendadas: publica só as agendadas que venceram, em qualquer empresa', async () => {
    const { tenantId } = await empresaDeOutraConta()
    const vencida = novoId()
    const futura = novoId()
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      await tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, agendada_para)
        VALUES (${vencida}, ${tenantId}, 'Vencida', 'x', 'agendada', now() - interval '2 minutes')`
      await tx`INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, agendada_para)
        VALUES (${futura}, ${tenantId}, 'Futura', 'x', 'agendada', now() + interval '1 day')`
    })
    expect((await rodar('publicar-agendadas')).resultado).toBeGreaterThanOrEqual(1)
    const situacoes = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return tx`SELECT id, situacao::text AS situacao, publicada_em FROM publicacoes WHERE id IN (${vencida}, ${futura})`
    })
    const por = new Map(situacoes.map((l) => [String(l['id']), l]))
    expect(por.get(vencida)?.['situacao']).toBe('publicada')
    expect(por.get(vencida)?.['publicada_em']).not.toBeNull()
    expect(por.get(futura)?.['situacao']).toBe('agendada')
  })

  it('tarefa desconhecida é erro (o job falha e aparece), não sucesso silencioso', async () => {
    await expect(rodar('inventada')).rejects.toThrow('desconhecida')
  })
})
