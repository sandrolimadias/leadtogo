import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { tenants } from './plataforma.js'
import { chaveUuid, citext } from './tipos.js'

// Identidade do Better Auth, no schema `auth` (docs/modelagem_banco.md, seção 3.3). Só identidade:
// sem o plugin de organizações (empresas, membros e convites são nossos, sob RLS).
// Os nomes das propriedades seguem o Better Auth (createdAt, userId...); o drizzle os grava em
// snake_case. Sem RLS: o acesso é só do Better Auth e da API (leadtogo_app).
// O Better Auth gera os ids (UUID v7) por `advanced.database.generateId`.

export const authSchema = pgSchema('auth')

export const user = authSchema.table('user', {
  id: chaveUuid(),
  name: text().notNull(),
  email: citext().notNull().unique('user_email_key'),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** Plugin de 2FA */
  twoFactorEnabled: boolean().default(false),
})

export const session = authSchema.table(
  'session',
  {
    id: chaveUuid(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique('session_token_key'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Empresa ativa da sessão (campo nosso): `app.tenant_id` das requisições */
    empresaAtivaId: uuid().references((): AnyPgColumn => tenants.id, { onDelete: 'set null' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = authSchema.table(
  'account',
  {
    id: chaveUuid(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    /** Hash scrypt da senha (login por e-mail e senha) */
    password: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('account_user_idx').on(t.userId),
    uniqueIndex('account_provider_conta_uq').on(t.providerId, t.accountId),
  ],
)

export const verification = authSchema.table(
  'verification',
  {
    id: chaveUuid(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

/** Plugin de 2FA (TOTP): segredo e códigos de backup (cifrados pelo Better Auth). */
export const twoFactor = authSchema.table(
  'two_factor',
  {
    id: chaveUuid(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean().default(true),
    failedVerificationCount: integer().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [index('two_factor_user_idx').on(t.userId)],
)
