import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { zerarEMigrar } from '@leadtogo/db/testes'
import { Redis } from 'ioredis'

// Os testes da API usam o banco leadtogo_api_test (o do packages/db é outro: o turbo roda os
// dois em paralelo). Zera e migra do zero uma vez por execução.
export default async function setup(): Promise<void> {
  const env = fileURLToPath(new URL('../../../../.env', import.meta.url))
  if (existsSync(env)) process.loadEnvFile(env)
  const url = process.env['TEST_API_DATABASE_MIGRATION_URL']
  if (!url) throw new Error('TEST_API_DATABASE_MIGRATION_URL não definida (veja o .env.example)')
  await zerarEMigrar(url)
  await zerarValkeyDeTeste()
}

// Cada teste de fila/worker usa um prefixo próprio e deixa as chaves para trás: sem limpar, o Valkey de
// teste acumulava milhares de chaves entre execuções. Só zera um banco numerado (nunca o 0 de desenvolvimento).
async function zerarValkeyDeTeste(): Promise<void> {
  const url = process.env['TEST_REDIS_URL']
  if (!url || !/\/[1-9]\d*$/.test(url)) return
  const valkey = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 })
  try {
    await valkey.connect()
    await valkey.flushdb()
  } finally {
    valkey.disconnect()
  }
}
