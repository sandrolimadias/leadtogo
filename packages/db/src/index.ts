import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema/index.js'
import { semearReferencias } from './seeds/referencias.js'

export { schema }

/** Cria a conexão Drizzle (postgres.js). A API usa o usuário da aplicação, sujeito a RLS. */
export function criarConexao(url: string, opcoes: postgres.Options<Record<string, never>> = {}) {
  const cliente = postgres(url, opcoes)
  return { db: drizzle(cliente, { schema, casing: 'snake_case' }), cliente }
}

export type Conexao = ReturnType<typeof criarConexao>

/**
 * Semeia as referências globais (estados, municípios, países, portes, qualificações e CNAEs) com a
 * URL do `leadtogo_owner` (o app só lê estas tabelas). Nunca semeia a demonstração. Repetível: só
 * grava o que falta ou mudou. Devolve quantas linhas cada tabela tem no arquivo de dados.
 */
export async function semearReferenciasPorUrl(url: string): Promise<Record<string, number>> {
  const { db, cliente } = criarConexao(url, { max: 1, onnotice: () => {} })
  try {
    return await semearReferencias(db)
  } finally {
    await cliente.end()
  }
}

export { novoId } from './id.js'
export { aplicarMigracoes, pastaMigracoes } from './migrar.js'

// A mesma instância do drizzle-orm que o `db` usa: quem monta consultas com `sql` fora deste
// pacote (a API) importa daqui, para os tipos casarem (o pnpm pode ter mais de uma cópia).
export { sql } from 'drizzle-orm'
