import { z } from 'zod'

/** Texto "true"/"false" (e 1/0) vindo de variável de ambiente. */
const booleano = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')

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
    DATABASE_MIGRATION_URL: url(['postgres:', 'postgresql:']).optional(),

    // Cache, filas e rate limit
    REDIS_URL: url(['redis:', 'rediss:']),
    /** Requisições por IP por janela, no total da API (regras por rota são mais duras) */
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_JANELA_S: z.coerce.number().int().min(1).default(60),
    /**
     * Quantos proxies (Traefik do Coolify) ficam na frente da API, para ler o IP real em
     * X-Forwarded-For. Padrão: 1 em produção, 0 fora dela (0 = nunca confiar no cabeçalho).
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).optional(),

    // Arquivos (Garage / S3)
    S3_ENDPOINT: url(['http:', 'https:']),
    S3_REGION: z.string().min(1).default('garage'),
    S3_BUCKET: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleano.default(true),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    // Em produção o front e a API são servidos por HTTPS (cookie Secure, CORS só para o front)
    for (const chave of ['APP_URL', 'API_URL'] as const) {
      if (new URL(env[chave]).protocol !== 'https:') {
        ctx.addIssue({ code: 'custom', path: [chave], message: 'em produção deve ser https' })
      }
    }
  })

export type Configuracao = z.infer<typeof esquema>

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
