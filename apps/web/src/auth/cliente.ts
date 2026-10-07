import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/client'

/**
 * Cliente oficial do Better Auth (login, sessão, 2FA, recuperação de senha), apontando para /v1/auth na
 * MESMA origem do front (domínio único: o proxy do Vite em desenvolvimento, o Traefik em produção).
 */
const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin

export const authClient = createAuthClient({
  baseURL: base,
  basePath: '/v1/auth',
  plugins: [twoFactorClient()],
  // o `fetch` é lido a cada chamada (e não na criação do cliente): os testes o trocam
  fetchOptions: {
    customFetchImpl: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  },
})
