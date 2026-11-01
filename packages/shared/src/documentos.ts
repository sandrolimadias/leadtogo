import { z } from 'zod'

import {
  downloadDeAnexoSchema,
  estadoDeAnexoSchema,
  pedirEnvioDeAnexoSchema,
  TAMANHO_MAXIMO_DO_ANEXO,
} from './chamados.js'
import { TAMANHO_MAXIMO_DE_PAGINA } from './paginacao.js'
import {
  alcanceDaPublicacaoSchema,
  MAXIMO_DE_EMPRESAS_NO_ALCANCE,
  tagDoAlcanceSchema,
  tagIdsDoAlcanceSchema,
  validarAudiencia,
} from './publicacoes.js'

// Portal do cliente, Fase 3C: documentos (docs/plano_portal_cliente.md, seção 7). A equipe publica arquivos para
// todos os clientes ou para algumas empresas; o cliente lista e baixa; cada download fica registrado. O arquivo
// segue o caminho dos anexos dos chamados (envio direto ao armazenamento, antivírus, só baixa o "limpo").

export const TAMANHO_MAXIMO_DO_DOCUMENTO = TAMANHO_MAXIMO_DO_ANEXO
export const TAMANHO_MAXIMO_DO_TITULO_DO_DOCUMENTO = 160
export const TAMANHO_MAXIMO_DA_DESCRICAO_DO_DOCUMENTO = 500

// ---------------------------------------------------------------------------------------- equipe (CRM)

export const arquivoDoDocumentoSchema = z
  .object({
    nome: z.string(),
    mime: z.string(),
    tamanho: z.number().int().nonnegative(),
    /** `pendente_varredura` enquanto o antivírus não respondeu; só `limpo` chega ao cliente */
    estado: estadoDeAnexoSchema,
    /** O arquivo já chegou ao armazenamento (a confirmação do envio) */
    enviado: z.boolean(),
  })
  .meta({ id: 'ArquivoDoDocumento' })
export type ArquivoDoDocumento = z.infer<typeof arquivoDoDocumentoSchema>

export const itemDeDocumentoSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    descricao: z.string().nullable(),
    alcance: alcanceDaPublicacaoSchema,
    visivelNoPortal: z.boolean(),
    arquivo: arquivoDoDocumentoSchema,
    totalDownloads: z.number().int().nonnegative(),
    criadoEm: z.iso.datetime({ offset: true }),
    atualizadoEm: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'ItemDeDocumento' })
export type ItemDeDocumento = z.infer<typeof itemDeDocumentoSchema>

export const documentoSchema = itemDeDocumentoSchema
  .extend({
    empresas: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    tags: z.array(tagDoAlcanceSchema),
  })
  .meta({ id: 'Documento' })
export type Documento = z.infer<typeof documentoSchema>

export const consultaDeDocumentosSchema = z
  .object({
    busca: z.string().trim().max(100).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_DE_PAGINA).default(25),
  })
  .strict()
export type ConsultaDeDocumentos = z.infer<typeof consultaDeDocumentosSchema>

export const listaDeDocumentosSchema = z
  .object({ itens: z.array(itemDeDocumentoSchema), total: z.number().int().nonnegative() })
  .meta({ id: 'ListaDeDocumentos' })
export type ListaDeDocumentos = z.infer<typeof listaDeDocumentosSchema>

const tituloSchema = z
  .string()
  .trim()
  .min(3, 'informe o título')
  .max(
    TAMANHO_MAXIMO_DO_TITULO_DO_DOCUMENTO,
    `no máximo ${TAMANHO_MAXIMO_DO_TITULO_DO_DOCUMENTO} caracteres`,
  )
const descricaoSchema = z
  .string()
  .trim()
  .max(
    TAMANHO_MAXIMO_DA_DESCRICAO_DO_DOCUMENTO,
    `no máximo ${TAMANHO_MAXIMO_DA_DESCRICAO_DO_DOCUMENTO} caracteres`,
  )
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))

const validarAlcance = validarAudiencia

