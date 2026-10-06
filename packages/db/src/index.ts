import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema/index.js'

export { schema }

/** Cria a conexão Drizzle (postgres.js). A API usa o usuário da aplicação, sujeito a RLS. */
export function criarConexao(url: string, opcoes: postgres.Options<Record<string, never>> = {}) {
  const cliente = postgres(url, opcoes)
  return { db: drizzle(cliente, { schema, casing: 'snake_case' }), cliente }
}

export type Conexao = ReturnType<typeof criarConexao>

export { novoId } from './id.js'
export { aplicarMigracoes, pastaMigracoes } from './migrar.js'
