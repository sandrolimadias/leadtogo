import { criarConexao, novoId } from '@leadtogo/db'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EnviadorSmtp } from '../../email/enviador.js'
import { configuracaoDeTeste } from '../../testes/app-teste.js'
import { dono, empresaDeOutraConta } from '../../testes/mundo.js'
import { FILAS } from '../filas.js'
import { processadorDeNotificacao } from '../processadores.js'
import { WorkerFilas } from '../worker-filas.service.js'
import { jobIdDoEvento, manipuladoresPadrao } from './manipuladores.js'
import { RelayDoOutbox } from './relay.js'

const log = pino({ level: 'silent' })
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
let filas: WorkerFilas
let prefixo = ''
let n = 0
beforeEach(() => {
  n += 1
  prefixo = `leadtogo:fila:n${Date.now()}-${n}`
  const config = configuracaoDeTeste({ FILA_PREFIXO: prefixo })
  filas = new WorkerFilas(config, log)
  filas.consumir(FILAS.notificacoes, processadorDeNotificacao(banco))
})
afterEach(async () => {
  await filas
    .fila(FILAS.notificacoes)
    .obliterate({ force: true })
    .catch(() => undefined)
  await filas.encerrar(2000)
})
afterAll(async () => {
  valkey.disconnect()
  await banco.cliente.end({ timeout: 5 })
  await dono.end()
})

const esperarAte = async (condicao: () => Promise<boolean>, ms = 10_000) => {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    if (await condicao()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('condição não atingida')
}

describe('notificacao.criar (consumidor idempotente: id da notificação = id do evento)', () => {
  it('cria a notificação no tenant do evento; reenfileirar o mesmo evento depois de concluído e removido não cria uma segunda', async () => {
    const { tenantId } = await empresaDeOutraConta()
    const membroId = novoId()
    const eventoId = novoId()
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      await tx`INSERT INTO membros (id, tenant_id, nome, papel) VALUES (${membroId}, ${tenantId}, 'Maria', 'vendedor')`
      await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, payload)
        VALUES (${eventoId}, ${tenantId}, 'notificacao.criar', ${JSON.stringify({ membroId, tipo: 'tarefa.atribuida', titulo: 'Nova tarefa', mensagem: 'Ligar para o cliente' })}::jsonb)`
    })
    const contar = () =>
      dono.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
        return (await tx`SELECT 1 FROM notificacoes WHERE membro_id = ${membroId}`).length
      })

    const config = configuracaoDeTeste({ FILA_PREFIXO: prefixo })
    const relay = new RelayDoOutbox({
      banco,
      filas,
      log,
      manipuladores: manipuladoresPadrao(config, new EnviadorSmtp(config, log)),
    })
    await relay.rodarCiclo()
    await esperarAte(async () => (await contar()) === 1)

    // a retenção do Valkey venceu: o job concluído some e o jobId deixa de proteger
    const fila = filas.fila(FILAS.notificacoes)
    const job = await fila.getJob(jobIdDoEvento(eventoId))
    await esperarAte(async () => (await job?.getState()) === 'completed')
    await job?.remove()
    await fila.add(
      'criar',
      { tenantId, eventoId, membroId, tipo: 'tarefa.atribuida', titulo: 'Nova tarefa' },
      { jobId: jobIdDoEvento(eventoId) },
    )
    const novo = await fila.getJob(jobIdDoEvento(eventoId))
    await esperarAte(async () => (await novo?.getState()) === 'completed')
    expect((await fila.getJob(jobIdDoEvento(eventoId)))?.returnvalue).toBe('duplicada')
    expect(await contar()).toBe(1) // um só efeito
  })
})
