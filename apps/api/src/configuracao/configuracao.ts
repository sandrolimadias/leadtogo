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

    // Worker (filas BullMQ no Valkey). Ver docs/esteira_deploy.md (tempos de parada).
    /** Prefixo das chaves das filas no Valkey */
    FILA_PREFIXO: z.string().min(1).default('leadtogo:fila'),
    /** Jobs processados em paralelo por fila */
    WORKER_CONCORRENCIA: z.coerce.number().int().min(1).max(100).default(5),
    /**
     * Prazo, em segundos, para os jobs em andamento terminarem depois do SIGTERM. Passado o prazo o
     * worker sai e o BullMQ devolve o job a outro worker. O stop timeout do Coolify deve ser MAIOR.
     */
    WORKER_ENCERRAMENTO_S: z.coerce.number().int().min(1).max(600).default(30),
    /** Porta do healthcheck do worker (só no loopback do container, nunca publicada) */
    WORKER_SAUDE_PORTA: z.coerce.number().int().min(0).max(65535).default(3001),
    /** Tempo que o worker "segura" um job; sem renovar nesse prazo, o job é dado como parado e reprocessado */
    /** Intervalo entre ciclos do relay do outbox (latência dos e-mails de convite) */
    OUTBOX_INTERVALO_MS: z.coerce.number().int().min(50).default(2000),
    /** E-mail pela fila: tentativas e base da espera exponencial (5 s, 10 s, 20 s...) */
    EMAIL_TENTATIVAS: z.coerce.number().int().min(1).max(20).default(6),
    EMAIL_ESPERA_MS: z.coerce.number().int().min(10).default(5000),
    /**
     * Chave AES-256 (32 bytes em base64: `openssl rand -base64 32`) que cifra o conteúdo dos e-mails de
     * identidade enquanto esperam na fila (os links levam token). O texto cifrado leva o prefixo `v1:`
     * da versão da chave, para poder trocá-la. Obrigatória em produção.
     */
    TOKEN_ENCRYPTION_KEY: opcional(z.string().min(1)),
    FILA_LOCK_MS: z.coerce.number().int().min(500).default(30_000),

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
    /** Limite de conexão e de envio por e-mail: o convite é enviado dentro de uma transação do banco */
    SMTP_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleano.default(false),
    SMTP_USER: opcional(z.string().min(1)),
    SMTP_PASSWORD: opcional(z.string().min(1)),
    SMTP_FROM: z.string().min(3).default('Leadtogo <nao-responder@leadtogo.local>'),

    // Observabilidade (docs/runbook_observabilidade.md). Sem SENTRY_DSN o SDK fica desligado.
    /** DSN do projeto leadtogo-api no GlitchTip (API e worker; a tag `papel` diferencia) */
    SENTRY_DSN: opcional(url(['http:', 'https:'])),
    /** Token do GET /health/alertas (header X-Alertas-Token). Sem ele o endpoint não existe (404) */
    ALERTAS_TOKEN: opcional(z.string().min(32, 'deve ter ao menos 32 caracteres')),
    /** Falhas finais de jobs nas últimas 24 h a partir das quais o /health/alertas responde 503 */
    ALERTAS_LIMITE_JOBS_FALHOS: z.coerce.number().int().min(1).default(1),

    // Consulta de CNPJ (docs/configuracao_tecnologia.md, seção 17). Padrões servem para produção;
    // apontar `MINHA_RECEITA_URL` para uma instância própria da Minha Receita não exige mudar código.
    MINHA_RECEITA_URL: url(['http:', 'https:']).default('https://minhareceita.org'),
    /** Segunda tentativa (a BrasilAPI repassa a Minha Receita: ver a limitação no ReceitaService) */
    BRASILAPI_URL: url(['http:', 'https:']).default('https://brasilapi.com.br/api/cnpj/v1'),
    /** Prazo de cada consulta à Receita, em milissegundos */
    RECEITA_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8000),

    // Geolocalização (docs/plano_geolocalizacao.md). Sem NOMINATIM_URL (desenvolvimento) a cascata segue só
    // com o CNEFE e o CEP. Os provedores de CEP são públicos; só o CEP sai do Leadtogo.
    /** Nominatim local só do ES (serviço do Coolify, rede interna), ex.: http://nominatim:8080 */
    NOMINATIM_URL: opcional(url(['http:', 'https:'])),
    /** Prazo de cada consulta ao Nominatim, em milissegundos */
    NOMINATIM_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8000),
    VIACEP_URL: url(['http:', 'https:']).default('https://viacep.com.br/ws'),
    BRASILAPI_CEP_URL: url(['http:', 'https:']).default('https://brasilapi.com.br/api/cep/v1'),
    /** Prazo de cada consulta de CEP, em milissegundos */
    CEP_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8000),
    /** Geocodificar sozinho a empresa nova ou com o endereço alterado (ligado em produção; os testes desligam) */
    GEO_AUTOMATICA: booleano.default(true),
    /** UF que o mapa e os lotes mostram por padrão (as microrregiões da lista); nada no código é fixo ao ES */
    GEO_UF: z.string().length(2).default('ES'),
    /** Geocodificações ao mesmo tempo no worker (a VPS tem 4 CPUs ARM, já com carga): padrão 1 */
    GEO_CONCORRENCIA: z.coerce.number().int().min(1).max(4).default(1),
    /** No máximo quantas empresas geocodificar por minuto (protege os serviços de CEP e a CPU) */
    GEO_LIMITE_POR_MINUTO: z.coerce.number().int().min(1).max(600).default(120),
    /** Por quantos dias a resposta de uma consulta externa (Nominatim, CEP) vale como cache */
    GEO_CACHE_DIAS: z.coerce.number().int().min(0).max(365).default(90),

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
    if (env.TOKEN_ENCRYPTION_KEY && Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64').length !== 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOKEN_ENCRYPTION_KEY'],
        message: 'deve ter 32 bytes em base64 (gere com: openssl rand -base64 32)',
      })
    }
    if (env.NODE_ENV !== 'production') return
    if (!env.TOKEN_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOKEN_ENCRYPTION_KEY'],
        message: 'obrigatória em produção',
      })
    }
    // Em produção o front e a API são servidos por HTTPS (cookie Secure). A única exceção é o próprio
    // computador (localhost): é como o `docker/compose.imagens.yml` roda as imagens de produção para teste, e
    // os navegadores aceitam cookie Secure em http://localhost.
    for (const chave of ['APP_URL', 'API_URL'] as const) {
      const { protocol, hostname } = new URL(env[chave])
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
      if (protocol !== 'https:' && !local) {
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
