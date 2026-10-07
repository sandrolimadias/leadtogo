import { criarApiClient } from '@leadtogo/api-client'

/**
 * Cliente da API. Sempre por caminhos relativos (/v1/...): em desenvolvimento o proxy do Vite leva até a
 * API; em produção o Traefik roteia `crm.aledias.com.br/v1` para a API e o resto para o web (domínio
 * único). Por isso a mesma imagem do web serve para qualquer ambiente e não há CORS nem cookie entre origens.
 */
export const api = criarApiClient('', {
  // `fetch` lido a cada chamada (e não na criação): os testes o trocam
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
})
