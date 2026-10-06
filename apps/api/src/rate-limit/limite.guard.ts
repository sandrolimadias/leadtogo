import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'
import type { Redis } from 'ioredis'
import { RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { VALKEY } from '../infra/infra.module.js'
import { CHAVE_LIMITE, CHAVE_SEM_LIMITE, type RegraDeLimite } from './limite.decorator.js'

/** Prefixo das chaves no Valkey (o rate limit é por IP, não por tenant). */
export const PREFIXO_LIMITE = 'leadtogo:rl:'

/**
 * Limite de requisições por IP no Valkey (janela fixa, atômico): uma regra global para a API
 * toda e regras mais duras por rota (`@Limite`). Passou do limite: 429 com `Retry-After`.
 */
@Injectable()
export class LimiteDeRequisicoesGuard implements CanActivate, OnModuleDestroy {
  private readonly log = new Logger(LimiteDeRequisicoesGuard.name)
  private readonly limitadores = new Map<string, RateLimiterRedis>()
  private readonly global: RegraDeLimite

  constructor(
    @Inject(CONFIGURACAO) config: Configuracao,
    @Inject(VALKEY) private readonly valkey: Redis,
    private readonly reflector: Reflector,
  ) {
    this.global = {
      nome: 'global',
      max: config.RATE_LIMIT_MAX,
      janelaS: config.RATE_LIMIT_JANELA_S,
    }
  }

  onModuleDestroy(): void {
    this.limitadores.clear()
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true
    const alvos = [contexto.getHandler(), contexto.getClass()]
    const req = contexto.switchToHttp().getRequest<Request>()
    const res = contexto.switchToHttp().getResponse<Response>()

    const regras: RegraDeLimite[] = []
    if (!this.reflector.getAllAndOverride<boolean | undefined>(CHAVE_SEM_LIMITE, alvos)) {
      regras.push(this.global)
    }
    const daRota = this.reflector.getAllAndOverride<RegraDeLimite | undefined>(CHAVE_LIMITE, alvos)
    if (daRota) regras.push(daRota)

    const ip = req.ip ?? 'desconhecido'
    for (const regra of regras) await this.consumir(regra, ip, res)
    return true
  }

  private limitador(regra: RegraDeLimite): RateLimiterRedis {
    const chave = `${regra.nome}:${regra.max}:${regra.janelaS}`
    let limitador = this.limitadores.get(chave)
    if (!limitador) {
      limitador = new RateLimiterRedis({
        storeClient: this.valkey,
        keyPrefix: `${PREFIXO_LIMITE}${regra.nome}`,
        points: regra.max,
        duration: regra.janelaS,
        // Valkey fora: falha rápido em vez de enfileirar (a política é decidida abaixo)
        rejectIfRedisNotReady: true,
      })
      this.limitadores.set(chave, limitador)
    }
    return limitador
  }

  private async consumir(regra: RegraDeLimite, ip: string, res: Response): Promise<void> {
    try {
      await this.limitador(regra).consume(ip)
    } catch (erro) {
      const estouro = erro as Partial<RateLimiterRes>
      if (typeof estouro.msBeforeNext === 'number') {
        const espera = Math.max(1, Math.ceil(estouro.msBeforeNext / 1000))
        res.setHeader('Retry-After', String(espera))
        throw new ErroApi(
          'muitas_requisicoes',
          'Muitas requisições. Tente novamente em instantes.',
          429,
        )
      }
      // Erro do Valkey (não é estouro de limite)
      this.log.warn(
        `rate limit (${regra.nome}): Valkey indisponível: ${erro instanceof Error ? erro.message : String(erro)}`,
      )
      if (regra.falhaFechada) {
        throw new ErroApi('servico_indisponivel', 'Serviço temporariamente indisponível.', 503)
      }
    }
  }
}
