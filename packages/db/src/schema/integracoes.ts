import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  char,
  jsonb,
  smallint,
  check,
  index,
  inet,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// API aberta (docs/plano_api_aberta.md): chaves de API por empresa. RLS, FORCE e GRANTs ficam na migração.

const autoria = () => ({
  ...carimbos(),
  criadoPor: uuid().references((): AnyPgColumn => membros.id),
  atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  excluidoEm: timestamp({ withTimezone: true }),
})

/**
 * Chave de API da empresa (não de uma pessoa). O token (`ltg_<ambiente>_<segredo>`) só existe na resposta da
 * criação: aqui ficam o SHA-256 dele (hex) e os 8 primeiros caracteres do segredo, para a tela identificá-la.
 * Cada chave age como o seu membro de integração (`membros.tipo = 'integracao'`), com as permissões da chave.
 */
export const apiChaves = pgTable(
  'api_chaves',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: varchar({ length: 80 }).notNull(),
    prefixo: char({ length: 8 }).notNull(),
    hash: char({ length: 64 }).notNull(),
    ambiente: varchar({ length: 4 }).notNull(),
    membroId: uuid()
      .notNull()
      .references(() => membros.id),
    /** Chaves do catálogo de permissões (só as liberadas para integração); alcance sempre "todas" */
    permissoes: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Responsável usado quando a integração cria registro sem informar um */
    responsavelPadraoId: uuid().references((): AnyPgColumn => membros.id),
    /** Vazio = qualquer IP */
    ipsPermitidos: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    expiraEm: timestamp({ withTimezone: true }),
    revogadaEm: timestamp({ withTimezone: true }),
    revogadaPor: uuid().references((): AnyPgColumn => membros.id),
    /** Rotação: a chave nova que substitui esta (a antiga vale até `expira_em`) */
    substituidaPor: uuid().references((): AnyPgColumn => apiChaves.id),
    ultimoUsoEm: timestamp({ withTimezone: true }),
    ultimoIp: inet(),
    /** Avisos de vencimento já enviados (15 e 1 dia antes), para não repetir */
    avisoVencimentoEm: timestamp({ withTimezone: true }),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('api_chaves_hash_uq').on(t.hash),
    index('api_chaves_lista_idx').on(t.tenantId, t.criadoEm),
    index('api_chaves_vencimento_idx')
      .on(t.expiraEm)
      .where(
        sql`${t.expiraEm} IS NOT NULL AND ${t.revogadaEm} IS NULL AND ${t.excluidoEm} IS NULL`,
      ),
    check('api_chaves_nome_chk', sql`char_length(btrim(${t.nome})) BETWEEN 1 AND 80`),
    check('api_chaves_ambiente_chk', sql`${t.ambiente} IN ('live', 'test')`),
    check('api_chaves_hash_chk', sql`${t.hash} ~ '^[0-9a-f]{64}$'`),
    check('api_chaves_revogada_chk', sql`(${t.revogadaEm} IS NULL) = (${t.revogadaPor} IS NULL)`),
  ],
)

/**
 * `Idempotency-Key` da API pública (I2): a resposta do primeiro POST com a chave, devolvida de novo a quem
 * repetir a mesma chave com o mesmo corpo por 24 h. Com outro corpo, 409. A limpeza do worker apaga depois.
 */
export const idempotenciaChaves = pgTable(
  'idempotencia_chaves',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    chaveApiId: uuid()
      .notNull()
      .references(() => apiChaves.id),
    chave: varchar({ length: 100 }).notNull(),
    /** SHA-256 (hex) do método, do caminho e do corpo */
    hashCorpo: char({ length: 64 }).notNull(),
    statusHttp: smallint(),
    resposta: jsonb(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idempotencia_chaves_uq').on(t.tenantId, t.chaveApiId, t.chave),
    index('idempotencia_chaves_criado_idx').on(t.criadoEm),
  ],
)
