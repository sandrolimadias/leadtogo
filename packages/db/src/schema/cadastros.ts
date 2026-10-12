import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// Cadastros auxiliares do tenant (docs/modelagem_banco.md, seção 5): Módulo 1 do MVP.
// RLS, FORCE e GRANTs ficam na migração (aplicar_rls_tenant).

export const selecaoTag = pgEnum('selecao_tag', ['unica', 'multipla'])
export const contaComo = pgEnum('conta_como', ['visita', 'contato', 'nenhum'])
export const statusOportunidade = pgEnum('status_oportunidade', [
  'ativo',
  'conquistado',
  'perdido',
  'cancelado',
  'suspenso',
])
/** Paleta de tags do design system (`tag-<cor>-bg` / `-fg`). Nome da cor, nunca hexadecimal. */
export const corDeTag = pgEnum('cor_de_tag', [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
])

/** Colunas comuns a todo cadastro: tenant, nome, ativo, ordem, carimbos, autoria e soft delete. */
const base = () => ({
  id: chaveUuid(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id),
  nome: text().notNull(),
  ativo: boolean().notNull().default(true),
  ordem: integer().notNull().default(0),
  ...carimbos(),
  criadoPor: uuid().references((): AnyPgColumn => membros.id),
  atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  excluidoEm: timestamp({ withTimezone: true }),
})

type ComNome = { tenantId: AnyPgColumn; nome: AnyPgColumn; excluidoEm: AnyPgColumn }
/** Nome único por empresa, sem diferença de caixa, entre os não excluídos. */
const nomeUnico = (tabela: string, t: ComNome, ...escopo: AnyPgColumn[]) =>
  uniqueIndex(`${tabela}_nome_uq`)
    .on(t.tenantId, ...escopo, sql`lower(${t.nome})`)
    .where(sql`${t.excluidoEm} IS NULL`)

export const verticais = pgTable(
  'verticais',
  { ...base(), cor: corDeTag().notNull().default('gray') },
  (t) => [nomeUnico('verticais', t)],
)

export const solucoes = pgTable(
  'solucoes',
  { ...base(), cor: corDeTag().notNull().default('gray'), descricao: text() },
  (t) => [nomeUnico('solucoes', t)],
)

export const origens = pgTable(
  'origens',
  {
    ...base(),
    /** Identifica a origem usada por regras do sistema (ex.: `importacao`), mesmo renomeada */
    chaveSistema: text(),
  },
  (t) => [
    nomeUnico('origens', t),
    uniqueIndex('origens_chave_sistema_uq')
      .on(t.tenantId, t.chaveSistema)
      .where(sql`${t.chaveSistema} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
  ],
)

export const motivos = pgTable(
  'motivos',
  {
    ...base(),
    /** Status da oportunidade em que o motivo vale (ex.: "Preço" vale para perdido) */
    aplicaA: statusOportunidade().array().notNull(),
  },
  (t) => [
    nomeUnico('motivos', t),
    check('motivos_aplica_a_nao_vazio', sql`cardinality(${t.aplicaA}) > 0`),
  ],
)

export const tagGrupos = pgTable(
  'tag_grupos',
  {
    ...base(),
    selecao: selecaoTag().notNull().default('multipla'),
    /** Toda empresa precisa ter uma tag do grupo */
    obrigatorio: boolean().notNull().default(false),
    /** Criado pelo sistema: não pode ser excluído, só editado */
    sistema: boolean().notNull().default(false),
    /** Tags aplicadas por regra (ex.: Visitação), não pelo usuário */
    automatico: boolean().notNull().default(false),
    chaveSistema: text(),
  },
  (t) => [
    nomeUnico('tag_grupos', t),
    uniqueIndex('tag_grupos_chave_sistema_uq')
      .on(t.tenantId, t.chaveSistema)
      .where(sql`${t.chaveSistema} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
  ],
)

export const tags = pgTable(
  'tags',
  {
    ...base(),
    tagGrupoId: uuid()
      .notNull()
      .references(() => tagGrupos.id),
    cor: corDeTag().notNull().default('gray'),
    /** Identifica as tags das regras automáticas (`lead`, `cliente`, `visitada`...), mesmo renomeadas */
    chaveSistema: text(),
  },
  (t) => [
    // O nome é único dentro do grupo (o mesmo nome pode existir em grupos diferentes)
    nomeUnico('tags', t, t.tagGrupoId),
    uniqueIndex('tags_chave_sistema_uq')
      .on(t.tenantId, t.chaveSistema)
      .where(sql`${t.chaveSistema} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
    index('tags_grupo_idx').on(t.tenantId, t.tagGrupoId),
  ],
)

export const tiposAtividade = pgTable(
  'tipos_atividade',
  {
    ...base(),
    /** Nome do ícone Lucide */
    icone: varchar({ length: 40 }).notNull(),
    cor: corDeTag().notNull().default('gray'),
    contaComo: contaComo().notNull().default('nenhum'),
    exigeEmpresa: boolean().notNull().default(true),
    sincronizaAgenda: boolean().notNull().default(false),
    chaveSistema: text(),
  },
  (t) => [
    nomeUnico('tipos_atividade', t),
    uniqueIndex('tipos_atividade_chave_sistema_uq')
      .on(t.tenantId, t.chaveSistema)
      .where(sql`${t.chaveSistema} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
  ],
)

export const funis = pgTable(
  'funis',
  { ...base(), padrao: boolean().notNull().default(false) },
  (t) => [
    nomeUnico('funis', t),
    // No máximo um funil padrão por empresa
    uniqueIndex('funis_padrao_uq')
      .on(t.tenantId)
      .where(sql`${t.padrao} AND ${t.excluidoEm} IS NULL`),
  ],
)

/** Fases de andamento do funil (o fechamento é pelo Status da oportunidade, não por uma fase). */
export const funilFases = pgTable(
  'funil_fases',
  {
    ...base(),
    funilId: uuid()
      .notNull()
      .references(() => funis.id),
    cor: corDeTag().notNull().default('gray'),
    probabilidadePadrao: smallint().notNull().default(0),
    /** Dias sem atividade na fase para destacar a oportunidade como parada; null = sem alerta */
    diasAlertaParada: integer(),
  },
  (t) => [
    // O nome é único dentro do funil (outro funil pode ter uma fase com o mesmo nome)
    nomeUnico('funil_fases', t, t.funilId),
    index('funil_fases_funil_idx').on(t.tenantId, t.funilId, t.ordem),
    check('funil_fases_probabilidade', sql`${t.probabilidadePadrao} BETWEEN 0 AND 100`),
    check(
      'funil_fases_dias_alerta',
      sql`${t.diasAlertaParada} IS NULL OR ${t.diasAlertaParada} > 0`,
    ),
  ],
)
