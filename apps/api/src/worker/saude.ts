import { createServer, type Server } from 'node:http'

import type { Conexao } from '@leadtogo/db'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import type { WorkerFilas } from './worker-filas.service.js'

/** Quanto o último ciclo do relay do outbox pode ter de idade antes de o worker ser dado como travado. */
export const IDADE_MAXIMA_DO_CICLO_MS = 30_000

export interface EstadoDoWorker {
  /** Quando o relay do outbox concluiu o último ciclo (ms desde a época); null = ainda não rodou */
  ultimoCicloEm: () => number | null
  /** O relay está configurado neste processo? (sem ele não há o que vigiar) */
  relayAtivo: boolean
}

const limite = <T>(promessa: Promise<T>, ms = 2000): Promise<T> =>
  Promise.race([
    promessa,
    new Promise<never>((_, rejeitar) =>
      setTimeout(() => rejeitar(new Error('tempo esgotado')), ms).unref(),
    ),
  ])

/**
 * Healthcheck do worker, que não serve HTTP de verdade: um servidorzinho em 127.0.0.1 (loopback do
 * container; nenhuma porta é publicada e outros containers não o alcançam), consultado pelo comando
 * `node dist/saude-worker.js`, que é o que o Coolify executa. 200 só se TUDO estiver bem:
 * consumidores rodando, Valkey, Postgres e (com o relay ligado) um ciclo recente do outbox.
 */
export function iniciarServidorDeSaude(
  porta: number,
  deps: { filas: WorkerFilas; valkey: Redis; banco: Conexao; estado: EstadoDoWorker; log: Logger },
): Promise<Server> {
  const servidor = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404).end()
      return
    }
    void (async () => {
      const checks = {
        consumidores: deps.filas.consumidoresVivos(),
        valkey: await limite(deps.valkey.ping()).then(
          (r) => r === 'PONG',
          () => false,
        ),
        database: await limite(deps.banco.cliente`SELECT 1`).then(
          () => true,
          () => false,
        ),
        relay: true,
      }
      if (deps.estado.relayAtivo) {
        const ultimo = deps.estado.ultimoCicloEm()
        checks.relay = ultimo !== null && Date.now() - ultimo < IDADE_MAXIMA_DO_CICLO_MS
      }
      const ok = Object.values(checks).every(Boolean)
      if (!ok) deps.log.warn({ checks }, 'healthcheck do worker falhou')
      res
        .writeHead(ok ? 200 : 503, { 'content-type': 'application/json' })
        .end(JSON.stringify({ status: ok ? 'ok' : 'erro', checks }))
    })()
  })
  return new Promise((resolver, rejeitar) => {
    servidor.once('error', rejeitar)
    servidor.listen(porta, '127.0.0.1', () => resolver(servidor))
  })
}
