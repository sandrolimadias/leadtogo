import { z } from 'zod'

/** Texto "true"/"false" (e 1/0) vindo de variável de ambiente. */
const booleano = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')

/** Variável opcional: vazia (`CHAVE=`) vale como não definida, como no .env.example. */
const opcional = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), esquema.optional())

const url = (protocolos: string[]) =>
  z.string().refine(
    (v) => {
      try {
        return protocolos.includes(new URL(v).protocol)
      } catch {
        return false
      }
    },
    { message: `deve ser uma URL ${protocolos.join(' ou ')}` },
  )

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_URL: url(['http:', 'https:']),
    API_URL: url(['http:', 'https:']),
    APP_VERSION: z.string().min(1).default('dev'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Banco: o usuário da aplicação (sem BYPASSRLS). O de migração só é exigido por quem migra.
    DATABASE_URL: url(['postgres:', 'postgresql:']),
    DATABASE_MIGRATION_URL: opcional(url(['postgres:', 'postgresql:'])),

    // Cache, filas e rate limit
    REDIS_URL: url(['redis:', 'rediss:']),
    /** Requisições por IP por janela, no total da API (regras por rota são mais duras) */
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_JANELA_S: z.coerce.number().int().min(1).default(60),
    /**
     * Quantos proxies (Traefik do Coolify) ficam na frente da API, para ler o IP real em
     * X-Forwarded-For. Padrão: 1 em produção, 0 fora dela (0 = nunca confiar no cabeçalho).
     */
    TRUST_PROXY: opcional(z.coerce.number().int().min(0).max(5)),

    // Autenticação (Better Auth). O segredo assina cookies e cifra o segredo do 2FA: troque-o e todas
    // as sessões e os 2FA cadastrados deixam de valer.
    BETTER_AUTH_SECRET: z.string().min(32, 'deve ter ao menos 32 caracteres'),
    /**
     * Exige e-mail verificado para entrar. Padrão: sim em produção, não fora dela (desenvolvimento
     * e testes usam o Mailpit). Em produção só funciona com SMTP configurado (E13).
     */
    VERIFICACAO_EMAIL: opcional(booleano),

    // Primeiro acesso (POST /v1/primeiro-acesso: cria conta, empresa e administrador). Padrão: aberto
    // fora de produção e FECHADO em produção; lá a primeira conta nasce pelo comando
    // `node dist/criar-conta.js`, que não depende desta flag.
    PRIMEIRO_ACESSO: opcional(z.enum(['aberto', 'fechado'])),

    // Login com Google: preparado, mas DESLIGADO. Liga com LOGIN_GOOGLE=true (exige as credenciais do
    // cliente OAuth) e vale só para quem já tem conta (o cadastro por Google continua desligado).
    LOGIN_GOOGLE: opcional(booleano),
    GOOGLE_CLIENT_ID: opcional(z.string().min(1)),
    GOOGLE_CLIENT_SECRET: opcional(z.string().min(1)),

    // E-mail (SMTP): recuperação de senha, verificação de e-mail e convites. Sem SMTP_HOST nenhum e-mail
    // sai (a API avisa no log). Obrigatório se a verificação de e-mail estiver ligada.
    SMTP_HOST: opcional(z.string().min(1)),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleano.default(false),
    SMTP_USER: opcional(z.string().min(1)),
    SMTP_PASSWORD: opcional(z.string().min(1)),
    SMTP_FROM: z.string().min(3).default('Leadtogo <nao-responder@leadtogo.local>'),

    // Arquivos (Garage / S3)
    S3_ENDPOINT: url(['http:', 'https:']),
    S3_REGION: z.string().min(1).default('garage'),
    S3_BUCKET: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleano.default(true),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
  })
  .superRefine((env, ctx) => {
    const verificacao = env.VERIFICACAO_EMAIL ?? env.NODE_ENV === 'production'
    if (verificacao && !env.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message:
          'obrigatória com a verificação de e-mail ligada (em produção é o padrão): configure o SMTP ou defina VERIFICACAO_EMAIL=false',
      })
    }
    if (env.LOGIN_GOOGLE) {
      for (const chave of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const) {
        if (!env[chave]) {
          ctx.addIssue({
            code: 'custom',
            path: [chave],
            message: 'obrigatória com LOGIN_GOOGLE=true',
          })
        }
      }
    }
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_PASSWORD'],
        message: 'SMTP_USER e SMTP_PASSWORD vão juntos',
      })
    }
    if (env.NODE_ENV !== 'production') return
    // Em produção o front e a API são servidos por HTTPS (cookie Secure, CORS só para o front)
    for (const chave of ['APP_URL', 'API_URL'] as const) {
      if (new URL(env[chave]).protocol !== 'https:') {
        ctx.addIssue({ code: 'custom', path: [chave], message: 'em produção deve ser https' })
      }
    }
  })

export type Configuracao = z.infer<typeof esquema>

/** Se o endpoint de primeiro acesso aceita pedidos (aberto em desenvolvimento, fechado em produção). */
export function primeiroAcessoAberto(config: Configuracao): boolean {
  return (
    (config.PRIMEIRO_ACESSO ?? (config.NODE_ENV === 'production' ? 'fechado' : 'aberto')) ===
    'aberto'
  )
}

/** Se o login com Google está ligado (flag + credenciais). */
export function loginGoogleLigado(config: Configuracao): boolean {
  return (
    config.LOGIN_GOOGLE === true && Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
  )
}

/** Se o login exige o e-mail verificado (flag, com padrão pelo ambiente). */
export function verificacaoEmailObrigatoria(config: Configuracao): boolean {
  return config.VERIFICACAO_EMAIL ?? config.NODE_ENV === 'production'
}

/** Erro de configuração: lista as variáveis com problema (nunca os valores, que podem ser segredos). */
export class ErroConfiguracao extends Error {
  constructor(readonly problemas: { variavel: string; motivo: string }[]) {
    super(
      `Configuração inválida (veja o .env.example):\n${problemas
        .map((p) => `  - ${p.variavel}: ${p.motivo}`)
        .join('\n')}`,
    )
    this.name = 'ErroConfiguracao'
  }
}

/** Lê e valida as variáveis de ambiente. Falha com a lista completa do que está errado ou faltando. */
export function carregarConfiguracao(env: NodeJS.ProcessEnv = process.env): Configuracao {
  const resultado = esquema.safeParse(env)
  if (resultado.success) return resultado.data
  throw new ErroConfiguracao(
    resultado.error.issues.map((i) => ({
      variavel: String(i.path[0] ?? '(geral)'),
      motivo: i.code === 'invalid_type' && i.input === undefined ? 'obrigatória' : i.message,
    })),
  )
}
