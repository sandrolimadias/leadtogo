import { type CanActivate, type ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { type Conexao, sql } from '@leadtogo/db'
import type { Request, Response } from 'express'
import type { Redis } from 'ioredis'
import { RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { BANCO, VALKEY } from '../infra/infra.module.js'
import { identificarNoLog } from '../log/contexto-log.js'
import { PREFIXO_LIMITE } from '../rate-limit/limite.guard.js'
import { CHAVE_API_PUBLICA } from './chave.decorators.js'
import { ambienteDe, hashDoTokenDaChave, tokenDoCabecalho } from './token-chave.js'

/** A chave localizada pela guarda; o interceptador confere o resto já sob RLS. */
export interface ChaveLocalizada {
  chaveId: string
  tenantId: string
}

export type RequisicaoComChave = Request & { chaveLocalizada?: ChaveLocalizada }

/** Limites por chave (docs/plano_api_aberta.md, seção 4.6), além do limite global por IP. */
export const LIMITE_DA_CHAVE_POR_MINUTO = 120
export const LIMITE_DA_CHAVE_POR_DIA = 20_000

/** Mesma resposta para chave ausente, mal formada, inexistente, revogada, vencida ou de outro ambiente. */
export const chaveInvalida = () =>
  new ErroApi(
    'chave_invalida',
    'Chave de API inválida, revogada ou vencida. Envie: Authorization: Bearer ltg_...',
    401,
  )

/**
 * Guarda das rotas da API pública (`@ApiPublica`): a chave vem em `Authorization: Bearer ltg_...` (nunca na
 * URL). Acha a chave pelo hash (`app_localizar_chave`, antes de saber a empresa) e aplica os limites da chave.
 * As outras rotas não passam por aqui (e uma chave nelas cai no 401 do controle de acesso do CRM).
 */
@Injectable()
export class ChaveGuard implements CanActivate {
  private readonly log = new Logger(ChaveGuard.name)
  private readonly porMinuto: RateLimiterRedis
  private readonly porDia: RateLimiterRedis

  constructor(
    private readonly reflector: Reflector,
    @Inject(BANCO) private readonly banco: Conexao,
    @Inject(VALKEY) valkey: Redis,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {
    const limitador = (nome: string, pontos: number, duracao: number) =>
      new RateLimiterRedis({
        storeClient: valkey,
        keyPrefix: `${PREFIXO_LIMITE}chave:${nome}`,
        points: pontos,
        duration: duracao,
        rejectIfRedisNotReady: true,
      })
    this.porMinuto = limitador('minuto', LIMITE_DA_CHAVE_POR_MINUTO, 60)
    this.porDia = limitador('dia', LIMITE_DA_CHAVE_POR_DIA, 86_400)
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true
    const marcada = this.reflector.getAllAndOverride<boolean | undefined>(CHAVE_API_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ])
    if (marcada !== true) return true

    const req = contexto.switchToHttp().getRequest<RequisicaoComChave>()
    const res = contexto.switchToHttp().getResponse<Response>()
    const lido = tokenDoCabecalho(req.headers.authorization)
    if (!lido || lido.ambiente !== ambienteDe(this.config.NODE_ENV)) throw chaveInvalida()

    const [achada] = await this.banco.db.execute<{ chave_id: string; tenant_id: string }>(
      sql`SELECT chave_id, tenant_id FROM app_localizar_chave(${hashDoTokenDaChave(lido.token)})`,
    )
    if (!achada) throw chaveInvalida()
    identificarNoLog({ tenantId: achada.tenant_id })

    await this.consumir(achada.chave_id, res)
    req.chaveLocalizada = { chaveId: achada.chave_id, tenantId: achada.tenant_id }
    return true
  }

  /** Um ponto em cada janela; estourou: 429 com `Retry-After`. Valkey fora: deixa passar (aviso no log). */
  private async consumir(chaveId: string, res: Response): Promise<void> {
    try {
      const minuto = await this.porMinuto.consume(chaveId)
      res.setHeader('X-RateLimit-Limit', String(LIMITE_DA_CHAVE_POR_MINUTO))
      res.setHeader('X-RateLimit-Remaining', String(minuto.remainingPoints))
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(minuto.msBeforeNext / 1000)))
      await this.porDia.consume(chaveId)
    } catch (erro) {
      const estouro = erro as Partial<RateLimiterRes>
      if (typeof estouro.msBeforeNext === 'number') {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(estouro.msBeforeNext / 1000))))
        res.setHeader('X-RateLimit-Remaining', '0')
        throw new ErroApi(
          'muitas_requisicoes',
          'Limite de requisições desta chave atingido. Tente novamente em instantes.',
          429,
        )
      }
      this.log.warn(
        `limite da chave: Valkey indisponível: ${erro instanceof Error ? erro.message : String(erro)}`,
      )
    }
  }
}
