import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { municipios } from './referencias.js'
import { user } from './auth.js'
import { arquivos } from './sistema.js'
import { carimbos, chaveUuid, citext } from './tipos.js'

// Plataforma e tenant (docs/modelagem_banco.md, seção 3).
// Políticas de RLS, FORCE e GRANTs ficam na migração (aplicar_rls_tenant).

export const situacaoConta = pgEnum('situacao_conta', ['teste', 'ativa', 'suspensa', 'cancelada'])
export const papelConta = pgEnum('papel_conta', ['dono', 'administrador', 'financeiro'])
export const situacaoTenant = pgEnum('situacao_tenant', ['teste', 'ativo', 'suspenso', 'cancelado'])
export const papelMembro = pgEnum('papel_membro', ['admin', 'gestor', 'vendedor'])
/** Quem precisa de 2FA para usar a empresa (`tenant_configuracoes.dois_fatores_exigido`) */
export const politicaDoisFatores = pgEnum('politica_dois_fatores', [
  'admin',
  'admin_gestor',
  'todos',
])
export const modoImportacaoWhatsapp = pgEnum('modo_importacao_whatsapp', [
  'automatico',
  'manual',
  'desligado',
])

/** Conta dona de várias empresas (cobrança e gestão). Sem RLS por tenant: o acesso é da API. */
export const contas = pgTable('contas', {
  id: chaveUuid(),
  nome: text().notNull(),
  documento: varchar({ length: 14 }),
  emailCobranca: citext(),
  plano: text(),
  situacao: situacaoConta().notNull().default('teste'),
  ...carimbos(),
})

export const contaAdministradores = pgTable(
  'conta_administradores',
  {
    contaId: uuid()
      .notNull()
      .references(() => contas.id),
    /** Quem administra a conta; não se apaga um usuário que ainda administra uma conta */
    usuarioId: uuid()
      .notNull()
      .references((): AnyPgColumn => user.id, { onDelete: 'restrict' }),
    papel: papelConta().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contaId, t.usuarioId] })],
)

/** A empresa que usa o sistema. RLS pela coluna `id` (o tenant é a própria linha). */
export const tenants = pgTable(
  'tenants',
  {
    id: chaveUuid(),
    razaoSocial: text().notNull(),
    nomeFantasia: text(),
    /** Alfanumérico (docs/modelagem_banco.md, seção 12) */
    cnpj: varchar({ length: 14 }).unique('tenants_cnpj_key'),
    email: text(),
    telefone: text(),
    website: text(),
    cep: text(),
    tipoLogradouro: text(),
    logradouro: text(),
    numero: text(),
    complemento: text(),
    bairro: text(),
    municipioCodigo: integer().references(() => municipios.codigoIbge),
    /** Código do país na Receita (105 = Brasil) */
    paisCodigo: smallint().default(105),
    logoArquivoId: uuid().references((): AnyPgColumn => arquivos.id),
    contaId: uuid()
      .notNull()
      .references(() => contas.id),
    situacao: situacaoTenant().notNull().default('teste'),
    plano: text(),
    fusoHorario: text().notNull().default('America/Sao_Paulo'),
    moeda: char({ length: 3 }).notNull().default('BRL'),
    ...carimbos(),
  },
  (t) => [index('tenants_conta_idx').on(t.contaId)],
)

export const tenantConfiguracoes = pgTable('tenant_configuracoes', {
  tenantId: uuid()
    .primaryKey()
    .references(() => tenants.id),
  vendedorVeTodasEmpresas: boolean().notNull().default(false),
  diasSemContatoAlerta: integer().notNull().default(60),
  /** null = a tag de visita não expira */
  diasValidadeTagVisita: integer(),
  statusClienteAoConquistar: boolean().notNull().default(true),
  rastreioEmailPadrao: boolean().notNull().default(false),
  /** admin (padrão) | admin_gestor | todos: quem é obrigado a ter 2FA ao usar esta empresa */
  doisFatoresExigido: politicaDoisFatores().notNull().default('admin'),
  whatsappModoImportacao: modoImportacaoWhatsapp().notNull().default('desligado'),
  preferencias: jsonb().notNull().default({}),
  ...carimbos(),
})

/** Equipe / vendedores. O mesmo usuário pode ser membro em várias empresas, com papel próprio em cada. */
export const membros = pgTable(
  'membros',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    /** Login do membro (auth.user); null = vendedor sem acesso ao sistema */
    usuarioId: uuid().references((): AnyPgColumn => user.id, { onDelete: 'set null' }),
    nome: text().notNull(),
    cargo: text(),
    telefone: varchar({ length: 20 }),
    telefoneE164: varchar('telefone_e164', { length: 20 }),
    email: citext(),
    papel: papelMembro().notNull().default('vendedor'),
    gestorId: uuid().references((): AnyPgColumn => membros.id),
    cor: char({ length: 7 }),
    fotoArquivoId: uuid().references((): AnyPgColumn => arquivos.id),
    ativo: boolean().notNull().default(true),
    /** Tema, menu recolhido, visão do Dashboard, filtro salvo padrão */
    preferencias: jsonb().notNull().default({}),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('membros_tenant_email_uq')
      .on(t.tenantId, t.email)
      .where(sql`${t.excluidoEm} IS NULL AND ${t.email} IS NOT NULL`),
    uniqueIndex('membros_tenant_usuario_uq')
      .on(t.tenantId, t.usuarioId)
      .where(sql`${t.excluidoEm} IS NULL AND ${t.usuarioId} IS NOT NULL`),
    index('membros_tenant_gestor_idx').on(t.tenantId, t.gestorId),
    index('membros_usuario_idx').on(t.usuarioId),
  ],
)

/**
 * Convite de membro (docs/modelagem_banco.md, seção 3.5). Só o HASH do token é guardado: o token em
 * si vai por e-mail e nunca é gravado. Uso único; no máximo um convite pendente por (empresa, e-mail).
 */
export const convites = pgTable(
  'convites',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    email: citext().notNull(),
    papel: papelMembro().notNull(),
    tokenHash: text().notNull().unique('convites_token_hash_key'),
    expiraEm: timestamp({ withTimezone: true }).notNull(),
    aceitoEm: timestamp({ withTimezone: true }),
    /** Cancelado por um administrador antes de ser aceito */
    revogadoEm: timestamp({ withTimezone: true }),
    convidadoPor: uuid()
      .notNull()
      .references((): AnyPgColumn => membros.id),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('convites_pendente_uq')
      .on(t.tenantId, t.email)
      .where(sql`${t.aceitoEm} IS NULL AND ${t.revogadoEm} IS NULL`),
    index('convites_tenant_idx').on(t.tenantId, t.criadoEm),
  ],
)
