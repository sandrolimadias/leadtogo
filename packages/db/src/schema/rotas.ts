import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { atividades } from './atividades.js'
import { empresas } from './carteira.js'
import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid, geografiaLinha, geografiaPonto } from './tipos.js'

// Rotas (G4; docs/plano_geolocalizacao.md, seção 10, e docs/modelagem_banco.md, seção "Rotas").
// RLS, FORCE e GRANTs ficam na migração (aplicar_rls_tenant).

const autoria = () => ({
  ...carimbos(),
  criadoPor: uuid().references((): AnyPgColumn => membros.id),
  atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  excluidoEm: timestamp({ withTimezone: true }),
})

/** Ponto de partida cadastrado pelo admin (ex.: a sede). A posição é marcada no mapa. */
export const rotaPontosPartida = pgTable(
  'rota_pontos_partida',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: text().notNull(),
    /** Endereço para exibir (texto livre); a posição vale pelo ponto marcado */
    endereco: text(),
    localizacao: geografiaPonto().notNull(),
    padrao: boolean().notNull().default(false),
    ativo: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('rota_pontos_partida_nome_uq')
      .on(t.tenantId, sql`lower(${t.nome})`)
      .where(sql`${t.excluidoEm} IS NULL`),
    uniqueIndex('rota_pontos_partida_padrao_uq')
      .on(t.tenantId)
      .where(sql`${t.padrao} AND ${t.excluidoEm} IS NULL`),
  ],
)

export const partidaRota = pgEnum('partida_rota', ['posicao_atual', 'ponto'])
export const situacaoRota = pgEnum('situacao_rota', [
  'planejada',
  'em_andamento',
  'concluida',
  'cancelada',
])
/** Como saíram as distâncias e os tempos gravados: pelas ruas (OSRM) ou estimados em linha reta */
export const estimativaRota = pgEnum('estimativa_rota', ['ruas', 'linha_reta'])
export const situacaoParada = pgEnum('situacao_parada', ['pendente', 'visitada', 'pulada'])

/**
 * Rota de visitas de um dia (G4). A posição atual do aparelho, quando é a partida, NUNCA é gravada
 * (LGPD, `lgpd.md` 3.3): as estimativas gravadas são as do momento do cálculo.
 */
export const rotas = pgTable(
  'rotas',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    /** Sequencial por empresa, exibido como R-0151 (`tenant_configuracoes.rota_ultimo_codigo`) */
    codigo: integer().notNull(),
    nome: text().notNull(),
    data: date({ mode: 'string' }).notNull(),
    /** O vendedor que vai rodar a rota */
    responsavelId: uuid()
      .notNull()
      .references(() => membros.id),
    partida: partidaRota().notNull().default('posicao_atual'),
    pontoPartidaId: uuid().references(() => rotaPontosPartida.id),
    voltarAoInicio: boolean().notNull().default(true),
    minutosPorVisita: smallint().notNull().default(40),
    situacao: situacaoRota().notNull().default('planejada'),
    /** Distância e tempo de deslocamento (sem as visitas), nulos sem paradas */
    distanciaM: integer(),
    duracaoS: integer(),
    estimativa: estimativaRota(),
    otimizadaEm: timestamp({ withTimezone: true }),
    /** Trajeto pelas ruas (só com `estimativa = ruas`), para o mapa */
    trajeto: geografiaLinha(),
    iniciadaEm: timestamp({ withTimezone: true }),
    concluidaEm: timestamp({ withTimezone: true }),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('rotas_codigo_uq').on(t.tenantId, t.codigo),
    index('rotas_responsavel_data_idx').on(t.tenantId, t.responsavelId, t.data),
    index('rotas_data_idx').on(t.tenantId, t.data),
    check('rotas_partida_chk', sql`(${t.partida} = 'ponto') = (${t.pontoPartidaId} IS NOT NULL)`),
    check('rotas_minutos_por_visita_chk', sql`${t.minutosPorVisita} BETWEEN 0 AND 480`),
  ],
)

/** Parada da rota: uma empresa, na ordem de visita. Execução (G4b): situação e a visita ligada. */
export const rotaParadas = pgTable(
  'rota_paradas',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    rotaId: uuid()
      .notNull()
      .references(() => rotas.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    ordem: smallint().notNull(),
    /** Trecho que CHEGA a esta parada (da anterior ou da partida) */
    distanciaTrechoM: integer(),
    duracaoTrechoS: integer(),
    situacao: situacaoParada().notNull().default('pendente'),
    motivoPulo: text(),
    /** A atividade Visita do check-in (G3) feita nesta parada */
    atividadeId: uuid().references(() => atividades.id),
    resolvidaEm: timestamp({ withTimezone: true }),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('rota_paradas_empresa_uq')
      .on(t.rotaId, t.empresaId)
      .where(sql`${t.excluidoEm} IS NULL`),
    index('rota_paradas_rota_idx').on(t.rotaId, t.ordem),
    index('rota_paradas_empresa_idx').on(t.tenantId, t.empresaId, t.situacao),
    uniqueIndex('rota_paradas_atividade_uq')
      .on(t.atividadeId)
      .where(sql`${t.atividadeId} IS NOT NULL`),
    check('rota_paradas_ordem_chk', sql`${t.ordem} >= 1`),
    check('rota_paradas_pulo_chk', sql`(${t.situacao} = 'pulada') = (${t.motivoPulo} IS NOT NULL)`),
  ],
)
