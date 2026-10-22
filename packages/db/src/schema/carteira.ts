import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  char,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { tags, verticais } from './cadastros.js'
import { membros, tenants } from './plataforma.js'
import { cnaes, municipios, paises, portes, qualificacoesSocio } from './referencias.js'
import {
  carimbos,
  chaveUuid,
  geoAproximacao,
  geoOrigem,
  geoPrecisao,
  geografiaPonto,
} from './tipos.js'

// Carteira de empresas (docs/modelagem_banco.md, seção 6): Módulo 2 do MVP.
// RLS, FORCE, GRANTs e os índices trigram (com unaccent) ficam na migração.

export const tipoDocumento = pgEnum('tipo_documento', ['cnpj', 'cpf', 'nenhum'])
export const matrizFilial = pgEnum('matriz_filial', ['matriz', 'filial'])
export const regimeTributario = pgEnum('regime_tributario', [
  'mei',
  'simples_nacional',
  'lucro_presumido',
  'lucro_real',
  'imune_isenta',
  'nao_informado',
])
export const origemCadastro = pgEnum('origem_cadastro', [
  'manual',
  'receita',
  'importacao',
  'prospeccao',
  'whatsapp',
  'api',
])
export const tipoTelefone = pgEnum('tipo_telefone', ['fixo', 'celular', 'whatsapp', 'outro'])
export const origemTelefone = pgEnum('origem_telefone', ['manual', 'receita', 'importacao'])
export const origemSocio = pgEnum('origem_socio', ['receita', 'manual'])
export const acaoDeTag = pgEnum('acao_de_tag', ['adicionada', 'removida'])

/** A empresa da carteira (cliente, prospect ou lead). Não confundir com `tenants`, a empresa que usa o sistema. */
export const empresas = pgTable(
  'empresas',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    tipoDocumento: tipoDocumento().notNull().default('nenhum'),
    /** CNPJ (alfanumérico) ou CPF, só os caracteres, sem máscara; nulo quando não há documento */
    documento: varchar({ length: 14 }),
    /** 8 primeiros caracteres do CNPJ: liga matriz e filiais (gerada) */
    cnpjRaiz: varchar({ length: 8 }).generatedAlwaysAs(
      sql`CASE WHEN tipo_documento = 'cnpj' THEN left(documento, 8) END`,
    ),
    matrizFilial: matrizFilial(),
    matrizId: uuid().references((): AnyPgColumn => empresas.id),
    razaoSocial: text().notNull(),
    /** Nome de exibição; se vazio, vale a razão social */
    nomeFantasia: text(),
    mei: boolean().notNull().default(false),
    dataInicioAtividades: date({ mode: 'string' }),
    porteCodigo: smallint().references(() => portes.codigo),
    regimeTributario: regimeTributario().notNull().default('nao_informado'),
    vendedorId: uuid()
      .notNull()
      .references(() => membros.id),
    verticalId: uuid().references(() => verticais.id),
    website: text(),
    /** Número exato de funcionários (opcional; G3a, campo "dados da empresa" do relatório de visita) */
    numeroFuncionarios: integer(),
    cep: char({ length: 8 }),
    tipoLogradouro: text(),
    logradouro: text(),
    numero: text(),
    complemento: text(),
    bairro: text(),
    municipioCodigo: integer().references(() => municipios.codigoIbge),
    /** Nulo = Brasil; preenchido só para estabelecimento no exterior (código de país da Receita) */
    paisCodigo: smallint().references(() => paises.codigo),
    /** Posição geográfica do endereço (G1); nula = sem coordenada */
    localizacao: geografiaPonto(),
    geoPrecisao: geoPrecisao(),
    /** Tipo da aproximação (interpolada, rua, cep_cidade); nulo quando a posição é exata */
    geoAproximacao: geoAproximacao(),
    geoOrigem: geoOrigem(),
    /** Texto normalizado que foi consultado ao geocodificar */
    geoEnderecoConsultado: text(),
    /** O usuário moveu o pin: preservado até ele confirmar a troca */
    geoAjusteManual: boolean().notNull().default(false),
    geoAtualizadoEm: timestamp({ withTimezone: true }),
    observacoes: text(),
    /** Lote de importação que criou a empresa (FK só no SQL da migração; ver importacao.ts) */
    importacaoId: uuid(),
    origemCadastro: origemCadastro().notNull().default('manual'),
    /** Última sincronização com a Receita */
    receitaAtualizadoEm: timestamp({ withTimezone: true }),
    /** Salva sem poder consultar a Receita (as duas fontes fora do ar): o worker reconsulta depois */
    situacaoNaoVerificada: boolean().notNull().default(false),
    // Calculados pelas atividades (Módulo 5); a FK de `proxima_atividade_id` está só no SQL da migração 0023 (importar `atividades` aqui faria um ciclo)
    ultimaVisitaEm: timestamp({ withTimezone: true }),
    ultimoContatoEm: timestamp({ withTimezone: true }),
    proximaAtividadeId: uuid(),
    proximaAtividadeEm: timestamp({ withTimezone: true }),
    ...carimbos(),
    criadoPor: uuid().references((): AnyPgColumn => membros.id),
    atualizadoPor: uuid().references((): AnyPgColumn => membros.id),
    excluidoEm: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('empresas_documento_uq')
      .on(t.tenantId, t.documento)
      .where(sql`${t.documento} IS NOT NULL AND ${t.excluidoEm} IS NULL`),
    index('empresas_vendedor_idx').on(t.tenantId, t.vendedorId),
    index('empresas_municipio_idx').on(t.tenantId, t.municipioCodigo),
    index('empresas_localizacao_idx').using('gist', t.localizacao),
    index('empresas_vertical_idx').on(t.tenantId, t.verticalId),
    index('empresas_raiz_idx').on(t.tenantId, t.cnpjRaiz),
    index('empresas_importacao_idx').on(t.tenantId, t.importacaoId),
    index('empresas_ultima_visita_idx').on(t.tenantId, t.ultimaVisitaEm),
    index('empresas_ultimo_contato_idx').on(t.tenantId, t.ultimoContatoEm),
  ],
)

