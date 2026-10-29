import { TAMANHO_MAXIMO_DA_BUSCA } from '@leadtogo/shared'

/** O que fica na URL da tela `/busca`: só o termo. */
export interface BuscaDaTela {
  q?: string
}

/** `validateSearch` da rota: o termo aparado e no tamanho máximo da busca. */
export function lerBusca(entrada: Record<string, unknown>): BuscaDaTela {
  const q = typeof entrada['q'] === 'string' ? entrada['q'].trim() : ''
  return q ? { q: q.slice(0, TAMANHO_MAXIMO_DA_BUSCA) } : {}
}
