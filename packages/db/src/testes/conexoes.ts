import postgres from 'postgres'

import { carregarEnv } from '../env.js'

carregarEnv()

function url(nome: 'TEST_DATABASE_URL' | 'TEST_DATABASE_MIGRATION_URL'): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`${nome} não definida (veja o .env.example e rode pnpm dev:up)`)
  if (!new URL(valor).pathname.endsWith('_test')) {
    throw new Error(`${nome} deve apontar para um banco *_test (os testes apagam o schema)`)
  }
  return valor
}

export type Sql = postgres.Sql

/** Conexão como `leadtogo_app`: a mesma da API, sujeita ao RLS. É com ela que se prova o isolamento. */
export function conectarApp(): Sql {
  return postgres(url('TEST_DATABASE_URL'), { max: 4, onnotice: () => {} })
}

/** Conexão como `leadtogo_owner`: dona das tabelas (também sujeita ao RLS por causa do FORCE). */
export function conectarOwner(): Sql {
  return postgres(url('TEST_DATABASE_MIGRATION_URL'), { max: 4, onnotice: () => {} })
}

/** Roda `fn` numa transação com o tenant ativo (e, opcionalmente, a lista do consolidado). */
export async function comTenant<T>(
  sql: Sql,
  tenantId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  tenantIds: string[] = [],
): Promise<T> {
  return (await sql.begin(async (tx) => {
    if (tenantId) await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    if (tenantIds.length > 0) {
      await tx`SELECT set_config('app.tenant_ids', ${`{${tenantIds.join(',')}}`}, true)`
    }
    return fn(tx)
  })) as T
}
