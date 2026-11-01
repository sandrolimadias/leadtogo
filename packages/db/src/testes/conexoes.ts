import postgres from 'postgres'

import { carregarEnv } from '../env.js'
import { criarConexao } from '../index.js'

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

/** URL do `leadtogo_owner` no banco de teste (usada pelo setup global). */
export function urlOwnerDeTeste(): string {
  return url('TEST_DATABASE_MIGRATION_URL')
}

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

/** Drizzle como `leadtogo_owner` (é com ele que os seeds rodam). */
export function conectarDrizzleOwner() {
  return criarConexao(url('TEST_DATABASE_MIGRATION_URL'), { max: 2, onnotice: () => {} })
}

/** Tabelas de referência globais, na ordem em que podem ser apagadas (quem aponta para quem vem antes). */
const REFERENCIAS_GLOBAIS = [
  'municipio_contornos',
  'municipios',
  'microrregioes',
  'cnaes',
  'qualificacoes_socio',
  'portes',
  'paises',
  'estados',
]

/**
 * Deixa as referências globais vazias, sem depender do que outro arquivo de teste deixou: o que aponta para
 * elas (empresas e filhas, regiões com municípios) é esvaziado antes. Os arquivos rodam em sequência no mesmo
 * banco e a ORDEM muda de uma execução para outra (o vitest põe os que falharam e os mais lentos primeiro),
 * então nenhum teste pode supor o que o anterior limpou.
 */
export async function esvaziarReferencias(owner: Sql): Promise<void> {
  await owner`TRUNCATE empresas CASCADE` // ignora o RLS; as filhas apontam para as referências (FK)
  await owner`TRUNCATE geo_regiao_municipios`
  await owner`UPDATE tenants SET municipio_codigo = NULL WHERE municipio_codigo IS NOT NULL`
  for (const tabela of REFERENCIAS_GLOBAIS) await owner`DELETE FROM ${owner(tabela)}`
}
