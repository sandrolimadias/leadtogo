import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { empresas } from './carteira.js'
import { contatos } from './contatos.js'
import { membros, perfisAcesso, tenants } from './plataforma.js'
import { carimbos, chaveUuid } from './tipos.js'

// Central de chamados (Fase 2 do portal do cliente; docs/modelagem_banco.md, seção "Chamados").
// RLS, FORCE e GRANTs ficam na migração (aplicar_rls_tenant). O portal do cliente (fase seguinte)
// usa as mesmas tabelas: a conversa visível ao cliente e as notas internas ficam em tabelas separadas
// de propósito, para que nenhuma consulta do portal alcance uma nota por engano.

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

export const statusChamado = pgEnum('status_chamado', [
  'aguardando_triagem',
  'pendente',
  'em_atendimento',
  'aguardando_cliente',
  'resolvido',
  'fechado',
])
export const prioridadeChamado = pgEnum('prioridade_chamado', [
  'baixa',
  'normal',
  'alta',
  'urgente',
])
/** Quem abriu: a equipe (interno) ou o cliente pelo portal */
export const origemChamado = pgEnum('origem_chamado', ['interna', 'portal'])
export const autorDoChamado = pgEnum('autor_do_chamado', ['membro', 'contato'])
export const atorDoEvento = pgEnum('ator_do_evento', ['membro', 'contato', 'sistema'])
export const tipoEventoChamado = pgEnum('tipo_evento_chamado', [
  'aberto',
  'triado',
  'atribuido',
  'assumido',
  'status_alterado',
  'prioridade_alterada',
  'area_alterada',
  'primeira_resposta',
  'mensagem',
  'nota_interna',
  'anexo',
  'resolvido',
  'reaberto',
  'fechado',
])
export const estadoAnexo = pgEnum('estado_anexo', ['pendente_varredura', 'limpo', 'infectado'])

