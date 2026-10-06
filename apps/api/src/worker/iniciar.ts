import type { Server } from 'node:http'

import type { Conexao } from '@leadtogo/db'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import type { Configuracao } from '../configuracao/configuracao.js'
import { FILAS } from './filas.js'
import { manipuladoresPadrao } from './outbox/manipuladores.js'
import { RelayDoOutbox } from './outbox/relay.js'
import { processadorDeTeste } from './processadores.js'
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
  // Marca compartilhada: o relay roda em UM worker por ciclo, então a idade do último ciclo vale para todos
  const chaveDoCiclo = `${config.FILA_PREFIXO}:relay:ultimo-ciclo`
  const estado: EstadoDoWorker = {
    relayAtivo: true,
    ultimoCicloEm: async () => {
      const v = await valkey.get(chaveDoCiclo)
      return v === null ? null : Number(v)
    },
  }

  // Fila de teste: só fora de produção (encerramento gracioso, retenção e idempotência são testados com ela)
  if (config.NODE_ENV !== 'production') filas.consumir(FILAS.teste, processadorDeTeste(valkey))

  // Relay do outbox: um agendador do BullMQ (`upsertJobScheduler`, idempotente) gera um ciclo a cada
  // 2 s; só UM worker pega cada ciclo, então vários workers juntos não duplicam o trabalho
  const relay = new RelayDoOutbox({ banco, filas, log, manipuladores: manipuladoresPadrao(config) })
  filas.consumir(
    FILAS.outbox,
    async () => {
      const r = await relay.rodarCiclo()
      await valkey.set(chaveDoCiclo, String(Date.now()), 'EX', 300)
      return r
    },
    { concorrencia: 1 },
  )
  await filas.fila(FILAS.outbox).upsertJobScheduler(
    'relay',
    { every: 2000 },
    {
      name: 'ciclo',
      data: {},
      opts: { removeOnComplete: { count: 5 }, removeOnFail: { count: 20 } },
    },
  )

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
