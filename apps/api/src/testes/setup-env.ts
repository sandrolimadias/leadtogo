import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Cada arquivo de teste começa com o ambiente de teste: bancos e Valkey de teste no lugar dos de
// desenvolvimento. Roda antes dos testes, então a configuração da API já os enxerga.
const env = fileURLToPath(new URL('../../../../.env', import.meta.url))
if (existsSync(env)) process.loadEnvFile(env)

const troca: Record<string, string> = {
  DATABASE_URL: 'TEST_API_DATABASE_URL',
  DATABASE_MIGRATION_URL: 'TEST_API_DATABASE_MIGRATION_URL',
  REDIS_URL: 'TEST_REDIS_URL',
}
for (const [destino, origem] of Object.entries(troca)) {
  const valor = process.env[origem]
  if (valor) process.env[destino] = valor
}
process.env['NODE_ENV'] = 'test'
// Testes não poluem a saída; os que verificam logs passam a configuração explícita
process.env['LOG_LEVEL'] ??= 'silent'

// Valores padrão só para os testes (o CI não tem .env): endereços locais e chaves descartáveis
const padroes: Record<string, string> = {
  APP_URL: 'http://localhost:5173',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAILPIT_URL: 'http://localhost:8025',
  API_URL: 'http://localhost:3000',
  S3_ENDPOINT: 'http://localhost:3900',
  S3_BUCKET: 'leadtogo-arquivos',
  S3_ACCESS_KEY: 'teste',
  S3_SECRET_KEY: 'teste',
}
for (const [chave, valor] of Object.entries(padroes)) process.env[chave] ??= valor
