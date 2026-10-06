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
