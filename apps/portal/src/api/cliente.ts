import { criarApiClient } from '@leadtogo/api-client'

/**
 * Cliente da API. Sempre por caminhos relativos (/v1/portal/...): em desenvolvimento o proxy do Vite leva até a
 * API; em produção o Traefik roteia `portal.aledias.com.br/v1` para a API e o resto para o portal (domínio
 * único, como o CRM). O cookie da sessão é do host do portal: não há CORS nem cookie entre origens.
 */
export const api = criarApiClient('', {
  // `fetch` lido a cada chamada (e não na criação): os testes o trocam
  fetch: (...args) => globalThis.fetch(...args),
})
