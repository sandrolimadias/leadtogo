import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
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
import { membros, tenants } from './plataforma.js'
import { portalAcessos } from './portal.js'
import { carimbos, chaveUuid } from './tipos.js'

// Portal do Cliente, Fase 3D: agenda (docs/plano_portal_cliente.md, seção 7). A equipe publica eventos com vagas
// (totais e por empresa), prazo de confirmação e alcance; o cliente confirma e cancela a presença; a lista de espera
// promove sozinha quando abre uma vaga. Confirmar e cancelar são funções SECURITY DEFINER do banco (travam a linha do
// evento), então ninguém passa do limite de vagas, nem com duas pessoas confirmando ao mesmo tempo.

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

export const situacaoDoEvento = pgEnum('situacao_evento', ['rascunho', 'publicado', 'cancelado'])
export const alcanceDoEvento = pgEnum('alcance_evento', ['todos', 'empresas', 'tags'])
export const situacaoDaConfirmacao = pgEnum('situacao_confirmacao', [
  'confirmado',
  'lista_espera',
  'cancelado',
])

/** Evento da agenda do portal. Vagas nulas = sem limite. */
export const eventos = pgTable(
  'eventos',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    titulo: varchar({ length: 160 }).notNull(),
    /** Markdown restrito, como as publicações */
    descricao: text(),
    local: varchar({ length: 200 }),
    /** Endereço da transmissão (http ou https) */
    linkOnline: text(),
    inicioEm: timestamp({ withTimezone: true }).notNull(),
    fimEm: timestamp({ withTimezone: true }).notNull(),
    vagasTotais: integer(),
    vagasPorEmpresa: integer(),
    /** Depois dele ninguém confirma nem cancela pelo portal (nulo = até o início) */
    prazoConfirmacao: timestamp({ withTimezone: true }),
    alcance: alcanceDoEvento().notNull().default('todos'),
    situacao: situacaoDoEvento().notNull().default('rascunho'),
    publicadoEm: timestamp({ withTimezone: true }),
    canceladoEm: timestamp({ withTimezone: true }),
    canceladoMotivo: text(),
    /** O lembrete de 24 horas antes já saiu (uma vez por evento) */
    lembreteEnviadoEm: timestamp({ withTimezone: true }),
    /** Pessoas confirmadas, mantido pelas funções de confirmar, cancelar e promover */
    totalConfirmados: integer().notNull().default(0),
    totalListaEspera: integer().notNull().default(0),
    ...autoria(),
  },
  (t) => [
    index('eventos_agenda_idx').on(t.tenantId, t.inicioEm),
    check('eventos_periodo_chk', sql`${t.fimEm} > ${t.inicioEm}`),
    check(
      'eventos_vagas_chk',
      sql`(${t.vagasTotais} IS NULL OR ${t.vagasTotais} >= 1) AND (${t.vagasPorEmpresa} IS NULL OR ${t.vagasPorEmpresa} >= 1)`,
    ),
    check(
      'eventos_prazo_chk',
      sql`${t.prazoConfirmacao} IS NULL OR ${t.prazoConfirmacao} <= ${t.inicioEm}`,
    ),
    check('eventos_link_chk', sql`${t.linkOnline} IS NULL OR ${t.linkOnline} ~* '^https?://'`),
    check(
      'eventos_cancelado_chk',
      sql`(${t.situacao} = 'cancelado') = (${t.canceladoEm} IS NOT NULL)`,
    ),
    check('eventos_publicado_chk', sql`${t.situacao} = 'rascunho' OR ${t.publicadoEm} IS NOT NULL`),
  ],
)

/** As empresas-clientes do alcance "empresas". */
export const eventoEmpresas = pgTable(
  'evento_empresas',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('evento_empresas_uq').on(t.eventoId, t.empresaId),
    index('evento_empresas_empresa_idx').on(t.empresaId),
  ],
)

/** A presença de uma pessoa (confirmada, na lista de espera ou cancelada). Uma ativa por pessoa e evento. */
export const eventoConfirmacoes = pgTable(
  'evento_confirmacoes',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    situacao: situacaoDaConfirmacao().notNull().default('lista_espera'),
    /** Quando entrou na fila (a ordem da promoção) */
    entrouNaFilaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    confirmadoEm: timestamp({ withTimezone: true }),
    /** Se saiu da fila para uma vaga (quando alguém cancelou) */
    promovidoEm: timestamp({ withTimezone: true }),
    canceladoEm: timestamp({ withTimezone: true }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('evento_confirmacoes_ativa_uq')
      .on(t.eventoId, t.acessoId)
      .where(sql`${t.situacao} <> 'cancelado'`),
    index('evento_confirmacoes_fila_idx').on(t.eventoId, t.situacao, t.entrouNaFilaEm),
    index('evento_confirmacoes_empresa_idx').on(t.eventoId, t.empresaId),
    check(
      'evento_confirmacoes_confirmado_chk',
      sql`${t.situacao} <> 'confirmado' OR ${t.confirmadoEm} IS NOT NULL`,
    ),
    check(
      'evento_confirmacoes_cancelado_chk',
      sql`(${t.situacao} = 'cancelado') = (${t.canceladoEm} IS NOT NULL)`,
    ),
  ],
)
