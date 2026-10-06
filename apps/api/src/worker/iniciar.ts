import type { Server } from 'node:http'

import type { Conexao } from '@leadtogo/db'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import type { Configuracao } from '../configuracao/configuracao.js'
import { FILAS } from './filas.js'
import { iniciarServidorDeSaude, type EstadoDoWorker } from './saude.js'
import { WorkerFilas } from './worker-filas.service.js'

export interface WorkerEmExecucao {
  filas: WorkerFilas
  servidorDeSaude: Server
  estado: EstadoDoWorker
  /** Encerra de forma graciosa e devolve se tudo terminou dentro do prazo. */
  encerrar: () => Promise<boolean>
}

/**
 * Sobe os consumidores das filas e o healthcheck. O encerramento (SIGTERM) está em `worker.ts`;
 * aqui fica só a montagem, para os testes poderem subir o worker em processo.
 */
export async function iniciarWorker(deps: {
  config: Configuracao
  banco: Conexao
  valkey: Redis
  log: Logger
}): Promise<WorkerEmExecucao> {
  const { config, banco, valkey, log } = deps
  const filas = new WorkerFilas(config, log)
  const estado: EstadoDoWorker = { ultimoCicloEm: () => null, relayAtivo: false }

  // Fila de teste: só fora de produção (encerramento gracioso e retenção são testados com ela)
  if (config.NODE_ENV !== 'production') {
    filas.consumir(FILAS.teste, async (job) => {
      const { ms, chave } = job.data as { ms?: number; chave?: string }
      await new Promise((r) => setTimeout(r, ms ?? 0))
      if (chave) await valkey.set(chave, job.id ?? 'sem-id', 'EX', 300)
      return 'ok'
    })
  }

  const servidorDeSaude = await iniciarServidorDeSaude(config.WORKER_SAUDE_PORTA, {
    filas,
    valkey,
    banco,
    estado,
    log,
  })
  log.info({ porta: config.WORKER_SAUDE_PORTA, versao: config.APP_VERSION }, 'worker iniciado')

  return {
    filas,
    servidorDeSaude,
    estado,
    encerrar: async () => {
      servidorDeSaude.close()
      return filas.encerrar(config.WORKER_ENCERRAMENTO_S * 1000)
    },
  }
}
