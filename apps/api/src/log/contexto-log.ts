import { AsyncLocalStorage } from 'node:async_hooks'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { novoId } from '@leadtogo/db'

/**
 * Identificação da requisição em andamento, presente em TODA linha de log dela:
 * `request_id` (sempre), `tenant_id` e `user_id` (preenchidos pelos guards, quando conhecidos).
 */
export interface ContextoLog {
  requestId: string
  tenantId?: string
  userId?: string
}

const armazenamento = new AsyncLocalStorage<ContextoLog>()

/** Aceita o `x-request-id` do cliente só se for curto e inofensivo (evita injeção em logs). */
const ID_VALIDO = /^[A-Za-z0-9._-]{8,64}$/

export function idDaRequisicao(req: IncomingMessage): string {
  const recebido = req.headers['x-request-id']
  const id = Array.isArray(recebido) ? recebido[0] : recebido
  return id && ID_VALIDO.test(id) ? id : novoId()
}

/** Chave onde o contexto fica na própria requisição (o log de "request completed" lê dali). */
export const CHAVE_CONTEXTO = Symbol('contextoLog')

type ComContexto = IncomingMessage & { [CHAVE_CONTEXTO]?: ContextoLog; id?: string | number }

export function contextoDaRequisicao(req: IncomingMessage): ContextoLog | undefined {
  return (req as ComContexto)[CHAVE_CONTEXTO]
}

/** Abre o contexto da requisição e roda o resto da cadeia dentro dele. */
export function executarComContexto(
  req: IncomingMessage,
  res: ServerResponse,
  proximo: () => void,
): void {
  const requestId = String((req as ComContexto).id ?? idDaRequisicao(req))
  const contexto: ContextoLog = { requestId }
  ;(req as ComContexto)[CHAVE_CONTEXTO] = contexto
  if (!res.hasHeader('x-request-id')) res.setHeader('x-request-id', requestId)
  armazenamento.run(contexto, proximo)
}

export function contextoAtual(): ContextoLog | undefined {
  return armazenamento.getStore()
}

/** Chamado pelos guards: a partir daqui os logs da requisição levam o tenant e o usuário. */
export function identificarNoLog(dados: { tenantId?: string; userId?: string }): void {
  const contexto = armazenamento.getStore()
  if (!contexto) return
  if (dados.tenantId !== undefined) contexto.tenantId = dados.tenantId
  if (dados.userId !== undefined) contexto.userId = dados.userId
}

/** Campos do contexto no formato do log (nomes em snake_case). */
export function camposDoContexto(contexto: ContextoLog | undefined): Record<string, string> {
  if (!contexto) return {}
  return {
    request_id: contexto.requestId,
    ...(contexto.tenantId ? { tenant_id: contexto.tenantId } : {}),
    ...(contexto.userId ? { user_id: contexto.userId } : {}),
  }
}
