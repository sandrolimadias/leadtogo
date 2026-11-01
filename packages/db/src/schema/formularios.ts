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
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { empresas } from './carteira.js'
import { contatos } from './contatos.js'
import { membros, tenants } from './plataforma.js'
import { portalAcessos } from './portal.js'
import { carimbos, chaveUuid } from './tipos.js'

// Portal, Fase 4E (docs/plano_portal_formularios_e_eventos.md, seção 7): construtor de formulários. A definição
// é JSON (validada pelo Zod de @leadtogo/shared); cada publicação congela uma VERSÃO, e toda resposta guarda a
// versão com que foi preenchida (editar o formulário nunca quebra resposta antiga nem relatório).

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

export const finalidadeFormulario = pgEnum('finalidade_formulario', [
  'livre',
  'inscricao_evento',
  'avaliacao_evento',
  'satisfacao_chamado',
  'associacao',
])
export const acessoFormulario = pgEnum('acesso_formulario', ['publico', 'logado'])
export const situacaoFormulario = pgEnum('situacao_formulario', [
  'rascunho',
  'publicado',
  'arquivado',
])
export const origemResposta = pgEnum('origem_resposta_formulario', ['portal', 'publico', 'crm'])
export const situacaoAcaoFormulario = pgEnum('situacao_acao_formulario', [
  'pendente',
  'ok',
  'falhou',
])

export const formularios = pgTable(
  'formularios',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    nome: varchar({ length: 120 }).notNull(),
    finalidade: finalidadeFormulario().notNull().default('livre'),
    acesso: acessoFormulario().notNull().default('logado'),
    situacao: situacaoFormulario().notNull().default('rascunho'),
    /** Endereço público /f/<slug>: único em todo o sistema (acha o tenant sem login) */
    slug: varchar({ length: 40 }).notNull(),
    captcha: boolean().notNull().default(true),
    /** O rascunho que o construtor edita */
    definicao: jsonb().notNull(),
    versaoPublicada: integer(),
    /** O rascunho mudou depois da última publicação */
    temMudancas: boolean().notNull().default(true),
    /** Segredo das ações de webhook (cifrado, como o dos webhooks da API) */
    segredoWebhook: text(),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('formularios_slug_uq').on(t.slug),
    index('formularios_tenant_idx').on(t.tenantId, t.situacao),
    check(
      'formularios_publicado_chk',
      sql`${t.situacao} <> 'publicado' OR ${t.versaoPublicada} IS NOT NULL`,
    ),
  ],
)

/** Cada publicação congela a definição (imutável). */
export const formularioVersoes = pgTable(
  'formulario_versoes',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    formularioId: uuid()
      .notNull()
      .references(() => formularios.id),
    versao: integer().notNull(),
    definicao: jsonb().notNull(),
    publicadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    publicadaPor: uuid().references(() => membros.id),
    ...carimbos(),
  },
  (t) => [uniqueIndex('formulario_versoes_uq').on(t.formularioId, t.versao)],
)

export const formularioRespostas = pgTable(
  'formulario_respostas',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    formularioId: uuid()
      .notNull()
      .references(() => formularios.id),
    versao: integer().notNull(),
    origem: origemResposta().notNull(),
    /** Qual botão foi usado (as ações dele rodam no worker) */
    botao: varchar({ length: 40 }).notNull(),
    respostas: jsonb().notNull(),
    acessoId: uuid().references(() => portalAcessos.id),
    contatoId: uuid().references(() => contatos.id),
    empresaId: uuid().references(() => empresas.id),
    /** A que a resposta se refere (evento, chamado...) */
    contextoTipo: varchar({ length: 40 }),
    contextoId: uuid(),
    ip: text(),
    agente: text(),
    consentimentoEm: timestamp({ withTimezone: true }),
    ...carimbos(),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('formulario_respostas_form_idx').on(t.formularioId, t.criadoEm),
    index('formulario_respostas_contexto_idx').on(t.tenantId, t.contextoTipo, t.contextoId),
    index('formulario_respostas_acesso_idx').on(t.acessoId),
    check(
      'formulario_respostas_contexto_chk',
      sql`(${t.contextoTipo} IS NULL) = (${t.contextoId} IS NULL)`,
    ),
  ],
)

/** Cada ação (webhook, e-mail) disparada por uma resposta, com o resultado. */
export const formularioAcoesExecucoes = pgTable(
  'formulario_acoes_execucoes',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    respostaId: uuid()
      .notNull()
      .references(() => formularioRespostas.id),
    /** Posição da ação no botão */
    indice: smallint().notNull(),
    tipo: varchar({ length: 20 }).notNull(),
    situacao: situacaoAcaoFormulario().notNull().default('pendente'),
    tentativas: smallint().notNull().default(0),
    statusHttp: integer(),
    detalhe: text(),
    ...carimbos(),
  },
  (t) => [uniqueIndex('formulario_acoes_execucoes_uq').on(t.respostaId, t.indice)],
)
