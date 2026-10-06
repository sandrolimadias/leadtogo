import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { zerarEMigrar } from '@leadtogo/db/testes'

// Os testes da API usam o banco leadtogo_api_test (o do packages/db é outro: o turbo roda os
// dois em paralelo). Zera e migra do zero uma vez por execução.
export default async function setup(): Promise<void> {
  const env = fileURLToPath(new URL('../../../../.env', import.meta.url))
  if (existsSync(env)) process.loadEnvFile(env)
  const url = process.env['TEST_API_DATABASE_MIGRATION_URL']
  if (!url) throw new Error('TEST_API_DATABASE_MIGRATION_URL não definida (veja o .env.example)')
  await zerarEMigrar(url)
}
