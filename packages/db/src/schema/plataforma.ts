import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { municipios } from './referencias.js'
import { user } from './auth.js'
import { arquivos } from './sistema.js'
import { carimbos, chaveUuid, citext } from './tipos.js'

// Plataforma e tenant (docs/modelagem_banco.md, seção 3).
// Políticas de RLS, FORCE e GRANTs ficam na migração (aplicar_rls_tenant).

export const situacaoConta = pgEnum('situacao_conta', ['teste', 'ativa', 'suspensa', 'cancelada'])
export const papelConta = pgEnum('papel_conta', ['dono', 'administrador', 'financeiro'])
/** Alcance de uma permissão da carteira (perfis de acesso): só a própria, a da equipe ou todas. */
export const alcancePermissao = pgEnum('alcance_permissao', ['propria', 'equipe', 'todas'])
export const chavePerfilSistema = pgEnum('chave_perfil_sistema', ['admin', 'gestor', 'vendedor'])
export const situacaoTenant = pgEnum('situacao_tenant', ['teste', 'ativo', 'suspenso', 'cancelado'])
export const papelMembro = pgEnum('papel_membro', ['admin', 'gestor', 'vendedor'])
/** Quem precisa de 2FA para usar a empresa (`tenant_configuracoes.dois_fatores_exigido`) */
/** Check-in da visita (G3): avisar a distância, bloquear além do limite ou só gravar. */
export const modoCheckin = pgEnum('modo_checkin', ['avisar', 'bloquear', 'so_gravar'])
export const politicaDoisFatores = pgEnum('politica_dois_fatores', [
  'admin',
  'admin_gestor',
  'todos',
])
export const modoImportacaoWhatsapp = pgEnum('modo_importacao_whatsapp', [
  'automatico',
  'manual',
  'desligado',
])

/** Conta dona de várias empresas (cobrança e gestão). Sem RLS por tenant: o acesso é da API. */
export const contas = pgTable('contas', {
  id: chaveUuid(),
  nome: text().notNull(),
  documento: varchar({ length: 14 }),
  emailCobranca: citext(),
  plano: text(),
  situacao: situacaoConta().notNull().default('teste'),
  ...carimbos(),
})

export const contaAdministradores = pgTable(
  'conta_administradores',
  {
    contaId: uuid()
      .notNull()
      .references(() => contas.id),
    /** Quem administra a conta; não se apaga um usuário que ainda administra uma conta */
    usuarioId: uuid()
      .notNull()
      .references((): AnyPgColumn => user.id, { onDelete: 'restrict' }),
    papel: papelConta().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contaId, t.usuarioId] })],
)

/** A empresa que usa o sistema. RLS pela coluna `id` (o tenant é a própria linha). */
export const tenants = pgTable(
  'tenants',
  {
    id: chaveUuid(),
    razaoSocial: text().notNull(),
    nomeFantasia: text(),
    /** Alfanumérico (docs/modelagem_banco.md, seção 12). Sem unicidade global: não revela que outra conta existe */
    cnpj: varchar({ length: 14 }),
    email: text(),
    telefone: text(),
    website: text(),
    cep: text(),
    tipoLogradouro: text(),
    logradouro: text(),
    numero: text(),
    complemento: text(),
    bairro: text(),
    municipioCodigo: integer().references(() => municipios.codigoIbge),
    /** Código do país na Receita (105 = Brasil) */
    paisCodigo: smallint().default(105),
    logoArquivoId: uuid().references((): AnyPgColumn => arquivos.id),
    contaId: uuid()
      .notNull()
      .references(() => contas.id),
    situacao: situacaoTenant().notNull().default('teste'),
    plano: text(),
    fusoHorario: text().notNull().default('America/Sao_Paulo'),
    moeda: char({ length: 3 }).notNull().default('BRL'),
    ...carimbos(),
  },
  (t) => [
    index('tenants_conta_idx').on(t.contaId),
    index('tenants_conta_cnpj_idx').on(t.contaId, t.cnpj),
  ],
)

