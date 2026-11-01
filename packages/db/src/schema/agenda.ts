import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
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
import { carimbos, chaveUuid, citext } from './tipos.js'

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
/** Como a presença foi registrada no dia (Fase 4G) */
export const presencaNoEvento = pgEnum('presenca_evento', [
  'nao_registrada',
  'checkin_qr',
  'manual',
])
/** Por onde a pessoa se inscreveu (Fase 4G) */
export const origemDaParticipacao = pgEnum('origem_participacao', ['portal', 'publico', 'equipe'])

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
    // Fase 4G (docs/plano_portal_formularios_e_eventos.md, seção 9)
    /** Público: qualquer pessoa se inscreve (página pública); falso: só associado logado */
    publico: boolean().notNull().default(false),
    /** Formulário de inscrição e de avaliação (FK só no SQL: evita ciclo no schema) */
    formularioInscricaoId: uuid(),
    formularioAvaliacaoId: uuid(),
    /** A publicação que nasceu do evento (B-8; FK só no SQL) */
    publicacaoId: uuid(),
    /** Encerrado pela equipe (dispara o pedido de avaliação aos presentes) */
    encerradoEm: timestamp({ withTimezone: true }),
    encerradoPor: uuid().references((): AnyPgColumn => membros.id),
    /** QR de check-in: só o hash do token (regerar troca e o antigo para de valer) */
    checkinTokenHash: text(),
    /** Exigir código por e-mail no check-in sem login (padrão: não) */
    checkinExigeCodigo: boolean().notNull().default(false),
    /** Quantos minutos antes do início o check-in abre */
    checkinAbreMinutos: smallint().notNull().default(120),
    ...autoria(),
  },
  (t) => [
    index('eventos_agenda_idx').on(t.tenantId, t.inicioEm),
    uniqueIndex('eventos_checkin_uq').on(t.checkinTokenHash),
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
    /** Nulo para quem se inscreveu sem acesso ao portal (página pública ou pela equipe) */
    acessoId: uuid().references(() => portalAcessos.id),
    /** A empresa (do acesso, ou achada/cadastrada pelo CNPJ); nula sem CNPJ */
    empresaId: uuid().references(() => empresas.id),
    situacao: situacaoDaConfirmacao().notNull().default('lista_espera'),
    // Fase 4G: quem é a pessoa (também de quem não tem acesso), presença e avaliação
    origem: origemDaParticipacao().notNull().default('portal'),
    nome: varchar({ length: 160 }),
    email: citext(),
    telefone: varchar({ length: 20 }),
    cnpj: varchar({ length: 14 }),
    contatoId: uuid().references(() => contatos.id),
    /** A resposta do formulário de inscrição (FK só no SQL) */
    respostaId: uuid(),
    presenca: presencaNoEvento().notNull().default('nao_registrada'),
    presencaEm: timestamp({ withTimezone: true }),
    presencaPor: uuid().references(() => membros.id),
    /** A resposta do formulário de avaliação (FK só no SQL) */
    avaliacaoRespostaId: uuid(),
    /** Link pessoal da avaliação por e-mail (só o hash) */
    avaliacaoTokenHash: text(),
    avaliacaoPedidaEm: timestamp({ withTimezone: true }),
    avaliacaoLembretes: smallint().notNull().default(0),
    /** A empresa, o contato e a tarefa já foram tratados no CRM (B-17) */
    crmTratadoEm: timestamp({ withTimezone: true }),
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
    uniqueIndex('evento_confirmacoes_email_uq')
      .on(t.eventoId, t.email)
      .where(sql`${t.situacao} <> 'cancelado' AND ${t.email} IS NOT NULL`),
    uniqueIndex('evento_confirmacoes_avaliacao_uq').on(t.avaliacaoTokenHash),
    index('evento_confirmacoes_empresa_hist_idx').on(t.tenantId, t.empresaId),
    check('evento_confirmacoes_quem_chk', sql`${t.acessoId} IS NOT NULL OR ${t.email} IS NOT NULL`),
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
