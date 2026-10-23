import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  check,
  integer,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { chamados } from './chamados.js'
import { contatos } from './contatos.js'
import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// Tabelas do sistema (docs/modelagem_banco.md, seção 11). RLS, FORCE e GRANTs ficam na migração.

/** Anexos de qualquer entidade; o conteúdo fica no Garage (S3), em `tenant_id/entidade/arquivo`. */
export const arquivos = pgTable(
  'arquivos',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    chaveArquivo: text().notNull(),
    nome: text().notNull(),
    mime: text().notNull(),
    tamanho: bigint({ mode: 'number' }).notNull(),
    entidadeTipo: text(),
    entidadeId: uuid(),
    enviadoPor: uuid().references(() => membros.id),
    ...carimbos(),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('arquivos_chave_arquivo_uq').on(t.chaveArquivo),
    index('arquivos_entidade_idx').on(t.tenantId, t.entidadeTipo, t.entidadeId),
  ],
)

export const destinatarioDaNotificacao = pgEnum('destinatario_da_notificacao', [
  'membro',
  'contato',
])
/** Canal de entrega: o sino do CRM (e do portal, depois) ou o e-mail */
export const canalDaNotificacao = pgEnum('canal_da_notificacao', ['sino', 'email'])

/**
 * Central de notificações. O destinatário é um membro da equipe (sino do CRM) ou um contato do cliente
 * (sino do portal e e-mail, na fase seguinte); uma linha por destinatário e canal.
 */
export const notificacoes = pgTable(
  'notificacoes',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    destinatarioTipo: destinatarioDaNotificacao().notNull().default('membro'),
    membroId: uuid().references(() => membros.id),
    contatoId: uuid().references(() => contatos.id),
    canal: canalDaNotificacao().notNull().default('sino'),
    chamadoId: uuid().references((): AnyPgColumn => chamados.id),
    tipo: text().notNull(),
    titulo: text().notNull(),
    mensagem: text(),
    link: text(),
    lidaEm: timestamp({ withTimezone: true }),
    /** Canal e-mail: quando o envio foi feito */
    enviadaEm: timestamp({ withTimezone: true }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'notificacoes_destinatario_chk',
      sql`(${t.destinatarioTipo} = 'membro' AND ${t.membroId} IS NOT NULL AND ${t.contatoId} IS NULL)
        OR (${t.destinatarioTipo} = 'contato' AND ${t.contatoId} IS NOT NULL AND ${t.membroId} IS NULL)`,
    ),
    index('notificacoes_nao_lidas_idx')
      .on(t.tenantId, t.membroId, t.criadoEm)
      .where(sql`${t.lidaEm} IS NULL`),
    index('notificacoes_contato_idx')
      .on(t.tenantId, t.contatoId, t.criadoEm)
      .where(sql`${t.contatoId} IS NOT NULL`),
    index('notificacoes_chamado_idx')
      .on(t.chamadoId)
      .where(sql`${t.chamadoId} IS NOT NULL`),
  ],
)

/** Fila de eventos gravada na mesma transação do dado (webhooks do n8n, notificações). */
export const eventosOutbox = pgTable(
  'eventos_outbox',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    tipo: text().notNull(),
    entidadeId: uuid(),
    payload: jsonb().notNull().default({}),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Entregue à fila do worker (o payload é apagado nesse momento) */
    processadoEm: timestamp({ withTimezone: true }),
    /** Quantas vezes o relay do outbox tentou entregar (a reserva soma 1) */
    tentativas: integer().notNull().default(0),
    /** Não tentar antes disso (espera progressiva após falha) */
    proximaTentativaEm: timestamp({ withTimezone: true }),
    /** Reservado por um relay até este instante (outros relays o pulam); expira se o relay cair */
    reservadoAte: timestamp({ withTimezone: true }),
    ultimoErro: text(),
    /** Esgotou as tentativas: nunca mais é reservado (o alerta da E14 olha esta coluna) */
    falhouEm: timestamp({ withTimezone: true }),
    /** Quando um operador tratou o evento esgotado (`node dist/outbox-tratar.js`); o alerta da E14 só conta os não tratados */
    tratadoEm: timestamp({ withTimezone: true }),
    /** Quem tratou (nome informado ao comando; sem e-mail nem dado pessoal além do nome do operador) */
    tratadoPor: text(),
    /** `reprocessado` (voltou à fila do relay) ou `descartado` (abandonado, sem efeito) */
    tratamento: text(),
  },
  (t) => [
    check(
      'eventos_outbox_tratamento_ck',
      sql`${t.tratamento} IS NULL OR ${t.tratamento} IN ('reprocessado', 'descartado')`,
    ),
    index('eventos_outbox_pendentes_idx')
      .on(t.criadoEm)
      .where(sql`${t.processadoEm} IS NULL`),
  ],
)

export const origemAuditoria = pgEnum('origem_auditoria', ['app', 'api', 'integracao', 'sistema'])

/**
 * Log de alterações. **Particionada por mês** (por `em`): a migração troca o CREATE TABLE gerado
 * pela versão `PARTITION BY RANGE (em)`, que o Drizzle não expressa. O app só tem INSERT e SELECT;
 * as partições são mantidas pelo leadtogo_owner (criar_particao_auditoria).
 */
export const auditoria = pgTable(
  'auditoria',
  {
    id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(),
    tenantId: uuid().notNull(),
    entidade: text().notNull(),
    entidadeId: uuid(),
    acao: text().notNull(),
    /** { antes, depois } */
    alteracoes: jsonb(),
    membroId: uuid(),
    origem: origemAuditoria().notNull().default('app'),
    ip: inet(),
    em: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.em] }),
    index('auditoria_entidade_idx').on(t.tenantId, t.entidade, t.entidadeId, t.em),
  ],
)
