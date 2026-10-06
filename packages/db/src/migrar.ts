import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/**
 * Pasta das migrações SQL: `dist/migrations` (copiada no build, é o que vai para a imagem) ou,
 * rodando do código-fonte, `migrations/` na raiz do pacote.
 */
export function pastaMigracoes(): string {
  const noDist = new URL('./migrations/', import.meta.url)
  return fileURLToPath(existsSync(noDist) ? noDist : new URL('../migrations/', import.meta.url))
}

// Trava de sessão: dois deploys simultâneos não migram ao mesmo tempo
const CHAVE_TRAVA = 7_201_001

/**
 * Aplica as migrações pendentes com o migrador do drizzle-orm (o drizzle-kit não vai para a
 * imagem de produção). Use a URL do `leadtogo_owner` (DATABASE_MIGRATION_URL).
 */
export async function aplicarMigracoes(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await sql`SELECT pg_advisory_lock(${CHAVE_TRAVA})`
    await migrate(drizzle(sql), { migrationsFolder: pastaMigracoes() })
  } finally {
    await sql`SELECT pg_advisory_unlock(${CHAVE_TRAVA})`.catch(() => undefined)
    await sql.end()
  }
}
