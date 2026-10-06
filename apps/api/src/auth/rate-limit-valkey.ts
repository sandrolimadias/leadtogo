import type { BetterAuthOptions } from 'better-auth'
import type { Redis } from 'ioredis'
import { RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible'

type BetterAuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions['rateLimit']>['customStorage']
>

/** Prefixo das chaves do rate limit do Better Auth no Valkey (separado do rate limit da API). */
export const PREFIXO_LIMITE_AUTH = 'leadtogo:ba:'

/**
 * Armazenamento do rate limit do Better Auth no Valkey, atômico (`consume` conta e decide num passo).
 * É o `rateLimit.customStorage`: o Valkey atende só o rate limit; as sessões ficam no Postgres.
 */
export function armazenamentoDeLimite(valkey: Redis): BetterAuthRateLimitStorage {
  const limitadores = new Map<string, RateLimiterRedis>()
  const limitador = (janela: number, max: number) => {
    const chave = `${janela}:${max}`
    let l = limitadores.get(chave)
    if (!l) {
      l = new RateLimiterRedis({
        storeClient: valkey,
        keyPrefix: `${PREFIXO_LIMITE_AUTH}${chave}`,
        points: max,
        duration: janela,
        rejectIfRedisNotReady: true,
      })
      limitadores.set(chave, l)
    }
    return l
  }

  return {
    async consume(chave, regra) {
      try {
        await limitador(regra.window, regra.max).consume(chave)
        return { allowed: true, retryAfter: null }
      } catch (erro) {
        const estouro = erro as Partial<RateLimiterRes>
        if (typeof estouro.msBeforeNext === 'number') {
          return { allowed: false, retryAfter: Math.max(1, Math.ceil(estouro.msBeforeNext / 1000)) }
        }
        throw erro // Valkey fora: o Better Auth decide (por padrão, falha a requisição)
      }
    },
  }
}
