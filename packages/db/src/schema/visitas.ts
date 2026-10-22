import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { atividades } from './atividades.js'
import { empresas } from './carteira.js'
import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid, geografiaPonto } from './tipos.js'

// Visitas: construtor do relatório e resultados (G3a; docs/plano_geolocalizacao.md, seção 9, e
// docs/modelagem_banco.md, seção "Visitas"). RLS, FORCE e GRANTs ficam na migração (aplicar_rls_tenant).

/** Resultados de sistema: só se renomeiam e trocam de modelo; os demais não têm chave. */
export const chaveResultadoVisita = pgEnum('chave_resultado_visita', [
  'nao_localizada',
  'encerrada',
])

const autoria = () => ({
  ...carimbos(),
  criadoPor: uuid().references((): AnyPgColumn => membros.id),
  atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  excluidoEm: timestamp({ withTimezone: true }),
})

/** Modelo do relatório de visita; os campos ficam nas versões (a atual em `versao_atual_id`). */
export const visitaModelos = pgTable(
  'visita_modelos',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: text().notNull(),
    padrao: boolean().notNull().default(false),
    ativo: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    /** Versão em uso nos relatórios novos; nula só enquanto o modelo é criado (mesma transação) */
    versaoAtualId: uuid().references((): AnyPgColumn => visitaModeloVersoes.id),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('visita_modelos_nome_uq')
      .on(t.tenantId, sql`lower(${t.nome})`)
      .where(sql`${t.excluidoEm} IS NULL`),
    // No máximo um modelo padrão por empresa
    uniqueIndex('visita_modelos_padrao_uq')
      .on(t.tenantId)
      .where(sql`${t.padrao} AND ${t.excluidoEm} IS NULL`),
  ],
)

/** Versão dos campos de um modelo. Publicada (com relatório) nunca muda: editar cria a N+1. */
export const visitaModeloVersoes = pgTable(
  'visita_modelo_versoes',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    modeloId: uuid()
      .notNull()
      .references((): AnyPgColumn => visitaModelos.id),
    numero: integer().notNull(),
    /** Lista de campos (`campoDeVisitaSchema` do @leadtogo/shared), na ordem de exibição */
    campos: jsonb().notNull().default([]),
    ...autoria(),
  },
  (t) => [uniqueIndex('visita_modelo_versoes_numero_uq').on(t.modeloId, t.numero)],
)

/** Resultado da visita: campo de sistema, fora do modelo; escolhe o modelo do relatório. */
export const visitaResultados = pgTable(
  'visita_resultados',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: text().notNull(),
    chaveSistema: chaveResultadoVisita(),
    modeloId: uuid()
      .notNull()
      .references(() => visitaModelos.id),
    ativo: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('visita_resultados_nome_uq')
      .on(t.tenantId, sql`lower(${t.nome})`)
      .where(sql`${t.excluidoEm} IS NULL`),
    uniqueIndex('visita_resultados_chave_sistema_uq')
      .on(t.tenantId, t.chaveSistema)
      .where(sql`${t.chaveSistema} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
  ],
)

export const situacaoRelatorioVisita = pgEnum('situacao_relatorio_visita', [
  'rascunho',
  'concluido',
])

/**
 * Relatório de visita (G3b). O id é gerado no aparelho (uuid v7): reenviar o mesmo relatório não
 * duplica (o `PUT /visitas/:id` é um upsert). A atividade Visita nasce "em execução" com o check-in e
 * vira "realizada" ao concluir. A posição do vendedor só existe com check-in (LGPD, `lgpd.md` 3.2).
 */
export const relatoriosVisita = pgTable(
  'relatorios_visita',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    atividadeId: uuid()
      .notNull()
      .references(() => atividades.id),
    responsavelId: uuid()
      .notNull()
      .references(() => membros.id),
    /** "Registrar depois": sem check-in e sem posição */
    semCheckin: boolean().notNull().default(false),
    checkinEm: timestamp({ withTimezone: true }),
    checkinLocal: geografiaPonto(),
    /** Precisão informada pelo aparelho, em metros */
    checkinPrecisaoM: integer(),
    /** Distância até a posição da empresa no check-in; nula se a empresa não tinha coordenada */
    distanciaM: integer(),
    foraDoLimite: boolean().notNull().default(false),
    /** O check-in foi feito sem sinal (a regra do modo foi aplicada no aparelho) */
    checkinOffline: boolean().notNull().default(false),
    situacao: situacaoRelatorioVisita().notNull().default('rascunho'),
    resultadoId: uuid().references(() => visitaResultados.id),
    modeloVersaoId: uuid().references(() => visitaModeloVersoes.id),
    /** `[{ campoId, rotulo (o da época), valor }]` */
    respostas: jsonb().notNull().default([]),
    concluidoEm: timestamp({ withTimezone: true }),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('relatorios_visita_atividade_uq').on(t.atividadeId),
    index('relatorios_visita_responsavel_idx').on(t.tenantId, t.responsavelId, t.situacao),
    index('relatorios_visita_empresa_idx').on(t.tenantId, t.empresaId, t.criadoEm.desc()),
    index('relatorios_visita_versao_idx').on(t.tenantId, t.modeloVersaoId),
    check(
      'relatorios_visita_checkin',
      sql`${t.semCheckin} = (${t.checkinEm} IS NULL) AND (${t.checkinLocal} IS NULL OR ${t.checkinEm} IS NOT NULL)`,
    ),
    check(
      'relatorios_visita_concluido',
      sql`${t.situacao} <> 'concluido' OR (${t.resultadoId} IS NOT NULL AND ${t.modeloVersaoId} IS NOT NULL AND ${t.concluidoEm} IS NOT NULL)`,
    ),
  ],
)
