import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { empresas } from './carteira.js'
import { membros, tenants } from './plataforma.js'
import { municipios } from './referencias.js'
import { carimbos, chaveUuid, geoAproximacao, geoPrecisao, geografiaPonto } from './tipos.js'

// Geolocalização (docs/plano_geolocalizacao.md e docs/modelagem_banco.md, seção "Geolocalização").
// RLS, FORCE e GRANTs das tabelas de tenant ficam na migração (aplicar_rls_tenant).

export const provedorGeo = pgEnum('provedor_geo', ['cnefe', 'nominatim', 'cep'])
export const situacaoGeoLote = pgEnum('situacao_geo_lote', [
  'em_andamento',
  'concluido',
  'falhou',
  'cancelado',
])
export const resultadoGeoEmpresa = pgEnum('resultado_geo_empresa', [
  'pendente',
  'exata',
  'aproximada',
  'a_confirmar',
  'ja_tinha',
  'falhou',
])

const autoria = () => ({
  ...carimbos(),
  criadoPor: uuid().references((): AnyPgColumn => membros.id),
  atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  excluidoEm: timestamp({ withTimezone: true }),
})

/** Regiões criadas pelo admin (as microrregiões oficiais ficam em `microrregioes`, só leitura). */
export const geoRegioes = pgTable(
  'geo_regioes',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: text().notNull(),
    ativo: boolean().notNull().default(true),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('geo_regioes_nome_uq')
      .on(t.tenantId, sql`lower(${t.nome})`)
      .where(sql`${t.excluidoEm} IS NULL`),
  ],
)

export const geoRegiaoMunicipios = pgTable(
  'geo_regiao_municipios',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    regiaoId: uuid()
      .notNull()
      .references(() => geoRegioes.id),
    municipioCodigo: integer()
      .notNull()
      .references(() => municipios.codigoIbge),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('geo_regiao_municipios_uq').on(t.regiaoId, t.municipioCodigo),
    index('geo_regiao_municipios_regiao_idx').on(t.tenantId, t.regiaoId),
  ],
)

/** Lote sob demanda por cidade ou região: mesmo desenho do lote de importação (blocos curtos, retomada). */
export const geoLotes = pgTable(
  'geo_lotes',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: text().notNull(),
    /** Municípios (código IBGE) do escopo no momento em que o lote foi criado */
    municipios: integer().array().notNull(),
    /** De onde veio o escopo: "Cidade X", "Região Y" ou "Microrregião Z" */
    escopo: text().notNull(),
    /** Refazer também as empresas que já têm coordenada (o ajuste manual continua preservado) */
    refazerComCoordenada: boolean().notNull().default(false),
    situacao: situacaoGeoLote().notNull().default('em_andamento'),
    totalEmpresas: integer().notNull().default(0),
    /** Contagem por resultado, para o relatório */
    totais: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Última vez que uma empresa foi resolvida (a varredura usa para achar lote parado) */
    ultimoProgressoEm: timestamp({ withTimezone: true }),
    iniciadoEm: timestamp({ withTimezone: true }),
    concluidoEm: timestamp({ withTimezone: true }),
    ...autoria(),
  },
  (t) => [
    index('geo_lotes_situacao_idx').on(t.tenantId, t.situacao),
    index('geo_lotes_criado_idx').on(t.tenantId, t.criadoEm),
  ],
)

