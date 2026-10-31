import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { empresas } from './carteira.js'
import { portalAcessos } from './portal.js'
import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// Portal do Cliente, Fase 3B: publicações (docs/plano_portal_cliente.md, seção 7). A equipe publica, o cliente lê,
// reage e comenta. RLS, FORCE e GRANTs ficam na migração; o que o cliente enxerga (só publicadas, do alcance dele)
// é decidido por políticas restritivas que dependem das variáveis app.portal_*.

const autoria = () => ({
  ...carimbos(),
  criadoPor: uuid().references((): AnyPgColumn => membros.id),
  atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  excluidoEm: timestamp({ withTimezone: true }),
})

const doTenant = () =>
  uuid()
    .notNull()
    .references(() => tenants.id)

export const situacaoPublicacao = pgEnum('situacao_publicacao', [
  'rascunho',
  'agendada',
  'publicada',
])
export const alcancePublicacao = pgEnum('alcance_publicacao', ['todos', 'empresas', 'tags'])
export const tipoReacaoPublicacao = pgEnum('tipo_reacao_publicacao', [
  'curtir',
  'apoiar',
  'parabens',
])
export const situacaoComentarioPublicacao = pgEnum('situacao_comentario_publicacao', [
  'visivel',
  'oculto',
])
export const motivoDenunciaPublicacao = pgEnum('motivo_denuncia_publicacao', [
  'spam',
  'ofensivo',
  'outro',
])

/** Comunicado da equipe no feed do portal. O corpo é Markdown restrito, sem HTML. */
export const publicacoes = pgTable(
  'publicacoes',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    titulo: varchar({ length: 160 }).notNull(),
    corpo: text().notNull(),
    situacao: situacaoPublicacao().notNull().default('rascunho'),
    alcance: alcancePublicacao().notNull().default('todos'),
    /** Uma fixada por vez, por empresa (índice único parcial) */
    fixada: boolean().notNull().default(false),
    agendadaPara: timestamp({ withTimezone: true }),
    publicadaEm: timestamp({ withTimezone: true }),
    /** Ninguém comenta nesta publicação (a chave geral fica em `tenant_configuracoes`) */
    comentariosBloqueados: boolean().notNull().default(false),
    /** Totais por tipo de reação, mantidos por gatilho (o cliente só enxerga o total, nunca quem reagiu) */
    totalCurtir: integer().notNull().default(0),
    totalApoiar: integer().notNull().default(0),
    totalParabens: integer().notNull().default(0),
    ...autoria(),
  },
  (t) => [
    index('publicacoes_feed_idx').on(t.tenantId, t.situacao, t.publicadaEm),
    uniqueIndex('publicacoes_fixada_uq')
      .on(t.tenantId)
      .where(sql`${t.fixada} AND ${t.excluidoEm} IS NULL`),
    check(
      'publicacoes_situacao_chk',
      sql`(${t.situacao} <> 'agendada' OR ${t.agendadaPara} IS NOT NULL) AND (${t.situacao} <> 'publicada' OR ${t.publicadaEm} IS NOT NULL)`,
    ),
  ],
)

/** As empresas-clientes do alcance "empresas". */
export const publicacaoEmpresas = pgTable(
  'publicacao_empresas',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    publicacaoId: uuid()
      .notNull()
      .references(() => publicacoes.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('publicacao_empresas_uq').on(t.publicacaoId, t.empresaId),
    index('publicacao_empresas_empresa_idx').on(t.empresaId),
  ],
)

/** Uma reação de cada tipo por pessoa; clicar de novo desfaz (apaga a linha). */
export const publicacaoReacoes = pgTable(
  'publicacao_reacoes',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    publicacaoId: uuid()
      .notNull()
      .references(() => publicacoes.id),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    tipo: tipoReacaoPublicacao().notNull(),
    ...carimbos(),
  },
  (t) => [uniqueIndex('publicacao_reacoes_uq').on(t.publicacaoId, t.acessoId, t.tipo)],
)

/** Comentário do cliente, em texto puro. Ocultar não apaga: guarda o motivo e quem ocultou. */
export const publicacaoComentarios = pgTable(
  'publicacao_comentarios',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    publicacaoId: uuid()
      .notNull()
      .references(() => publicacoes.id),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    /** Nome e inicial do sobrenome, gravados na hora: o cliente não lê o cadastro de outras empresas */
    autorNome: varchar({ length: 80 }).notNull(),
    corpo: text().notNull(),
    situacao: situacaoComentarioPublicacao().notNull().default('visivel'),
    ocultoMotivo: text(),
    ocultoPor: uuid().references((): AnyPgColumn => membros.id),
    ocultoEm: timestamp({ withTimezone: true }),
    ...carimbos(),
  },
  (t) => [
    index('publicacao_comentarios_pub_idx').on(t.publicacaoId, t.criadoEm),
    check('publicacao_comentarios_corpo_chk', sql`char_length(${t.corpo}) BETWEEN 1 AND 1000`),
    check(
      'publicacao_comentarios_oculto_chk',
      sql`(${t.situacao} = 'oculto') = (${t.ocultoEm} IS NOT NULL)`,
    ),
  ],
)

/** Denúncia de um comentário por outro cliente; a equipe trata (Manter ou Ocultar). */
export const publicacaoDenuncias = pgTable(
  'publicacao_denuncias',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    comentarioId: uuid()
      .notNull()
      .references(() => publicacaoComentarios.id),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    motivo: motivoDenunciaPublicacao().notNull(),
    tratadaPor: uuid().references((): AnyPgColumn => membros.id),
    tratadaEm: timestamp({ withTimezone: true }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('publicacao_denuncias_uq').on(t.comentarioId, t.acessoId),
    index('publicacao_denuncias_abertas_idx')
      .on(t.tenantId)
      .where(sql`${t.tratadaEm} IS NULL`),
  ],
)

/** Quem leu a publicação (dado pessoal, ver lgpd.md). Base do alcance. Uma linha por pessoa e publicação. */
export const publicacaoLeituras = pgTable(
  'publicacao_leituras',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    publicacaoId: uuid()
      .notNull()
      .references(() => publicacoes.id),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    lidaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...carimbos(),
  },
  (t) => [uniqueIndex('publicacao_leituras_uq').on(t.publicacaoId, t.acessoId)],
)
