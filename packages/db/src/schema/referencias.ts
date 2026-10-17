import {
  char,
  geometry,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

// Tabelas de referência globais (docs/modelagem_banco.md, seção 4): sem tenant_id, sem RLS.
// O app só lê; a escrita é do owner (seeds) e do worker. Exceção: receita_consultas (cache).
// Os índices trigram com unaccent e os GRANTs ficam na migração (SQL próprio).

export const estados = pgTable('estados', {
  uf: char({ length: 2 }).primaryKey(),
  nome: text().notNull(),
  regiao: text().notNull(),
})

/** Países da Receita Federal (dados abertos do CNPJ): código numérico da Receita (Brasil = 105) e nome. */
export const paises = pgTable('paises', {
  codigo: smallint().primaryKey(),
  nome: text().notNull(),
})

/** 0 Não informado · 1 Micro Empresa · 3 Empresa de Pequeno Porte · 5 Demais */
export const portes = pgTable('portes', {
  codigo: smallint().primaryKey(),
  descricao: text().notNull(),
})

export const qualificacoesSocio = pgTable('qualificacoes_socio', {
  codigo: smallint().primaryKey(),
  descricao: text().notNull(),
})

/** Subclasse CNAE (7 dígitos) com a hierarquia oficial IBGE/CONCLA. A PK impede duplicados. */
export const cnaes = pgTable('cnaes', {
  codigo: integer().primaryKey(),
  descricao: text().notNull(),
  secao: char({ length: 1 }).notNull(),
  divisao: varchar({ length: 2 }).notNull(),
  grupo: varchar({ length: 3 }).notNull(),
  classe: varchar({ length: 5 }).notNull(),
})

/** Microrregiões oficiais do IBGE (dado público; regiões prontas da geolocalização). */
export const microrregioes = pgTable('microrregioes', {
  codigo: integer().primaryKey(),
  nome: text().notNull(),
  uf: char({ length: 2 })
    .notNull()
    .references(() => estados.uf),
})

/** O banco usa o código IBGE; o SIAFI/TOM (o da Receita) fica ao lado, para a prospecção. */
export const municipios = pgTable(
  'municipios',
  {
    codigoIbge: integer().primaryKey(),
    codigoSiafi: integer().unique('municipios_codigo_siafi_key'),
    nome: text().notNull(),
    uf: char({ length: 2 })
      .notNull()
      .references(() => estados.uf),
    /** Microrregião oficial do IBGE; nulo só no município sem enquadramento na API (instalado em 2025) */
    microrregiaoCodigo: integer().references(() => microrregioes.codigo),
    /** Centro do município (SRID 4326), do centroide da malha do IBGE; nulo onde a malha não tem o município */
    localizacao: geometry({ type: 'point', mode: 'xy', srid: 4326 }),
  },
  (t) => [
    index('municipios_uf_idx').on(t.uf),
    index('municipios_microrregiao_idx').on(t.microrregiaoCodigo),
    index('municipios_localizacao_idx').using('gist', t.localizacao),
  ],
)

/** Cache do JSON completo da Minha Receita (dado público, compartilhado entre tenants; validade 30 dias). */
export const receitaConsultas = pgTable('receita_consultas', {
  cnpj: varchar({ length: 14 }).primaryKey(),
  dados: jsonb().notNull(),
  consultadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  fonte: text().notNull(),
})
