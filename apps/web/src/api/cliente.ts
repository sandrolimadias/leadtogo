import { criarApiClient } from '@leadtogo/api-client'

/**
 * Cliente da API. Em desenvolvimento e em produção com domínio único a base é vazia (caminhos
 * relativos, /v1/...); o proxy do Vite (dev) ou o Traefik (produção) leva até a API.
 * `VITE_API_URL` só existe se a API ficar em outro domínio.
 */
const base = (import.meta.env['VITE_API_URL'] as string | undefined) ?? ''

export const api = criarApiClient(base)