export const empresaTelefones = pgTable(
  'empresa_telefones',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    /** Como foi digitado ou recebido */
    numero: varchar({ length: 20 }).notNull(),
    /** "+552730643021": busca, WhatsApp e duplicados */
    numeroE164: varchar('numero_e164', { length: 16 }).notNull(),
    tipo: tipoTelefone().notNull().default('outro'),
    descricao: text(),
    principal: boolean().notNull().default(false),
    origem: origemTelefone().notNull().default('manual'),
    ...carimbos(),
  },
  (t) => [
    index('empresa_telefones_empresa_idx').on(t.tenantId, t.empresaId),
    index('empresa_telefones_e164_idx').on(t.tenantId, t.numeroE164),
  ],
)

export const empresaCnaes = pgTable(
  'empresa_cnaes',
  {
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    cnaeCodigo: integer()
      .notNull()
      .references(() => cnaes.codigo),
    principal: boolean().notNull().default(false),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.empresaId, t.cnaeCodigo] }),
    // Um CNAE principal por empresa
    uniqueIndex('empresa_cnaes_principal_uq')
      .on(t.empresaId)
      .where(sql`${t.principal}`),
    index('empresa_cnaes_cnae_idx').on(t.tenantId, t.cnaeCodigo),
  ],
)

/** Sócios (sem CPF: o CPF mascarado da Receita não é gravado, LGPD). */
export const empresaSocios = pgTable(
  'empresa_socios',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    nome: text().notNull(),
    qualificacaoCodigo: smallint().references(() => qualificacoesSocio.codigo),
    /** A qualificação como veio da Receita, para o código que ainda não está na tabela */
    qualificacaoTexto: text(),
    origem: origemSocio().notNull().default('receita'),
    /** Preenchido quando o sócio é convertido em contato (o "Atualizar pela Receita" não o apaga) */
    // A FK para `contatos` está na migração 0019 (importar `contatos` aqui faria um ciclo com `contatos.ts`)
    contatoId: uuid(),
    ...carimbos(),
  },
  (t) => [
    index('empresa_socios_empresa_idx').on(t.tenantId, t.empresaId),
    index('empresa_socios_contato_idx').on(t.tenantId, t.contatoId),
  ],
)

export const empresaTags = pgTable(
  'empresa_tags',
  {
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    tagId: uuid()
      .notNull()
      .references(() => tags.id),
    /** Aplicada por regra (ex.: Visitada), não pelo usuário */
    automatica: boolean().notNull().default(false),
    aplicadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    aplicadaPor: uuid().references(() => membros.id),
  },
  (t) => [
    primaryKey({ columns: [t.empresaId, t.tagId] }),
    index('empresa_tags_tag_idx').on(t.tenantId, t.tagId),
  ],
)

/** Cada tag adicionada ou removida de uma empresa: base de "quantos Leads viraram Clientes e quando". */
export const empresaTagsHistorico = pgTable(
  'empresa_tags_historico',
  {
    id: chaveUuid(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    tagId: uuid()
      .notNull()
      .references(() => tags.id),
    acao: acaoDeTag().notNull(),
    em: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Null: o sistema */
    por: uuid().references(() => membros.id),
    automatica: boolean().notNull().default(false),
  },
  (t) => [
    index('empresa_tags_historico_empresa_idx').on(t.tenantId, t.empresaId, t.em),
    index('empresa_tags_historico_tag_idx').on(t.tenantId, t.tagId),
  ],
)
