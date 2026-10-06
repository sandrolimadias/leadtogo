import type { Job } from 'bullmq'
import type { Redis } from 'ioredis'

/**
 * Consumidor da fila de teste (fora de produção). Idempotente: quando o job traz `eventoId`, o efeito
 * (`INCR chave:n`) acontece uma única vez por evento, mesmo que o job seja reenfileirado depois de
 * concluído, que é o que o `jobId` sozinho não garante (ele só vale enquanto o job existe).
 */
export function processadorDeTeste(valkey: Redis) {
  return async (job: Job): Promise<string> => {
    const { ms, chave, eventoId, tenantVisto } = job.data as {
      ms?: number
      chave?: string
      eventoId?: string
      tenantVisto?: string
    }
    await new Promise((r) => setTimeout(r, ms ?? 0))
    if (!chave) return 'sem-chave'
    if (eventoId) {
      const primeiro = await valkey.set(`${chave}:evento:${eventoId}`, '1', 'EX', 3600, 'NX')
      if (!primeiro) return 'duplicado'
    }
    await valkey.set(chave, job.id ?? 'sem-id', 'EX', 300)
    await valkey.incr(`${chave}:n`)
    if (tenantVisto) await valkey.set(`${chave}:tenant`, tenantVisto, 'EX', 300)
    return 'ok'
  }
}
