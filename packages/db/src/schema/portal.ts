import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  index,
  jsonb,
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
import { chamados } from './chamados.js'
import { contatos } from './contatos.js'
import { membros, tenants } from './plataforma.js'
import { carimbos, chaveUuid, citext } from './tipos.js'

// Portal do Cliente, Fase 3A (docs/plano_portal_cliente.md). O cliente é um CONTATO com acesso ao portal:
// identidade própria (convite e link mágico, sem senha), separada das contas do CRM. RLS, FORCE e GRANTs
// ficam na migração (aplicar_rls_tenant); o isolamento por empresa-cliente é feito por políticas
// restritivas que dependem das variáveis app.portal_* (a sessão do portal as preenche; o CRM nunca).

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

/** Responsável pode pedir acesso para colegas; Colega só usa. Ambos veem o mesmo (decisão D6). */
export const papelPortal = pgEnum('papel_portal', ['responsavel', 'colega'])
export const situacaoAcessoPortal = pgEnum('situacao_acesso_portal', [
  'convidado',
  'ativo',
  'suspenso',
  'revogado',
])
export const finalidadeLinkPortal = pgEnum('finalidade_link_portal', [
  'convite',
  'entrada',
  'troca_email',
])
export const situacaoPedidoAcesso = pgEnum('situacao_pedido_acesso', [
  'pendente',
  'aprovado',
  'recusado',
])

/** O acesso de um contato ao portal, em UMA empresa-cliente. */
export const portalAcessos = pgTable(
  'portal_acessos',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    contatoId: uuid()
      .notNull()
      .references(() => contatos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    /** E-mail de entrada (sem diferença de caixa); não precisa ser o mesmo de `contato_emails` */
    email: citext().notNull(),
    papel: papelPortal().notNull().default('colega'),
    situacao: situacaoAcessoPortal().notNull().default('convidado'),
    convidadoPor: uuid().references((): AnyPgColumn => membros.id),
    aceitoEm: timestamp({ withTimezone: true }),
    ultimoAcessoEm: timestamp({ withTimezone: true }),
    /** Quando o cliente aceitou o aviso de privacidade do portal (LGPD) */
    privacidadeAceitaEm: timestamp({ withTimezone: true }),
    ...autoria(),
  },
  (t) => [
    // um acesso por contato e empresa; e-mail único por empresa, entre os que ainda valem
    uniqueIndex('portal_acessos_contato_uq')
      .on(t.contatoId, t.empresaId)
      .where(sql`${t.situacao} <> 'revogado' AND ${t.excluidoEm} IS NULL`),
    uniqueIndex('portal_acessos_email_uq')
      .on(t.empresaId, t.email)
      .where(sql`${t.situacao} <> 'revogado' AND ${t.excluidoEm} IS NULL`),
    index('portal_acessos_empresa_idx').on(t.tenantId, t.empresaId),
  ],
)

/** Link de uso único (convite, entrada, troca de e-mail). Só o hash do token fica no banco. */
export const portalLinks = pgTable(
  'portal_links',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    finalidade: finalidadeLinkPortal().notNull(),
    tokenHash: text().notNull(),
    /** Na troca de e-mail, o endereço novo que o link confirma */
    emailDestino: citext(),
    expiraEm: timestamp({ withTimezone: true }).notNull(),
    usadoEm: timestamp({ withTimezone: true }),
    ip: text(),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('portal_links_hash_uq').on(t.tokenHash),
    index('portal_links_acesso_idx').on(t.acessoId),
    check(
      'portal_links_troca_chk',
      sql`(${t.finalidade} = 'troca_email') = (${t.emailDestino} IS NOT NULL)`,
    ),
  ],
)

/** Sessão do cliente no portal (cookie `__Host-portal`). Só o hash do token fica no banco. */
export const portalSessoes = pgTable(
  'portal_sessoes',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    tokenHash: text().notNull(),
    /** Janela deslizante (30 dias a cada uso) */
    expiraEm: timestamp({ withTimezone: true }).notNull(),
    /** Teto absoluto (90 dias da criação) */
    validaAteEm: timestamp({ withTimezone: true }).notNull(),
    ultimoUsoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: text(),
    agente: text(),
    /** Quando o 2FA desta sessão foi conferido (nulo = ainda não, ou o acesso não usa 2FA) */
    segundoFatorEm: timestamp({ withTimezone: true }),
    revogadaEm: timestamp({ withTimezone: true }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('portal_sessoes_hash_uq').on(t.tokenHash),
    index('portal_sessoes_acesso_idx').on(t.acessoId),
  ],
)

/** 2FA por aplicativo (TOTP) do cliente. O segredo fica cifrado (mesma cifra dos segredos do CRM). */
export const portalSegundoFator = pgTable(
  'portal_segundo_fator',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    segredoCifrado: text().notNull(),
    confirmadoEm: timestamp({ withTimezone: true }),
    /** Hashes dos códigos de recuperação ainda não usados */
    codigosRecuperacao: jsonb()
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...carimbos(),
  },
  (t) => [uniqueIndex('portal_segundo_fator_acesso_uq').on(t.acessoId)],
)

/** O Responsável pede acesso para um colega; a equipe aprova (cria o acesso) ou recusa. */
export const portalPedidosAcesso = pgTable(
  'portal_pedidos_acesso',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    pedidoPor: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    nome: text().notNull(),
    email: citext().notNull(),
    cargo: text(),
    situacao: situacaoPedidoAcesso().notNull().default('pendente'),
    tratadoPor: uuid().references((): AnyPgColumn => membros.id),
    tratadoEm: timestamp({ withTimezone: true }),
    motivo: text(),
    ...carimbos(),
  },
  (t) => [
    index('portal_pedidos_situacao_idx').on(t.tenantId, t.situacao),
    check(
      'portal_pedidos_tratado_chk',
      sql`(${t.situacao} = 'pendente') = (${t.tratadoEm} IS NULL)`,
    ),
  ],
)

/** Nota do cliente ao atendimento, depois de Resolvido (uma por chamado). */
export const chamadoAvaliacoes = pgTable(
  'chamado_avaliacoes',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    chamadoId: uuid()
      .notNull()
      .references(() => chamados.id),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    nota: smallint().notNull(),
    comentario: text(),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('chamado_avaliacoes_chamado_uq').on(t.chamadoId),
    check('chamado_avaliacoes_nota_chk', sql`${t.nota} BETWEEN 1 AND 5`),
  ],
)

/** "Criar tarefa" a partir do chamado: liga o chamado à atividade criada. */
export const chamadoAtividades = pgTable(
  'chamado_atividades',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    chamadoId: uuid()
      .notNull()
      .references(() => chamados.id),
    atividadeId: uuid()
      .notNull()
      .references(() => atividades.id),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('chamado_atividades_uq').on(t.chamadoId, t.atividadeId),
    index('chamado_atividades_chamado_idx').on(t.chamadoId),
  ],
)