export const tenantConfiguracoes = pgTable('tenant_configuracoes', {
  tenantId: uuid()
    .primaryKey()
    .references(() => tenants.id),
  vendedorVeTodasEmpresas: boolean().notNull().default(false),
  diasSemContatoAlerta: integer().notNull().default(60),
  /** null = a tag de visita não expira */
  diasValidadeTagVisita: integer(),
  statusClienteAoConquistar: boolean().notNull().default(true),
  /** Não cadastra empresa (CNPJ) que não esteja ativa na Receita; o aviso vale só para cadastro novo */
  bloquearEmpresaNaoAtiva: boolean().notNull().default(true),
  rastreioEmailPadrao: boolean().notNull().default(false),
  /** admin (padrão) | admin_gestor | todos: quem é obrigado a ter 2FA ao usar esta empresa */
  doisFatoresExigido: politicaDoisFatores().notNull().default('admin'),
  whatsappModoImportacao: modoImportacaoWhatsapp().notNull().default('desligado'),
  preferencias: jsonb().notNull().default({}),
  /** Fuso da empresa (IANA): "hoje", "atrasada", "dia inteiro" e os dias das atividades valem nele, nunca em UTC */
  fusoHorario: text().notNull().default('America/Sao_Paulo'),
  /** Quando os cadastros padrão (tags, tipos, funil...) foram criados; preenchido, nunca mais se recria */
  padroesCriadosEm: timestamp({ withTimezone: true }),
  /** Quando os papéis na decisão padrão foram criados (Módulo 3); preenchido, nunca mais se recria */
  papeisDecisaoCriadosEm: timestamp({ withTimezone: true }),
  /** Quando o grupo de tags "Cadastro" e as flags do mapa foram criados (G1); preenchido, nunca mais se recria */
  geoPadroesCriadosEm: timestamp({ withTimezone: true }),
  /** Quando os perfis de acesso de sistema foram criados e ligados aos membros; preenchido, nunca mais se recria */
  perfisCriadosEm: timestamp({ withTimezone: true }),
  checkinModo: modoCheckin().notNull().default('avisar'),
  /** Distância máxima do check-in até a posição da empresa, em metros (CHECK na migração 0028) */
  checkinLimiteM: integer().notNull().default(300),
  /** Hora do lembrete dos relatórios de visita pendentes, no fuso da empresa */
  lembreteRelatoriosHora: time({ withTimezone: false }).notNull().default('17:30'),
  /** Quando o modelo padrão e os seis resultados de visita foram criados (G3a); preenchido, nunca mais se recria */
  visitasPadroesCriadosEm: timestamp({ withTimezone: true }),
  /** Versão do catálogo de permissões dos perfis de sistema (nula = 1); a partida da API sincroniza as chaves novas */
  catalogoPerfisVersao: integer(),
  ...carimbos(),
})

