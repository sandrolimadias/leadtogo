import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { papeisDecisao } from './cadastros.js'
import { empresas, origemTelefone, tipoTelefone } from './carteira.js'
import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid, citext } from './tipos.js'

// Contatos (docs/modelagem_banco.md, seção 7): Módulo 3 do MVP.
// RLS, FORCE, GRANTs e os índices trigram (com unaccent) ficam na migração.

export const tipoEmail = pgEnum('tipo_email', ['pessoal', 'trabalho'])

/** A pessoa. O cargo e o contato principal pertencem ao vínculo com cada empresa (`empresa_contatos`). */
export const contatos = pgTable(
  'contatos',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: text().notNull(),
    papelDecisaoId: uuid().references(() => papeisDecisao.id),
    /** Aniversário sem ano (menos dado pessoal) */
    aniversarioDia: smallint(),
    aniversarioMes: smallint(),
    linkedinUrl: text(),
    /** Consentimento (LGPD): o contato pediu para não receber contato quando os dois são falsos */
    aceitaWhatsapp: boolean().notNull().default(true),
    aceitaEmail: boolean().notNull().default(true),
    consentimentoEm: timestamp({ withTimezone: true }),
    consentimentoOrigem: text(),
    observacoes: text(),
    /** O lote de importação que criou o contato (sem FK, como `empresas.importacao_id`) */
    importacaoId: uuid(),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('contatos_papel_idx').on(t.tenantId, t.papelDecisaoId),
    index('contatos_importacao_idx').on(t.tenantId, t.importacaoId),
    check(
      'contatos_aniversario_mes',
      sql`${t.aniversarioMes} IS NULL OR ${t.aniversarioMes} BETWEEN 1 AND 12`,
    ),
    check(
      'contatos_aniversario_dia',
      sql`${t.aniversarioDia} IS NULL OR ${t.aniversarioDia} BETWEEN 1 AND 31`,
    ),
    // dia e mês andam juntos
    check(
      'contatos_aniversario_completo',
      sql`(${t.aniversarioDia} IS NULL) = (${t.aniversarioMes} IS NULL)`,
    ),
  ],
)

/** Vínculo N:N entre contato e empresa; guarda o que muda por empresa (cargo, principal, ativo). */
export const empresaContatos = pgTable(
  'empresa_contatos',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    contatoId: uuid()
      .notNull()
      .references(() => contatos.id),
    cargo: text(),
    /** O contato principal da empresa (um só) */
    principal: boolean().notNull().default(false),
    /** Saiu da empresa: fica inativo, mantendo o histórico */
    ativo: boolean().notNull().default(true),
    desde: date({ mode: 'string' }),
    ate: date({ mode: 'string' }),
    /** O lote de importação que criou este vínculo (inclusive com contato que já existia) */
    importacaoId: uuid(),
    ...carimbos(),
  },
  (t) => [
    index('empresa_contatos_importacao_idx').on(t.tenantId, t.importacaoId),
    uniqueIndex('empresa_contatos_uq').on(t.empresaId, t.contatoId),
    // No máximo um contato principal por empresa
    uniqueIndex('empresa_contatos_principal_uq')
      .on(t.empresaId)
      .where(sql`${t.principal}`),
    index('empresa_contatos_contato_idx').on(t.tenantId, t.contatoId),
    check('empresa_contatos_principal_ativo', sql`NOT ${t.principal} OR ${t.ativo}`),
  ],
)

export const contatoTelefones = pgTable(
  'contato_telefones',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    contatoId: uuid()
      .notNull()
      .references(() => contatos.id),
    /** Como foi digitado */
    numero: varchar({ length: 20 }).notNull(),
    /** "+552730643021": busca, WhatsApp e duplicados */
    numeroE164: varchar('numero_e164', { length: 16 }).notNull(),
    tipo: tipoTelefone().notNull().default('outro'),
    descricao: text(),
    principal: boolean().notNull().default(false),
    origem: origemTelefone().notNull().default('manual'),
    ...carimbos(),
  },
  (t) => [
    index('contato_telefones_contato_idx').on(t.tenantId, t.contatoId),
    index('contato_telefones_e164_idx').on(t.tenantId, t.numeroE164),
  ],
)

export const contatoEmails = pgTable(
  'contato_emails',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    contatoId: uuid()
      .notNull()
      .references(() => contatos.id),
    email: citext().notNull(),
    tipo: tipoEmail().notNull().default('trabalho'),
    principal: boolean().notNull().default(false),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('contato_emails_uq').on(t.contatoId, t.email),
    index('contato_emails_email_idx').on(t.tenantId, t.email),
  ],
)