/** Passo 1: o cadastro do documento já reserva o arquivo e devolve a URL de envio. */
export const criarDocumentoSchema = z
  .object({
    titulo: tituloSchema,
    descricao: descricaoSchema,
    alcance: alcanceDaPublicacaoSchema,
    empresaIds: z.array(z.uuid()).max(MAXIMO_DE_EMPRESAS_NO_ALCANCE).default([]),
    tagIds: tagIdsDoAlcanceSchema.default([]),
    arquivo: pedirEnvioDeAnexoSchema,
  })
  .strict()
  .superRefine(validarAlcance)
  .meta({ id: 'CriarDocumentoEntrada' })
export type CriarDocumentoEntrada = z.infer<typeof criarDocumentoSchema>

export const envioDeDocumentoSchema = z
  .object({
    documento: documentoSchema,
    envio: z.object({
      url: z.url(),
      cabecalhos: z.record(z.string(), z.string()),
      expiraEm: z.iso.datetime(),
    }),
  })
  .meta({ id: 'EnvioDeDocumento' })
export type EnvioDeDocumento = z.infer<typeof envioDeDocumentoSchema>

/** Editar os dados do documento (o arquivo não troca: publique um novo documento). */
export const editarDocumentoSchema = z
  .object({
    titulo: tituloSchema.optional(),
    /** Ausente = não muda; vazio ou nulo = apaga */
    descricao: z
      .string()
      .trim()
      .max(
        TAMANHO_MAXIMO_DA_DESCRICAO_DO_DOCUMENTO,
        `no máximo ${TAMANHO_MAXIMO_DA_DESCRICAO_DO_DOCUMENTO} caracteres`,
      )
      .nullable()
      .optional(),
    alcance: alcanceDaPublicacaoSchema.optional(),
    empresaIds: z.array(z.uuid()).max(MAXIMO_DE_EMPRESAS_NO_ALCANCE).optional(),
    tagIds: tagIdsDoAlcanceSchema.optional(),
    visivelNoPortal: z.boolean().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.alcance !== undefined) validarAlcance(d, ctx)
    else if (d.empresaIds !== undefined || d.tagIds !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['alcance'],
        message: 'informe o alcance junto da lista de empresas ou de tags',
      })
    }
  })
  .meta({ id: 'EditarDocumentoEntrada' })
export type EditarDocumentoEntrada = z.infer<typeof editarDocumentoSchema>

export const downloadDoDocumentoSchema = downloadDeAnexoSchema
export type DownloadDoDocumento = z.infer<typeof downloadDoDocumentoSchema>

export const baixaDeDocumentoSchema = z
  .object({
    pessoa: z.string(),
    empresa: z.string(),
    baixadoEm: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'BaixaDeDocumento' })
export type BaixaDeDocumento = z.infer<typeof baixaDeDocumentoSchema>

export const listaDeBaixasSchema = z
  .object({ itens: z.array(baixaDeDocumentoSchema), total: z.number().int().nonnegative() })
  .meta({ id: 'ListaDeBaixasDeDocumento' })
export type ListaDeBaixas = z.infer<typeof listaDeBaixasSchema>

// -------------------------------------------------------------------------------------------- cliente

export const documentoDoPortalSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    descricao: z.string().nullable(),
    nome: z.string(),
    tamanho: z.number().int().nonnegative(),
    publicadoEm: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'DocumentoDoPortal' })
export type DocumentoDoPortal = z.infer<typeof documentoDoPortalSchema>

export const consultaDeDocumentosDoPortalSchema = z
  .object({
    busca: z.string().trim().max(100).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
export type ConsultaDeDocumentosDoPortal = z.infer<typeof consultaDeDocumentosDoPortalSchema>

export const listaDeDocumentosDoPortalSchema = z
  .object({ itens: z.array(documentoDoPortalSchema), total: z.number().int().nonnegative() })
  .meta({ id: 'ListaDeDocumentosDoPortal' })
export type ListaDeDocumentosDoPortal = z.infer<typeof listaDeDocumentosDoPortalSchema>
