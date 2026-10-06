import { criarConexao } from '@leadtogo/db'
import { Redis } from 'ioredis'
import { pino } from 'pino'

import { iniciarWorker, type WorkerEmExecucao } from '../worker/iniciar.js'
import { configuracaoDeTeste } from './app-teste.js'

/**
 * Worker de verdade, no processo do teste (relay do outbox a cada 100 ms e consumidores das filas),
 * para os testes de API em que algo só acontece depois de o worker agir (e-mails). Chame o `parar()`
 * no afterAll. Os arquivos de teste rodam em sequência, então só há um worker por vez.
 */
export async function subirWorkerDeTeste(troca: Record<string, string> = {}) {
  const config = configuracaoDeTeste({ WORKER_SAUDE_PORTA: '0', ...troca })
  const banco = criarConexao(config.DATABASE_URL, { max: 4 })
  const valkey = new Redis(config.REDIS_URL)
  const worker: WorkerEmExecucao = await iniciarWorker({
    config,
    banco,
    valkey,
    log: pino({ level: 'silent' }),
  })
  return {
    worker,
    async parar() {
      await worker.encerrar()
      valkey.disconnect()
      await banco.cliente.end({ timeout: 5 })
    },
  }
}
