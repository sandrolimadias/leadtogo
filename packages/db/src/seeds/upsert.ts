import { getTableColumns, or, type SQL, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

import type * as schema from '../schema/index.js'

export type Db = PostgresJsDatabase<typeof schema>

const LOTE = 1000

const paraSnake = (nome: string) => nome.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)

/**
 * Insere ou atualiza (upsert) em lotes: rodar o seed de novo não duplica nada e corrige
 * o que foi alterado. `atualizar` lista as colunas (nomes do schema) reescritas no conflito.
 * A linha só é reescrita se algum valor mudou (`IS DISTINCT FROM`): repetir o seed sem
 * mudança de dados não grava nada (sem WAL nem linhas mortas), o que o torna barato a cada start.
 */
export async function upsert<T extends PgTable>(
  db: Db,
  tabela: T,
  linhas: T['$inferInsert'][],
  alvo: PgColumn,
  atualizar: (keyof T['$inferInsert'] & string)[],
): Promise<number> {
  const set: Record<string, SQL> = {}
  const colunas = getTableColumns(tabela) as Record<string, PgColumn>
  const mudou: SQL[] = []
  for (const coluna of atualizar) {
    const nova = sql`excluded.${sql.identifier(paraSnake(coluna))}`
    set[coluna] = nova
    const atual = colunas[coluna]
    if (atual) mudou.push(sql`${atual} IS DISTINCT FROM ${nova}`)
  }
  const setWhere = or(...mudou)
  for (let i = 0; i < linhas.length; i += LOTE) {
    const insercao = db.insert(tabela).values(linhas.slice(i, i + LOTE))
    if (atualizar.length === 0) await insercao.onConflictDoNothing({ target: alvo })
    else await insercao.onConflictDoUpdate({ target: alvo, set, setWhere })
  }
  return linhas.length
}
