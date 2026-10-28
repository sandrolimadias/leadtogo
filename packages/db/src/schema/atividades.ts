import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { tiposAtividade } from './cadastros.js'
import { empresas } from './carteira.js'
import { contatos } from './contatos.js'
import { oportunidades } from './oportunidades.js'
import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// Atividades (docs/modelagem_banco.md, seção 8): Módulo 5 do MVP. RLS, FORCE e GRANTs ficam na migração.

/** Atrasada não é situação: é calculada (pendente ou em execução com a data já passada). */
export const situacaoAtividade = pgEnum('situacao_atividade', [
  'pendente',
  'em_execucao',
  'realizada',
  'cancelada',
])

export const origemAtividade = pgEnum('origem_atividade', [
  'manual',
  'whatsapp',
  'email',
  'agenda',
  'api',
  'recorrencia',
  'importacao',
])

/**
 * Atividade e tarefa são a mesma coisa (o tipo Tarefa não exige empresa). Um contato por atividade
 * (decisão do Módulo 5); a tabela N:N de participantes fica para depois.
 * `realizada_em` é QUANDO aconteceu (alimenta última visita e último contato); `data_inicio` é a data
 * agendada (ao registrar algo já feito, as duas são iguais).
 */
export const atividades = pgTable(
  'atividades',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    tipoAtividadeId: uuid()
      .notNull()
      .references(() => tiposAtividade.id),
    titulo: text().notNull(),
    /** Obrigatória, exceto no tipo com `exige_empresa = false` (Tarefa): conferido na API */
    empresaId: uuid().references(() => empresas.id),
    contatoId: uuid().references(() => contatos.id),
    /** Opcional; da mesma empresa (conferido na API) */
    oportunidadeId: uuid().references(() => oportunidades.id),
    responsavelId: uuid()
      .notNull()
      .references(() => membros.id),
    dataInicio: timestamp({ withTimezone: true }).notNull(),
    dataFim: timestamp({ withTimezone: true }),
    /** Dia inteiro: `data_inicio` é a meia-noite do dia no fuso da empresa */
    diaInteiro: boolean().notNull().default(false),
    situacao: situacaoAtividade().notNull().default('pendente'),
    realizadaEm: timestamp({ withTimezone: true }),
    resultado: text(),
    importante: boolean().notNull().default(false),
    urgente: boolean().notNull().default(false),
    observacoes: text(),
    origem: origemAtividade().notNull().default('manual'),
    /** Identificador no sistema de origem (API pública): repetir o mesmo não cria outra atividade */
    idExterno: varchar({ length: 200 }),
    /**
     * Visita que NÃO conta para a empresa ("não localizada", G3b): não atualiza a última visita, o último
     * contato nem a tag Visitada. Nunca tira a atividade das contagens de esforço (Dashboard, indicadores, listas).
     */
    contaVisita: boolean().notNull().default(true),
    /** O lote de importação que criou a atividade (sem FK, como `empresas.importacao_id`: evita ciclo de módulos) */
    importacaoId: uuid(),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('atividades_responsavel_idx').on(t.tenantId, t.responsavelId, t.situacao, t.dataInicio),
    index('atividades_empresa_idx').on(t.tenantId, t.empresaId, t.dataInicio.desc()),
    index('atividades_oportunidade_idx').on(t.tenantId, t.oportunidadeId),
    index('atividades_contato_idx').on(t.tenantId, t.contatoId, t.dataInicio.desc()),
    index('atividades_importacao_idx').on(t.tenantId, t.importacaoId),
    uniqueIndex('atividades_id_externo_uq')
      .on(t.tenantId, t.origem, t.idExterno)
      .where(sql`${t.idExterno} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
    // "realizada" e "realizada_em" andam juntos; realizada exige o resultado
    check(
      'atividades_realizada_em',
      sql`(${t.situacao} = 'realizada') = (${t.realizadaEm} IS NOT NULL)`,
    ),
    check(
      'atividades_realizada_resultado',
      sql`${t.situacao} <> 'realizada' OR length(btrim(coalesce(${t.resultado}, ''))) > 0`,
    ),
    check('atividades_fim', sql`${t.dataFim} IS NULL OR ${t.dataFim} >= ${t.dataInicio}`),
  ],
)
