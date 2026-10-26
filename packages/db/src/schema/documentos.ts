import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
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
import { estadoAnexo } from './chamados.js'
import { membros, tenants } from './plataforma.js'
import { portalAcessos } from './portal.js'
import { carimbos, chaveUuid } from './tipos.js'

// Portal do Cliente, Fase 3C: documentos (docs/plano_portal_cliente.md, seção 7). A equipe publica arquivos para
// todos os clientes ou para algumas empresas; o cliente lista e baixa; cada download fica registrado. O arquivo
// segue o mesmo caminho dos anexos dos chamados (envio direto ao Garage, varredura do ClamAV, só baixa o "limpo").
// As colunas do arquivo têm os mesmos nomes de `chamado_anexos` de propósito: o processador do antivírus é um só.

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

/** Tamanho máximo do arquivo, o mesmo dos anexos (25 MB) */
const TAMANHO_MAXIMO_DO_DOCUMENTO = 25 * 1024 * 1024

export const alcanceDoDocumento = pgEnum('alcance_documento', ['todos', 'empresas'])

/** Arquivo publicado para os clientes. O cliente só o vê com o arquivo "limpo" e `visivel_no_portal`. */
export const documentos = pgTable(
  'documentos',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    titulo: varchar({ length: 160 }).notNull(),
    descricao: text(),
    alcance: alcanceDoDocumento().notNull().default('todos'),
    /** A equipe pode tirar do portal sem excluir (volta quando quiser) */
    visivelNoPortal: boolean().notNull().default(true),
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
    /** Total de downloads pelos clientes, mantido por gatilho */
    totalDownloads: bigint({ mode: 'number' }).notNull().default(0),
    ...autoria(),
  },
  (t) => [
    uniqueIndex('documentos_chave_uq').on(t.chaveArquivo),
    check(
      'documentos_tamanho_chk',
      sql`${t.tamanho} BETWEEN 1 AND ${sql.raw(String(TAMANHO_MAXIMO_DO_DOCUMENTO))}`,
    ),
    check(
      'documentos_infectado_chk',
      sql`${t.estado} <> 'infectado' OR ${t.assinatura} IS NOT NULL`,
    ),
    index('documentos_lista_idx').on(t.tenantId, t.criadoEm),
    index('documentos_pendentes_idx')
      .on(t.criadoEm)
      .where(sql`${t.estado} = 'pendente_varredura' AND ${t.enviadoEm} IS NOT NULL`),
  ],
)

/** As empresas-clientes do alcance "empresas". */
export const documentoEmpresas = pgTable(
  'documento_empresas',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    documentoId: uuid()
      .notNull()
      .references(() => documentos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    ...carimbos(),
  },
  (t) => [
    uniqueIndex('documento_empresas_uq').on(t.documentoId, t.empresaId),
    index('documento_empresas_empresa_idx').on(t.empresaId),
  ],
)

/** Cada download de um cliente (quem, de que empresa e quando). Só a equipe lê o conjunto. */
export const documentoAcessos = pgTable(
  'documento_acessos',
  {
    id: chaveUuid(),
    tenantId: doTenant(),
    documentoId: uuid()
      .notNull()
      .references(() => documentos.id),
    acessoId: uuid()
      .notNull()
      .references(() => portalAcessos.id),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    baixadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...carimbos(),
  },
  (t) => [index('documento_acessos_documento_idx').on(t.documentoId, t.baixadoEm)],
)
