import createClient from 'openapi-fetch'

import type { paths } from './gerado/schema.js'

export type { paths, components } from './gerado/schema.js'

/** Cliente tipado da API, gerado do OpenAPI (`pnpm --filter @leadtogo/api-client generate`). */
export function criarApiClient(baseUrl: string, opcoes: { fetch?: typeof fetch } = {}) {
  return createClient<paths>({ baseUrl, credentials: 'include', ...opcoes })
}

export type ApiClient = ReturnType<typeof criarApiClient>
