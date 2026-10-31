import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from 'drizzle-orm/pg-core'

import { empresas } from './carteira.js'
import { membros, tenants } from './plataforma.js'
import { portalAcessos } from './portal.js'
import { carimbos, chaveUuid } from './tipos.js'

// Portal do Cliente, Fase 3E: avisos (comunicado curto com push), preferências do cliente e inscrições de push
// (docs/plano_portal_cliente.md, seções 8 e 9). RLS, FORCE e GRANTs ficam na migração.

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

export const urgenciaDoAviso = pgEnum('urgencia_aviso', ['normal', 'urgente'])
export const situacaoDoAviso = pgEnum('situacao_aviso', ['agendado', 'enviado', 'cancelado'])
export const alcanceDoAviso = pgEnum('alcance_aviso', ['todos', 'empresas'])

/** Comunicado curto que chega no celular (push), no sino e por e-mail. Só a equipe lê e escreve. */
export const avisos = pgTable(
  'avisos',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    /** Aparece inteira na notificação */
    mensagem: varchar({ length: 140 }).notNull(),
    /** Uma tela do portal (começa com "/") ou um endereço externo (http ou https) */
    link: text(),
    urgencia: urgenciaDoAviso().notNull().default('normal'),
    alcance: alcanceDoAviso().notNull().default('todos'),
    situacao: situacaoDoAviso().notNull().default('agendado'),
    /** Quando sai (agora, ou o horário agendado) */
    enviarEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    enviadoEm: timestamp({ withTimezone: true }),
    canceladoEm: timestamp({ withTimezone: true }),
    /** Quantas pessoas receberam (gravado ao enviar) */
    destinatarios: integer().notNull().default(0),
    ...autoria(),
  },
  (t) => [
    index('avisos_lista_idx').on(t.tenantId, t.enviarEm),
    index('avisos_a_enviar_idx')
      .on(t.enviarEm)
      .where(sql`${t.situacao} = 'agendado'`),
    check('avisos_mensagem_chk', sql`char_length(btrim(${t.mensagem})) BETWEEN 1 AND 140`),
    check('avisos_link_chk', sql`${t.link} IS NULL OR ${t.link} ~ '^(/[^/\\s]|https?://\\S+)'`),
    check('avisos_enviado_chk', sql`(${t.situacao} = 'enviado') = (${t.enviadoEm} IS NOT NULL)`),
    check(
      'avisos_cancelado_chk',
      sql`(${t.situacao} = 'cancelado') = (${t.canceladoEm} IS NOT NULL)`,
    ),
  ],
)

/** As empresas-clientes da audiência "empresas". */
export const avisoEmpresas = pgTable(
  'aviso_empresas',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    avisoId: uuid()
      .notNull()
      .references(() => avisos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    ...carimbos(),
  },
  (t) => [uniqueIndex('aviso_empresas_uq').on(t.avisoId, t.empresaId)],
)

/** Uma linha por pessoa que recebeu o aviso: o que foi entregue por cada canal e se leu. */
export const avisoEntregas = pgTable(
  'aviso_entregas',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    avisoId: uuid()
      .notNull()
      .references(() => avisos.id),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    /** A notificação do sino (ler a notificação marca o aviso como lido) */
    notificacaoId: uuid(),
    /** Quando o push deve sair (agora, ou o fim do horário de silêncio); nulo = sem push para esta pessoa */
    pushEnviarEm: timestamp({ withTimezone: true }),
    pushEnviadoEm: timestamp({ withTimezone: true }),
    /** Dispositivos que aceitaram o push */
    pushAceitos: smallint().notNull().default(0),
    emailEnfileiradoEm: timestamp({ withTimezone: true }),
    lidoEm: timestamp({ withTimezone: true }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('aviso_entregas_uq').on(t.avisoId, t.acessoId),
    index('aviso_entregas_push_idx')
      .on(t.pushEnviarEm)
      .where(sql`${t.pushEnviarEm} IS NOT NULL AND ${t.pushEnviadoEm} IS NULL`),
    index('aviso_entregas_notificacao_idx')
      .on(t.notificacaoId)
      .where(sql`${t.notificacaoId} IS NOT NULL`),
  ],
)

/** Preferências do cliente: horário de silêncio (do push dos avisos normais) e e-mail por tipo. */
export const portalPreferencias = pgTable(
  'portal_preferencias',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    /** Horário (America/Sao_Paulo) em que o push dos avisos normais fica quieto; o intervalo pode virar a noite */
    silencioInicio: time(),
    silencioFim: time(),
    emailChamados: boolean().notNull().default(true),
    emailEventos: boolean().notNull().default(true),
    emailAvisos: boolean().notNull().default(true),
    /** Tema do portal (Fase 4A): claro, escuro ou sistema; segue a pessoa entre aparelhos */
    tema: varchar({ length: 10 }).notNull().default('sistema'),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('portal_preferencias_acesso_uq').on(t.acessoId),
    check('portal_preferencias_tema_chk', sql`${t.tema} IN ('claro', 'escuro', 'sistema')`),
    check(
      'portal_preferencias_silencio_chk',
      sql`(${t.silencioInicio} IS NULL) = (${t.silencioFim} IS NULL) AND (${t.silencioInicio} IS NULL OR ${t.silencioInicio} <> ${t.silencioFim})`,
    ),
  ],
)

/** Um navegador ou aparelho do cliente que aceitou receber push (Web Push, VAPID). */
export const portalPushInscricoes = pgTable(
  'portal_push_inscricoes',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    endpoint: text().notNull(),
    chaveP256dh: text('chave_p256dh').notNull(),
    chaveAuth: text('chave_auth').notNull(),
    agente: text(),
    ultimoEnvioEm: timestamp({ withTimezone: true }),
    /** Falhas seguidas ao enviar (o serviço de push recusa o endpoint velho com 404 ou 410) */
    falhas: smallint().notNull().default(0),
    revogadaEm: timestamp({ withTimezone: true }),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('portal_push_endpoint_uq').on(t.endpoint),
    index('portal_push_acesso_idx')
      .on(t.acessoId)
      .where(sql`${t.revogadaEm} IS NULL`),
  ],
)
