import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  boolean,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  funilFases,
  funis,
  motivos,
  origens,
  solucoes,
  statusOportunidade,
  tags,
} from './cadastros.js'
import { empresas } from './carteira.js'
import { contatos } from './contatos.js'
import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// Oportunidades (docs/modelagem_banco.md, seção 9): Módulo 6 do MVP. RLS, FORCE e GRANTs ficam na migração.

/**
 * A oportunidade de venda de uma empresa. Os valores são digitados em **valor único**, **valor mensal** e
 * **meses**; o **total** (`único + mensal × meses`) e o **ponderado** (`total × probabilidade`) são colunas
 * geradas pelo banco, o único lugar onde a conta existe: nunca ficam inconsistentes com o que foi digitado.
 */
export const oportunidades = pgTable(
  'oportunidades',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    titulo: text().notNull(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    /** Contato principal; precisa ter vínculo ativo com a empresa (conferido na API) */
    contatoId: uuid().references(() => contatos.id),
    solucaoId: uuid().references(() => solucoes.id),
    origemId: uuid().references(() => origens.id),
    funilId: uuid()
      .notNull()
      .references(() => funis.id),
    /** A fase atual (ou a última, em oportunidade fechada) */
    faseId: uuid()
      .notNull()
      .references(() => funilFases.id),
    status: statusOportunidade().notNull().default('ativo'),
    /** A fase em que a oportunidade estava quando saiu de Ativo ("fase em que parou") */
    faseParouEmId: uuid().references(() => funilFases.id),
    motivoId: uuid().references(() => motivos.id),
    motivoDetalhe: text(),
    /** Suspenso: "retomar em" */
    suspensaAte: date(),
    /** A atividade de retomada criada ao suspender (FK só no SQL da migração; importar `atividades` faria um ciclo) */
    atividadeRetomadaId: uuid(),
    responsavelId: uuid()
      .notNull()
      .references(() => membros.id),
    valorUnico: numeric({ precision: 15, scale: 2 }).notNull().default('0'),
    valorMensal: numeric({ precision: 15, scale: 2 }).notNull().default('0'),
    /** Duração do valor mensal, em meses (a API assume 12 quando há valor mensal e nada foi dito) */
    meses: integer().notNull().default(0),
    valorTotal: numeric({ precision: 15, scale: 2 })
      .notNull()
      .generatedAlwaysAs(sql`valor_unico + valor_mensal * meses`),
    probabilidade: smallint().notNull().default(0),
    /** A pessoa editou a probabilidade à mão: mover de fase não a troca (só avisa a sugestão da nova fase) */
    probabilidadeManual: boolean().notNull().default(false),
    valorPonderado: numeric({ precision: 15, scale: 2 })
      .notNull()
      .generatedAlwaysAs(sql`round((valor_unico + valor_mensal * meses) * probabilidade / 100, 2)`),
    /** Opcional: sem data, a oportunidade é "sem previsão" e fica fora da previsão do mês */
    dataPrevistaFechamento: date(),
    dataFechamento: timestamp({ withTimezone: true }),
    /** Quando entrou na fase atual ("parada há N dias nesta fase") */
    faseDesde: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Última atividade realizada ligada à oportunidade (alerta de parada) */
    ultimaAtividadeEm: timestamp({ withTimezone: true }),
    /** Próxima atividade aberta ligada à oportunidade (FK só no SQL da migração) */
    proximaAtividadeId: uuid(),
    proximaAtividadeEm: timestamp({ withTimezone: true }),
    observacoes: text(),
    /** O lote de importação que criou a oportunidade (sem FK, como `atividades.importacao_id`) */
    importacaoId: uuid(),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('oportunidades_status_idx').on(t.tenantId, t.status, t.funilId, t.faseId),
    index('oportunidades_responsavel_idx').on(t.tenantId, t.responsavelId, t.status),
    index('oportunidades_empresa_idx').on(t.tenantId, t.empresaId),
    index('oportunidades_previsao_idx').on(t.tenantId, t.dataPrevistaFechamento),
    index('oportunidades_importacao_idx').on(t.tenantId, t.importacaoId),
    check('oportunidades_probabilidade', sql`${t.probabilidade} BETWEEN 0 AND 100`),
    check('oportunidades_valores', sql`${t.valorUnico} >= 0 AND ${t.valorMensal} >= 0`),
    check('oportunidades_meses', sql`${t.meses} >= 0`),
    // Fechada (qualquer status que não seja Ativo) tem data de fechamento e a fase em que parou
    check('oportunidades_fechamento', sql`(${t.status} = 'ativo') = (${t.faseParouEmId} IS NULL)`),
  ],
)

export const acaoDoHistoricoDaOportunidade = pgEnum('acao_historico_oportunidade', [
  'criada',
  'fase',
  'status',
  'reaberta',
])

/** Cada mudança de fase ou de status (base do tempo médio por fase e da conversão). Só de acréscimo. */
export const oportunidadeHistorico = pgTable(
  'oportunidade_historico',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    oportunidadeId: uuid()
      .notNull()
      .references(() => oportunidades.id),
    acao: acaoDoHistoricoDaOportunidade().notNull(),
    faseDeId: uuid().references(() => funilFases.id),
    faseParaId: uuid().references(() => funilFases.id),
    statusDe: statusOportunidade(),
    statusPara: statusOportunidade(),
    motivoId: uuid().references(() => motivos.id),
    detalhe: text(),
    por: uuid().references(() => membros.id),
    em: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oportunidade_historico_idx').on(t.tenantId, t.oportunidadeId, t.em)],
)

/**
 * As tags da oportunidade, só de grupos com `aplica_a = 'oportunidade'` (o gatilho `app_conferir_alvo_da_tag`
 * da migração recusa as outras). Como `contato_tags`: a linha é o vínculo; tirar a tag apaga a linha e a
 * auditoria da oportunidade (`alterar_tags`) guarda o que houve.
 */
export const oportunidadeTags = pgTable(
  'oportunidade_tags',
  {
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    oportunidadeId: uuid()
      .notNull()
      .references(() => oportunidades.id),
    tagId: uuid()
      .notNull()
      .references(() => tags.id),
    aplicadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    aplicadaPor: uuid().references(() => membros.id),
  },
  (t) => [
    primaryKey({ columns: [t.oportunidadeId, t.tagId] }),
    index('oportunidade_tags_tag_idx').on(t.tenantId, t.tagId),
  ],
)
