import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'

import { eventos } from './agenda.js'
import { avisos } from './avisos.js'
import { tags } from './cadastros.js'
import { documentos } from './documentos.js'
import { membros, tenants } from './plataforma.js'
import { publicacoes } from './publicacoes.js'

// Portal, Fase 4C (docs/plano_portal_formularios_e_eventos.md, B-9, B-12 e B-22): publicações, eventos,
// documentos e avisos podem ir só para quem tem certas TAGS DE CONTATO (alcance "tags"; com várias tags, basta
// ter uma). Como `contato_tags`, a linha é o vínculo; só tags de grupos `aplica_a = 'contato'` (gatilho).

const doTenant = () =>
  uuid()
    .notNull()
    .references(() => tenants.id)

const vinculo = () => ({
  tenantId: doTenant(),
  tagId: uuid()
    .notNull()
    .references(() => tags.id),
  aplicadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  aplicadaPor: uuid().references(() => membros.id),
})

export const publicacaoTags = pgTable(
  'publicacao_tags',
  {
    ...vinculo(),
    publicacaoId: uuid()
      .notNull()
      .references(() => publicacoes.id),
  },
  (t) => [
    primaryKey({ columns: [t.publicacaoId, t.tagId] }),
    index('publicacao_tags_tag_idx').on(t.tenantId, t.tagId),
  ],
)

export const eventoTags = pgTable(
  'evento_tags',
  {
    ...vinculo(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id),
  },
  (t) => [
    primaryKey({ columns: [t.eventoId, t.tagId] }),
    index('evento_tags_tag_idx').on(t.tenantId, t.tagId),
  ],
)

export const documentoTags = pgTable(
  'documento_tags',
  {
    ...vinculo(),
    documentoId: uuid()
      .notNull()
      .references(() => documentos.id),
  },
  (t) => [
    primaryKey({ columns: [t.documentoId, t.tagId] }),
    index('documento_tags_tag_idx').on(t.tenantId, t.tagId),
  ],
)

export const avisoTags = pgTable(
  'aviso_tags',
  {
    ...vinculo(),
    avisoId: uuid()
      .notNull()
      .references(() => avisos.id),
  },
  (t) => [
    primaryKey({ columns: [t.avisoId, t.tagId] }),
    index('aviso_tags_tag_idx').on(t.tenantId, t.tagId),
  ],
)