/** Equipe / vendedores. O mesmo usuário pode ser membro em várias empresas, com papel próprio em cada. */
export const membros = pgTable(
  'membros',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    /** Login do membro (auth.user); null = vendedor sem acesso ao sistema */
    usuarioId: uuid().references((): AnyPgColumn => user.id, { onDelete: 'set null' }),
    nome: text().notNull(),
    cargo: text(),
    telefone: varchar({ length: 20 }),
    telefoneE164: varchar('telefone_e164', { length: 20 }),
    email: citext(),
    /** Legado até a contração: nenhuma regra nova lê o papel (vale o perfil de acesso) */
    papel: papelMembro().notNull().default('vendedor'),
    /** Perfil de acesso; nulo só até o backfill (contração: NOT NULL) */
    perfilId: uuid().references((): AnyPgColumn => perfisAcesso.id),
    gestorId: uuid().references((): AnyPgColumn => membros.id),
    cor: char({ length: 7 }),
    fotoArquivoId: uuid().references((): AnyPgColumn => arquivos.id),
    ativo: boolean().notNull().default(true),
    /** Tema, menu recolhido, visão do Dashboard, filtro salvo padrão */
    preferencias: jsonb().notNull().default({}),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('membros_tenant_email_uq')
      .on(t.tenantId, t.email)
      .where(sql`${t.excluidoEm} IS NULL AND ${t.email} IS NOT NULL`),
    uniqueIndex('membros_tenant_usuario_uq')
      .on(t.tenantId, t.usuarioId)
      .where(sql`${t.excluidoEm} IS NULL AND ${t.usuarioId} IS NOT NULL`),
    index('membros_tenant_gestor_idx').on(t.tenantId, t.gestorId),
    index('membros_usuario_idx').on(t.usuarioId),
    index('membros_perfil_idx').on(t.tenantId, t.perfilId),
  ],
)

/**
 * Perfil de acesso (docs/funcionalidades.md, "Perfis de acesso"): permissões por módulo e ação, com
 * alcance. Admin, Gestor e Vendedor são de sistema (`chave_sistema`), editáveis e nunca excluídos.
 */
export const perfisAcesso = pgTable(
  'perfis_acesso',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    nome: text().notNull(),
    descricao: text(),
    sistema: boolean().notNull().default(false),
    chaveSistema: chavePerfilSistema(),
    /** Quem tem este perfil precisa de 2FA nesta empresa */
    exige2fa: boolean('exige_2fa').notNull().default(false),
    ativo: boolean().notNull().default(true),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('perfis_acesso_nome_uq')
      .on(t.tenantId, sql`lower(${t.nome})`)
      .where(sql`${t.excluidoEm} IS NULL`),
    uniqueIndex('perfis_acesso_sistema_uq')
      .on(t.tenantId, t.chaveSistema)
      .where(sql`${t.chaveSistema} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
  ],
)

/** Permissão concedida a um perfil (chave do catálogo em packages/shared/src/permissoes.ts). */
export const perfilPermissoes = pgTable(
  'perfil_permissoes',
  {
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    perfilId: uuid()
      .notNull()
      .references(() => perfisAcesso.id),
    permissao: text().notNull(),
    /** Nulo = a permissão não admite alcance */
    alcance: alcancePermissao(),
    ...carimbos(),
  },
  (t) => [
    primaryKey({ columns: [t.perfilId, t.permissao] }),
    index('perfil_permissoes_tenant_idx').on(t.tenantId, t.perfilId),
  ],
)

/**
 * Convite de membro (docs/modelagem_banco.md, seção 3.5). Só o HASH do token é guardado: o token em
 * si vai por e-mail e nunca é gravado. Uso único; no máximo um convite pendente por (empresa, e-mail).
 */
export const convites = pgTable(
  'convites',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    email: citext().notNull(),
    /** Legado até a contração (perfis da empresa gravam `vendedor`) */
    papel: papelMembro().notNull(),
    /** Perfil de acesso que o convidado terá; nulo só até o backfill */
    perfilId: uuid().references((): AnyPgColumn => perfisAcesso.id),
    tokenHash: text().notNull().unique('convites_token_hash_key'),
    expiraEm: timestamp({ withTimezone: true }).notNull(),
    aceitoEm: timestamp({ withTimezone: true }),
    /** Cancelado por um administrador antes de ser aceito */
    revogadoEm: timestamp({ withTimezone: true }),
    convidadoPor: uuid()
      .notNull()
      .references((): AnyPgColumn => membros.id),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('convites_pendente_uq')
      .on(t.tenantId, t.email)
      .where(sql`${t.aceitoEm} IS NULL AND ${t.revogadoEm} IS NULL`),
    index('convites_tenant_idx').on(t.tenantId, t.criadoEm),
  ],
)
