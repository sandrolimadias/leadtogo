import { createHash } from 'node:crypto'

import { novoId, sql } from '@leadtogo/db'
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { type Observable, from, lastValueFrom } from 'rxjs'

import { ContextoTenantService } from '../../acesso/contexto-tenant.service.js'
import { ErroApi } from '../../http/erro-api.js'

/** Quanto tempo a resposta guardada vale (a limpeza do worker apaga depois). */
export const VALIDADE_DA_IDEMPOTENCIA_H = 24

/** JSON com as chaves em ordem: o mesmo corpo dá sempre o mesmo hash. */
function estavel(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estavel).join(',')}]`
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>
    return `{${Object.keys(objeto)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estavel(objeto[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(valor ?? null)
}

/**
 * `Idempotency-Key` nos POST da API pública (docs/plano_api_aberta.md, seção 5.1). Roda DENTRO da transação da
 * requisição (o interceptador da chave a abre antes):
 *  - a primeira vez grava a chave com o hash do corpo e, ao terminar, a resposta; se o handler falhar, a transação
 *    desfaz tudo e a chave fica livre para uma nova tentativa;
 *  - a mesma chave com o mesmo corpo devolve a resposta guardada (cabeçalho `Idempotent-Replayed: true`);
 *  - com outro corpo, 409 `idempotencia_conflito`.
 * Duas requisições iguais ao mesmo tempo: a segunda espera a primeira na unicidade do banco e lê o que ela gravou.
 */
@Injectable()
export class IdempotenciaInterceptor implements NestInterceptor {
  constructor(private readonly ctx: ContextoTenantService) {}

  intercept(execucao: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const req = execucao.switchToHttp().getRequest<Request>()
    const res = execucao.switchToHttp().getResponse<Response>()
    const chave = req.headers['idempotency-key']
    if (req.method !== 'POST' || chave === undefined) return proximo.handle()
    if (typeof chave !== 'string' || chave.trim() === '' || chave.length > 100) {
      throw new ErroApi(
        'idempotencia_invalida',
        'O cabeçalho Idempotency-Key precisa ter de 1 a 100 caracteres.',
        400,
      )
    }
    const chaveApi = this.ctx.chaveApi
    if (!chaveApi) return proximo.handle()
    const hash = createHash('sha256')
      .update(`${req.method} ${req.originalUrl.split('?')[0] ?? ''}\n${estavel(req.body)}`)
      .digest('hex')
    const db = this.ctx.db()

    return from(
      (async () => {
        const inserida = await db.execute<{ id: string }>(sql`
          INSERT INTO idempotencia_chaves (id, tenant_id, chave_api_id, chave, hash_corpo)
          VALUES (${novoId()}, ${this.ctx.tenantId}, ${chaveApi.id}, ${chave}, ${hash})
          ON CONFLICT (tenant_id, chave_api_id, chave) DO NOTHING
          RETURNING id`)
        if (inserida.length === 0) {
          const [guardada] = await db.execute<{
            hash_corpo: string
            status_http: number | null
            resposta: unknown
            vencida: boolean
          }>(sql`
            SELECT hash_corpo, status_http, resposta,
              criado_em < now() - make_interval(hours => ${VALIDADE_DA_IDEMPOTENCIA_H}) AS vencida
            FROM idempotencia_chaves
            WHERE chave_api_id = ${chaveApi.id} AND chave = ${chave}`)
          if (guardada && !guardada.vencida) {
            if (guardada.hash_corpo !== hash) {
              throw new ErroApi(
                'idempotencia_conflito',
                'Esta Idempotency-Key já foi usada com outro corpo ou em outra rota.',
                409,
              )
            }
            res.setHeader('Idempotent-Replayed', 'true')
            if (guardada.status_http) res.status(guardada.status_http)
            return guardada.resposta
          }
          // Vencida: a chave volta a valer como nova
          await db.execute(sql`
            UPDATE idempotencia_chaves SET hash_corpo = ${hash}, resposta = NULL, status_http = NULL,
              criado_em = now()
            WHERE chave_api_id = ${chaveApi.id} AND chave = ${chave}`)
        }
        const resposta: unknown = await lastValueFrom(proximo.handle() as Observable<unknown>, {
          defaultValue: undefined,
        })
        await db.execute(sql`
          UPDATE idempotencia_chaves SET resposta = ${JSON.stringify(resposta ?? null)}::jsonb,
            status_http = ${res.statusCode}
          WHERE chave_api_id = ${chaveApi.id} AND chave = ${chave}`)
        return resposta
      })(),
    )
  }
}