/** Cada empresa do lote e o que aconteceu com ela (idempotência, retomada e progresso). */
export const geoLoteEmpresas = pgTable(
  'geo_lote_empresas',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    loteId: uuid()
      .notNull()
      .references(() => geoLotes.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    resultado: resultadoGeoEmpresa().notNull().default('pendente'),
    motivo: text(),
    processadaEm: timestamp({ withTimezone: true }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('geo_lote_empresas_uq').on(t.loteId, t.empresaId),
    index('geo_lote_empresas_resultado_idx').on(t.tenantId, t.loteId, t.resultado),
  ],
)

/** Registro de cada consulta (auditoria) e cache para não repetir a mesma consulta. */
export const geoConsultas = pgTable(
  'geo_consultas',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    empresaId: uuid().references(() => empresas.id),
    loteId: uuid().references(() => geoLotes.id),
    provedor: provedorGeo().notNull(),
    /** Texto normalizado que foi consultado */
    consulta: text().notNull(),
    /** `achou`, `nao_achou` ou `erro`; só `achou` e `nao_achou` valem como cache */
    resultado: text().notNull(),
    precisao: geoPrecisao(),
    aproximacao: geoAproximacao(),
    localizacao: geografiaPonto(),
    /** Resposta resumida do provedor (sem dado além do que a decisão usou) */
    resposta: jsonb(),
    /** Quem acionou; nulo = o sistema (automático ou lote sem usuário) */
    acionadoPor: uuid().references(() => membros.id),
    ...autoria(),
  },
  (t) => [
    index('geo_consultas_empresa_idx').on(t.tenantId, t.empresaId, t.criadoEm),
    index('geo_consultas_cache_idx').on(t.tenantId, t.provedor, t.consulta),
    index('geo_consultas_lote_idx').on(t.tenantId, t.loteId),
  ],
)

/** Cor e nome de cada estado da legenda do mapa, por tenant. Ausente = padrão. */
export const mapaLegenda = pgTable(
  'mapa_legenda',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    /** `tag:<id da tag de Status>`, `visita_tentada` ou `sem_visita` */
    chave: text().notNull(),
    /** Chave da paleta de cores do mapa (docs/design_system.md, seção Mapa) */
    cor: text().notNull(),
    /** Nome livre; nulo = o nome padrão (o da tag, ou o texto fixo do estado) */
    nome: text(),
    ...autoria(),
  },
  (t) => [uniqueIndex('mapa_legenda_chave_uq').on(t.tenantId, t.chave)],
)

// ---------------------------------------------------------------------------------------------
// Schema `referencia_geo`: dado público recarregável, FORA do backup (docs/runbook_backup.md,
// seção 5). Sem tenant e sem RLS; o `leadtogo_app` só lê. A carga é de `scripts/geo/`.
export const referenciaGeo = pgSchema('referencia_geo')

/** Ruas do CNEFE por município, com a chave normalizada (busca aproximada por `pg_trgm`) e o centro da rua. */
export const cnefeLogradouros = referenciaGeo.table(
  'cnefe_logradouros',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    municipioCodigo: integer().notNull(),
    /** Chave de busca: sem acento, maiúsculas, tipo removido e títulos expandidos */
    logradouroNormalizado: text().notNull(),
    /** Como veio no CNEFE (tipo, título e nome) */
    logradouro: text().notNull(),
    enderecos: integer().notNull(),
    latitudeCentro: doublePrecision().notNull(),
    longitudeCentro: doublePrecision().notNull(),
  },
  (t) => [
    uniqueIndex('cnefe_logradouros_uq').on(t.municipioCodigo, t.logradouroNormalizado),
    index('cnefe_logradouros_trgm_idx').using('gin', sql`${t.logradouroNormalizado} gin_trgm_ops`),
  ],
)

/** Um registro por endereço do CNEFE 2022 com coordenada. */
export const cnefeEnderecos = referenciaGeo.table(
  'cnefe_enderecos',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    municipioCodigo: integer().notNull(),
    cep: char({ length: 8 }),
    /** Bairro ou localidade, sem acento e em maiúsculas */
    localidade: text(),
    logradouroNormalizado: text().notNull(),
    /** Nulo = sem número (S/N) */
    numero: integer(),
    modificador: text(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    /** NV_GEO_COORD: 1 original, 2 modificada, 3 estimada, 4 face, 5 localidade, 6 setor */
    nivelCoordenada: smallint().notNull(),
    /** COD_ESPECIE do CNEFE (1 domicílio particular, 2 coletivo, 3 estabelecimento agropecuário, 4 estabelecimento não residencial...) */
    especie: smallint().notNull(),
  },
  (t) => [
    index('cnefe_enderecos_rua_idx').on(t.municipioCodigo, t.logradouroNormalizado, t.numero),
    index('cnefe_enderecos_cep_idx').on(t.cep),
  ],
)
