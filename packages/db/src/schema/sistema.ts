import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// Tabelas do sistema (docs/modelagem_banco.md, seção 11). RLS, FORCE e GRANTs ficam na migração.

/** Anexos de qualquer entidade; o conteúdo fica no Garage (S3), em `tenant_id/entidade/arquivo`. */
export const arquivos = pgTable(
  'arquivos',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    chaveArquivo: text().notNull(),
    nome: text().notNull(),
    mime: text().notNull(),
    tamanho: bigint({ mode: 'number' }).notNull(),
    entidadeTipo: text(),
    entidadeId: uuid(),
    enviadoPor: uuid().references(() => membros.id),
    ...carimbos(),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('arquivos_chave_arquivo_uq').on(t.chaveArquivo),
    index('arquivos_entidade_idx').on(t.tenantId, t.entidadeTipo, t.entidadeId),
  ],
)

/** Central de notificações de cada membro. */
export const notificacoes = pgTable(
  'notificacoes',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    membroId: uuid()
      .notNull()
      .references(() => membros.id),
    tipo: text().notNull(),
    titulo: text().notNull(),
    mensagem: text(),
    link: text(),
    lidaEm: timestamp({ withTimezone: true }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notificacoes_nao_lidas_idx')
      .on(t.tenantId, t.membroId, t.criadoEm)
      .where(sql`${t.lidaEm} IS NULL`),
  ],
)

/** Fila de eventos gravada na mesma transação do dado (webhooks do n8n, notificações). */
export const eventosOutbox = pgTable(
  'eventos_outbox',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    tipo: text().notNull(),
    entidadeId: uuid(),
    payload: jsonb().notNull().default({}),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processadoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('eventos_outbox_pendentes_idx')
      .on(t.criadoEm)
      .where(sql`${t.processadoEm} IS NULL`),
  ],
)

export const origemAuditoria = pgEnum('origem_auditoria', ['app', 'api', 'integracao', 'sistema'])

/**
 * Log de alterações. **Particionada por mês** (por `em`): a migração troca o CREATE TABLE gerado
 * pela versão `PARTITION BY RANGE (em)`, que o Drizzle não expressa. O app só tem INSERT e SELECT;
 * as partições são mantidas pelo leadtogo_owner (criar_particao_auditoria).
 */
export const auditoria = pgTable(
  'auditoria',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(),
    tenantId: uuid().notNull(),
    entidade: text().notNull(),
    entidadeId: uuid(),
    acao: text().notNull(),
    /** { antes, depois } */
    alteracoes: jsonb(),
    membroId: uuid(),
    origem: origemAuditoria().notNull().default('app'),
    ip: inet(),
    em: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.em] }),
    index('auditoria_entidade_idx').on(t.tenantId, t.entidade, t.entidadeId, t.em),
  ],
)
