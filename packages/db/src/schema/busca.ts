import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// Busca global (docs/plano_busca_global.md). RLS, FORCE e GRANTs ficam na migração.

/**
 * As últimas buscas de cada membro (até 10; a API apaga as mais antigas). Só do próprio membro: a política do banco
 * isola o tenant e a API filtra pelo membro. Sem `excluido_em`: apagar um termo é apagar de fato (LGPD).
 */
export const buscasRecentes = pgTable(
  'buscas_recentes',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    membroId: uuid()
      .notNull()
      .references(() => membros.id, { onDelete: 'cascade' }),
    /** Como a pessoa digitou (aparado) */
    termo: varchar({ length: 100 }).notNull(),
    /** Sem acento, minúsculo e com os espaços normalizados: a chave de "mesmo termo" */
    termoComparavel: varchar({ length: 100 }).notNull(),
    buscadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  },
  (t) => [
    uniqueIndex('buscas_recentes_termo_uq').on(t.tenantId, t.membroId, t.termoComparavel),
    index('buscas_recentes_lista_idx').on(t.tenantId, t.membroId, t.buscadoEm.desc()),
    check('buscas_recentes_termo_chk', sql`char_length(${t.termo}) BETWEEN 2 AND 100`),
  ],
)
