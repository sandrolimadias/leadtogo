import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/client'

/**
 * Cliente oficial do Better Auth (login, sessão, 2FA, recuperação de senha), apontando para /v1/auth.
 * Em desenvolvimento e em produção com domínio único a origem é a do próprio front (o proxy do Vite
 * ou o Traefik leva até a API); `VITE_API_URL` só existe se a API ficar em outro domínio.
 */
const base =
  (import.meta.env['VITE_API_URL'] as string | undefined) ||
  (typeof window === 'undefined' ? 'http://localhost' : window.location.origin)

export const authClient = createAuthClient({
  baseURL: base,
  basePath: '/v1/auth',
  plugins: [twoFactorClient()],
  // o `fetch` é lido a cada chamada (e não na criação do cliente): os testes o trocam
  fetchOptions: {
    customFetchImpl: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  },
})
