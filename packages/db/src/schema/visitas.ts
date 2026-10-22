import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

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