/** Área de atendimento (Jurídico, Financeiro...). Metas vazias = sem meta e sem alerta de prazo. */
export const areasAtendimento = pgTable(
  'areas_atendimento',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    nome: text().notNull(),
    descricao: text(),
    /** O cliente enxerga esta área ao abrir um chamado pelo portal (fase seguinte) */
    visivelNoPortal: boolean().notNull().default(false),
    /** Meta de primeira resposta, em minutos úteis (nulo = sem meta) */
    metaRespostaMin: integer(),
    /** Meta de resolução, em minutos úteis (nulo = sem meta) */
    metaResolucaoMin: integer(),
    /** Com a triagem ligada, esta área recebe o chamado direto, sem passar pela triagem */
    pulaTriagem: boolean().notNull().default(false),
    ativa: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    /** Áreas criadas por padrão (juridico, financeiro, comercial, administrativo) */
    chaveSistema: text(),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('areas_atendimento_nome_uq')
      .on(t.tenantId, sql`lower(${t.nome})`)
      .where(sql`${t.excluidoEm} IS NULL`),
    uniqueIndex('areas_atendimento_chave_uq')
      .on(t.tenantId, t.chaveSistema)
      .where(sql`${t.chaveSistema} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
    check(
      'areas_atendimento_metas_chk',
      sql`(${t.metaRespostaMin} IS NULL OR ${t.metaRespostaMin} > 0) AND (${t.metaResolucaoMin} IS NULL OR ${t.metaResolucaoMin} > 0)`,
    ),
  ],
)

/**
 * Quem atende a área: um membro OU um perfil de acesso inteiro. `gestor` marca o gestor da área (só
 * membro), que pode atribuir os chamados dela.
 */
export const areaMembros = pgTable(
  'area_membros',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    areaId: uuid()
      .notNull()
      .references(() => areasAtendimento.id),
    membroId: uuid().references(() => membros.id),
    perfilId: uuid().references(() => perfisAcesso.id),
    gestor: boolean().notNull().default(false),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
  },
  (t) => [
    check('area_membros_alvo_chk', sql`num_nonnulls(${t.membroId}, ${t.perfilId}) = 1`),
    check('area_membros_gestor_chk', sql`NOT ${t.gestor} OR ${t.membroId} IS NOT NULL`),
    uniqueIndex('area_membros_membro_uq')
      .on(t.areaId, t.membroId)
      .where(sql`${t.membroId} IS NOT NULL`),
    uniqueIndex('area_membros_perfil_uq')
      .on(t.areaId, t.perfilId)
      .where(sql`${t.perfilId} IS NOT NULL`),
    index('area_membros_membro_idx').on(t.tenantId, t.membroId),
  ],
)

/** Triagem da empresa (uma linha por empresa). Começa desligada. */
export const configTriagem = pgTable(
  'config_triagem',
  {
    tenantId: doTenant().primaryKey(),
    ativa: boolean().notNull().default(false),
    /** Perfil de acesso cujos membros triam (além das pessoas de `triagem_membros`) */
    perfilId: uuid().references(() => perfisAcesso.id),
    ...carimbos(),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  },
  (t) => [index('config_triagem_perfil_idx').on(t.tenantId, t.perfilId)],
)

/** Pessoas designadas para a triagem. */
export const triagemMembros = pgTable(
  'triagem_membros',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    membroId: uuid()
      .notNull()
      .references(() => membros.id),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
  },
  (t) => [uniqueIndex('triagem_membros_uq').on(t.tenantId, t.membroId)],
)

/**
 * Chamado. Solicitante: um membro (origem `interna`) ou um contato do cliente (origem `portal`).
 * Sem área (`area_id` nulo) só no estado `aguardando_triagem`.
 */
export const chamados = pgTable(
  'chamados',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    /** Sequencial por empresa (CH-0001), pelo contador em `tenant_configuracoes` */
    numero: integer().notNull(),
    assunto: text().notNull(),
    descricao: text(),
    areaId: uuid().references(() => areasAtendimento.id),
    status: statusChamado().notNull().default('pendente'),
    prioridade: prioridadeChamado().notNull().default('normal'),
    responsavelId: uuid().references(() => membros.id),
    origem: origemChamado().notNull().default('interna'),
    solicitanteMembroId: uuid().references(() => membros.id),
    contatoId: uuid().references(() => contatos.id),
    empresaClienteId: uuid().references(() => empresas.id),
    /** Quando a equipe respondeu pela primeira vez (base da métrica de primeira resposta) */
    primeiraRespostaEm: timestamp({ withTimezone: true }),
    resolvidoEm: timestamp({ withTimezone: true }),
    fechadoEm: timestamp({ withTimezone: true }),
    /** Quantas vezes foi reaberto (até 7 dias depois de resolvido) */
    reaberturas: smallint().notNull().default(0),
    /** Última mudança de estado: o prazo de reabertura e o tempo parado partem daqui */
    statusAlteradoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('chamados_numero_uq').on(t.tenantId, t.numero),
    check(
      'chamados_origem_chk',
      sql`(${t.origem} = 'interna' AND ${t.solicitanteMembroId} IS NOT NULL AND ${t.contatoId} IS NULL)
        OR (${t.origem} = 'portal' AND ${t.contatoId} IS NOT NULL AND ${t.solicitanteMembroId} IS NULL)`,
    ),
    check('chamados_area_chk', sql`${t.areaId} IS NOT NULL OR ${t.status} = 'aguardando_triagem'`),
    check(
      'chamados_fechamento_chk',
      sql`(${t.status} <> 'fechado' OR ${t.fechadoEm} IS NOT NULL)
        AND (${t.status} NOT IN ('resolvido', 'fechado') OR ${t.resolvidoEm} IS NOT NULL)`,
    ),
    index('chamados_status_idx').on(t.tenantId, t.status, t.criadoEm),
    index('chamados_area_idx').on(t.tenantId, t.areaId, t.status),
    index('chamados_responsavel_idx').on(t.tenantId, t.responsavelId, t.status),
    index('chamados_solicitante_idx').on(t.tenantId, t.solicitanteMembroId),
    index('chamados_contato_idx').on(t.tenantId, t.contatoId),
    index('chamados_empresa_idx').on(t.tenantId, t.empresaClienteId),
  ],
)

/** Conversa visível ao cliente. Nota interna NUNCA entra aqui. */
export const chamadoMensagens = pgTable(
  'chamado_mensagens',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    chamadoId: uuid()
      .notNull()
      .references(() => chamados.id),
    autorTipo: autorDoChamado().notNull(),
    autorMembroId: uuid().references(() => membros.id),
    autorContatoId: uuid().references(() => contatos.id),
    corpo: text().notNull(),
    ...autoria(),
  },
  (t) => [
    check(
      'chamado_mensagens_autor_chk',
      sql`(${t.autorTipo} = 'membro' AND ${t.autorMembroId} IS NOT NULL AND ${t.autorContatoId} IS NULL)
        OR (${t.autorTipo} = 'contato' AND ${t.autorContatoId} IS NOT NULL AND ${t.autorMembroId} IS NULL)`,
    ),
    index('chamado_mensagens_chamado_idx').on(t.chamadoId, t.criadoEm),
  ],
)

/** Notas internas da equipe: tabela própria, de propósito (o portal nunca lê esta tabela). */
export const chamadoNotasInternas = pgTable(
  'chamado_notas_internas',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    chamadoId: uuid()
      .notNull()
      .references(() => chamados.id),
    autorMembroId: uuid()
      .notNull()
      .references(() => membros.id),
    corpo: text().notNull(),
    ...autoria(),
  },
  (t) => [index('chamado_notas_internas_chamado_idx').on(t.chamadoId, t.criadoEm)],
)

/**
 * Linha do tempo do chamado e base única das métricas (primeira resposta, resolução, tempo em
 * aberto e prazo). Só se acrescenta: o app não altera nem apaga eventos.
 */
export const chamadoEventos = pgTable(
  'chamado_eventos',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    chamadoId: uuid()
      .notNull()
      .references(() => chamados.id),
    tipo: tipoEventoChamado().notNull(),
    atorTipo: atorDoEvento().notNull().default('membro'),
    atorMembroId: uuid().references(() => membros.id),
    atorContatoId: uuid().references(() => contatos.id),
    statusDe: statusChamado(),
    statusPara: statusChamado(),
    areaDeId: uuid().references(() => areasAtendimento.id),
    areaParaId: uuid().references(() => areasAtendimento.id),
    responsavelDeId: uuid().references(() => membros.id),
    responsavelParaId: uuid().references(() => membros.id),
    prioridadeDe: prioridadeChamado(),
    prioridadePara: prioridadeChamado(),
    dados: jsonb().notNull().default({}),
    em: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chamado_eventos_chamado_idx').on(t.chamadoId, t.em),
    index('chamado_eventos_tipo_idx').on(t.tenantId, t.tipo, t.em),
    check(
      'chamado_eventos_ator_chk',
      sql`(${t.atorTipo} = 'membro' AND ${t.atorMembroId} IS NOT NULL AND ${t.atorContatoId} IS NULL)
        OR (${t.atorTipo} = 'contato' AND ${t.atorContatoId} IS NOT NULL AND ${t.atorMembroId} IS NULL)
        OR (${t.atorTipo} = 'sistema' AND ${t.atorMembroId} IS NULL AND ${t.atorContatoId} IS NULL)`,
    ),
  ],
)

/** Limite por arquivo (25 MB), conferido também na API e na URL pré-assinada. */
export const TAMANHO_MAXIMO_ANEXO = 25 * 1024 * 1024

/**
 * Anexo de um chamado. O arquivo vai direto ao Garage por URL pré-assinada e só pode ser baixado
 * depois da varredura do ClamAV (`limpo`). `infectado` fica bloqueado para sempre.
 */
export const chamadoAnexos = pgTable(
  'chamado_anexos',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    chamadoId: uuid()
      .notNull()
      .references(() => chamados.id),
    /** Nulo até o anexo ser enviado junto de uma mensagem (até 5 por mensagem) */
    mensagemId: uuid().references(() => chamadoMensagens.id),
    chaveArquivo: text().notNull(),
    nome: text().notNull(),
    mime: text().notNull(),
    tamanho: bigint({ mode: 'number' }).notNull(),
    estado: estadoAnexo().notNull().default('pendente_varredura'),
    /** O arquivo chegou ao Garage (a confirmação do envio) */
    enviadoEm: timestamp({ withTimezone: true }),
    varridoEm: timestamp({ withTimezone: true }),
    /** Nome da assinatura que o ClamAV encontrou (só em `infectado`) */
    assinatura: text(),
    tentativasVarredura: smallint().notNull().default(0),
    ultimoErro: text(),
    enviadoPorMembroId: uuid().references(() => membros.id),
    enviadoPorContatoId: uuid().references(() => contatos.id),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('chamado_anexos_chave_uq').on(t.chaveArquivo),
    check(
      'chamado_anexos_tamanho_chk',
      sql`${t.tamanho} BETWEEN 1 AND ${sql.raw(String(TAMANHO_MAXIMO_ANEXO))}`,
    ),
    check(
      'chamado_anexos_infectado_chk',
      sql`${t.estado} <> 'infectado' OR ${t.assinatura} IS NOT NULL`,
    ),
    index('chamado_anexos_chamado_idx').on(t.chamadoId),
    index('chamado_anexos_mensagem_idx').on(t.mensagemId),
    index('chamado_anexos_pendentes_idx')
      .on(t.criadoEm)
      .where(sql`${t.estado} = 'pendente_varredura' AND ${t.enviadoEm} IS NOT NULL`),
  ],
)

/**
 * Expediente da empresa: faixas de horário por dia da semana (0 = domingo ... 6 = sábado, no fuso da
 * empresa). Um dia pode ter várias faixas (ex.: 8h–12h e 13h–18h). Padrão: segunda a sexta, 8h–18h.
 */
export const calendarioExpediente = pgTable(
  'calendario_expediente',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    diaSemana: smallint().notNull(),
    inicio: time({ withTimezone: false }).notNull(),
    fim: time({ withTimezone: false }).notNull(),
    ...carimbos(),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
  },
  (t) => [
    check('calendario_expediente_dia_chk', sql`${t.diaSemana} BETWEEN 0 AND 6`),
    check('calendario_expediente_faixa_chk', sql`${t.fim} > ${t.inicio}`),
    uniqueIndex('calendario_expediente_uq').on(t.tenantId, t.diaSemana, t.inicio),
  ],
)

/**
 * Feriados (sem expediente). `recorrente` vale todo ano no mesmo dia e mês; a data guarda o ano de
 * referência. Os nacionais de data fixa vêm por padrão; os móveis (Carnaval, Sexta-feira Santa,
 * Corpus Christi) são gerados pela API por ano.
 */
export const feriados = pgTable(
  'feriados',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    data: date().notNull(),
    nome: text().notNull(),
    recorrente: boolean().notNull().default(false),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('feriados_data_uq')
      .on(t.tenantId, t.data)
      .where(sql`${t.excluidoEm} IS NULL`),
  ],
)
