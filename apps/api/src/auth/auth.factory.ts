import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { type Conexao, novoId, schema } from '@leadtogo/db'
import { betterAuth } from 'better-auth'
import { twoFactor } from 'better-auth/plugins'
import type { Redis } from 'ioredis'

import { type Configuracao, verificacaoEmailObrigatoria } from '../configuracao/configuracao.js'
import { armazenamentoDeLimite } from './rate-limit-valkey.js'

/** Caminho base do Better Auth dentro da API: tudo em /v1/auth/*. */
export const CAMINHO_AUTH = '/v1/auth'

/** Dias de validade da sessão; renovada por uso a cada dia. */
const SESSAO_DIAS = 7

export interface DependenciasAuth {
  config: Configuracao
  banco: Conexao
  valkey: Redis
}

/**
 * Better Auth só para IDENTIDADE (usuário, sessão, senha, 2FA). Sem o plugin de organizações:
 * empresas, membros, convites e empresa ativa são nossos, sob RLS.
 *  - ids em UUID v7 (colunas `uuid` do schema `auth`);
 *  - sessões no Postgres (fonte da verdade; sem secondaryStorage nem cookie cache);
 *  - rate limit do próprio Better Auth no Valkey (customStorage);
 *  - cadastro público desligado: contas nascem pelo primeiro acesso e pelo aceite de convite.
 */
export function criarAuth({ config, banco, valkey }: DependenciasAuth) {
  const producao = config.NODE_ENV === 'production'
  const origemDoFront = new URL(config.APP_URL).origin

  return betterAuth({
    appName: 'Leadtogo',
    baseURL: new URL(config.API_URL).origin,
    basePath: CAMINHO_AUTH,
    secret: config.BETTER_AUTH_SECRET,
    // Só o front pode originar requisições com cookie (proteção contra CSRF por Origin)
    trustedOrigins: [origemDoFront],
    database: drizzleAdapter(banco.db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: verificacaoEmailObrigatoria(config),
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * SESSAO_DIAS,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        // Empresa ativa da sessão: só o servidor define (POST /v1/sessao/empresa-ativa)
        empresaAtivaId: { type: 'string', required: false, input: false },
      },
    },
    plugins: [twoFactor({ issuer: 'Leadtogo' })],
    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
      customStorage: armazenamentoDeLimite(valkey),
    },
    advanced: {
      database: { generateId: () => novoId() },
      cookiePrefix: 'leadtogo',
      useSecureCookies: producao,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: producao },
      // O IP vem do Express (req.ip, que respeita TRUST_PROXY): o controller o repõe aqui
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
  })
}

export type Auth = ReturnType<typeof criarAuth>
