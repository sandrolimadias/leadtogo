import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { type Conexao, novoId, schema } from '@leadtogo/db'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { twoFactor } from 'better-auth/plugins'
import type { Redis } from 'ioredis'

import {
  type Configuracao,
  loginGoogleLigado,
  verificacaoEmailObrigatoria,
} from '../configuracao/configuracao.js'
import type { EmailService } from '../email/email.service.js'
import { emailRedefinirSenha, emailVerificarEmail } from '../email/modelos.js'
import { obrigatorioParaUsuario } from '../acesso/dois-fatores.js'
import { escolherEmpresaAtiva } from '../acesso/empresa-ativa.js'
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
  // O gancho abaixo precisa chamar a API do próprio Better Auth (verifyTOTP): a instância só existe depois
  const verificadorDeCodigo: {
    verificar?: (codigo: string, headers: Headers) => Promise<unknown>
  } = {}

  const auth = betterAuth({
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
        await email.enfileirar(user.email, emailRedefinirSenha(user.name, url))
      },
    },
    emailVerification: {
      // Quem tenta entrar sem verificar recebe um novo e-mail de confirmação
      sendOnSignIn: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        // Qualquer e-mail de confirmação (primeiro acesso, reenvio, nova tentativa de login) termina na
        // tela do front que mostra "E-mail confirmado" ou o erro do link
        const link = new URL(url)
        link.searchParams.set('callbackURL', `${origemDoFront}/verificar-email?confirmado=1`)
        await email.enfileirar(user.email, emailVerificarEmail(user.name, link.toString()))
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
    // Google: só existe se a flag estiver ligada. Mesmo ligado, não cria conta (disableSignUp):
    // entra quem já tem usuário com o mesmo e-mail.
    socialProviders: loginGoogleLigado(config)
      ? {
          google: {
            clientId: config.GOOGLE_CLIENT_ID ?? '',
            clientSecret: config.GOOGLE_CLIENT_SECRET ?? '',
            disableSignUp: true,
            prompt: 'select_account',
          },
        }
      : {},
    plugins: [twoFactor({ issuer: 'Leadtogo' })],
    databaseHooks: {
      session: {
        create: {
          // A sessão nasce já com a empresa ativa: a última usada, ou a única da pessoa (ver empresa-ativa.ts)
          before: async (sessao) => ({
            data: { ...sessao, empresaAtivaId: await escolherEmpresaAtiva(banco, sessao.userId) },
          }),
        },
      },
    },
    hooks: {
      // Desativar o 2FA: (1) só se nenhuma regra o exigir deste usuário (administrador de conta ou a
      // política de qualquer empresa dele) e (2) com um código atual do app, além da senha que o Better
      // Auth já pede. O 403 e o 400 saem aqui, antes de qualquer alteração.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/two-factor/disable') return
        const atual = await getSessionFromCtx(ctx)
        if (!atual) return // sem sessão o próprio Better Auth responde 401
        if (await obrigatorioParaUsuario(banco, atual.user.id)) {
          throw new APIError('FORBIDDEN', {
            message: 'A verificação em duas etapas é obrigatória para você.',
            code: 'DOIS_FATORES_OBRIGATORIO',
          })
        }
        const codigo = (ctx.body as { code?: unknown } | undefined)?.code
        if (typeof codigo !== 'string' || codigo.length === 0) {
          throw new APIError('BAD_REQUEST', {
            message: 'Informe um código do app autenticador.',
            code: 'CODIGO_OBRIGATORIO',
          })
        }
        // lança 401 INVALID_CODE se o código estiver errado
        await verificadorDeCodigo.verificar?.(codigo, ctx.headers ?? new Headers())
      }),
    },
    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
      customStorage: armazenamentoDeLimite(valkey),
      // Códigos de 6 dígitos são fáceis de adivinhar: poucas tentativas por minuto
      customRules: {
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/two-factor/disable': { window: 60, max: 5 },
        '/two-factor/generate-backup-codes': { window: 60, max: 5 },
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
  verificadorDeCodigo.verificar = (codigo, headers) =>
    auth.api.verifyTOTP({ body: { code: codigo }, headers })
  return auth
}

export type Auth = ReturnType<typeof criarAuth>
