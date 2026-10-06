import { type SQL, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import type * as schema from '../schema/index.js'

export type Db = PostgresJsDatabase<typeof schema>

const LOTE = 1000

const paraSnake = (nome: string) => nome.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)

/**
 * Insere ou atualiza (upsert) em lotes: rodar o seed de novo não duplica nada e corrige
 * o que foi alterado. `atualizar` lista as colunas (nomes do schema) reescritas no conflito.
 */
export async function upsert<T extends PgTable>(
  db: Db,
  tabela: T,
  linhas: T['$inferInsert'][],
  alvo: PgColumn,
  atualizar: (keyof T['$inferInsert'] & string)[],
): Promise<number> {
  const set: Record<string, SQL> = {}
  for (const coluna of atualizar) set[coluna] = sql`excluded.${sql.identifier(paraSnake(coluna))}`
  for (let i = 0; i < linhas.length; i += LOTE) {
    await db
      .insert(tabela)
      .values(linhas.slice(i, i + LOTE))
      .onConflictDoUpdate({ target: alvo, set })
  }
  return linhas.length
}
