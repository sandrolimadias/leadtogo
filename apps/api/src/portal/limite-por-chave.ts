import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { RateLimiterRedis } from 'rate-limiter-flexible'

import { VALKEY } from '../infra/infra.module.js'
import { PREFIXO_LIMITE } from '../rate-limit/limite.guard.js'

/**
 * Limite por chave (e-mail, acesso), além do limite por IP da rota: link de entrada e conferência de 2FA são
 * alvos de força bruta e de spam de e-mail. Falha fechada: com o Valkey fora, nega (melhor recusar do que
 * deixar a conferência de 2FA sem freio).
 */
@Injectable()
export class LimitePorChave {
  private readonly log = new Logger(LimitePorChave.name)
  private readonly limitadores = new Map<string, RateLimiterRedis>()

  constructor(@Inject(VALKEY) private readonly valkey: Redis) {}

  /** `true` se ainda cabe (e consome 1 ponto); `false` se estourou ou o Valkey está fora. */
  async permitir(nome: string, chave: string, max: number, janelaS: number): Promise<boolean> {
    const id = `${nome}:${max}:${janelaS}`
    let limitador = this.limitadores.get(id)
    if (!limitador) {
      limitador = new RateLimiterRedis({
        storeClient: this.valkey,
        keyPrefix: `${PREFIXO_LIMITE}portal:${nome}`,
        points: max,
        duration: janelaS,
        rejectIfRedisNotReady: true,
      })
      this.limitadores.set(id, limitador)
    }
    try {
      await limitador.consume(chave)
      return true
    } catch (erro) {
      if (typeof (erro as { msBeforeNext?: unknown }).msBeforeNext !== 'number') {
        this.log.warn(
          `limite (${nome}): Valkey indisponível: ${erro instanceof Error ? erro.message : String(erro)}`,
        )
      }
      return false
    }
  }

  /** Uso único dentro da janela (ex.: o mesmo código TOTP não vale duas vezes). `false` se já foi usado. */
  async marcarUso(chave: string, janelaS: number): Promise<boolean> {
    try {
      const r = await this.valkey.set(
        `${PREFIXO_LIMITE}portal:uso:${chave}`,
        '1',
        'EX',
        janelaS,
        'NX',
      )
      return r === 'OK'
    } catch (erro) {
      this.log.warn(
        `uso único: Valkey indisponível: ${erro instanceof Error ? erro.message : String(erro)}`,
      )
      return false
    }
  }
}
