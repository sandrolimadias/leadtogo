import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { type Conexao, novoId, schema } from '@leadtogo/db'
import { betterAuth } from 'better-auth'
import { twoFactor } from 'better-auth/plugins'
import type { Redis } from 'ioredis'

import { type Configuracao, verificacaoEmailObrigatoria } from '../configuracao/configuracao.js'
import type { EmailService } from '../email/email.service.js'
import { emailRedefinirSenha, emailVerificarEmail } from '../email/modelos.js'
import { armazenamentoDeLimite } from './rate-limit-valkey.js'

/** Caminho base do Better Auth dentro da API: tudo em /v1/auth/*. */
export const CAMINHO_AUTH = '/v1/auth'

/** Dias de validade da sessão; renovada por uso a cada dia. */
const SESSAO_DIAS = 7

export interface DependenciasAuth {
  config: Configuracao
  banco: Conexao
  valkey: Redis
  email: EmailService
}

/**
 * Better Auth só para IDENTIDADE (usuário, sessão, senha, 2FA). Sem o plugin de organizações:
 * empresas, membros, convites e empresa ativa são nossos, sob RLS.
 *  - ids em UUID v7 (colunas `uuid` do schema `auth`);
 *  - sessões no Postgres (fonte da verdade; sem secondaryStorage nem cookie cache);
 *  - rate limit do próprio Better Auth no Valkey (customStorage);
 *  - cadastro público desligado: contas nascem pelo primeiro acesso e pelo aceite de convite.
 */
export function criarAuth({ config, banco, valkey, email }: DependenciasAuth) {
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
      // O link vale 1 h e é de uso único. O pedido responde igual exista ou não a conta (não revela cadastro)
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await email.enviar(user.email, emailRedefinirSenha(user.name, url))
      },
    },
    emailVerification: {
      // Quem tenta entrar sem verificar recebe um novo e-mail de confirmação
      sendOnSignIn: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await email.enviar(user.email, emailVerificarEmail(user.name, url))
      },
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
      // Códigos de 6 dígitos são fáceis de adivinhar: poucas tentativas por minuto
      customRules: {
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        // Cada pedido manda um e-mail: poucos por 5 minutos (anti-spam e anti-enumeração)
        '/request-password-reset': { window: 300, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
      },
    },
    advanced: {
      // O Better Auth DESLIGA a validação de origem e de redirectTo/callbackURL quando NODE_ENV=test.
      // Fixamos ligado em qualquer ambiente: sem isso, um redirectTo de fora levaria o token de
      // redefinição de senha a outro site, e os testes não pegariam.
      disableOriginCheck: false,
      disableCSRFCheck: false,
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
