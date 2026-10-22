import { z } from 'zod'

import { nomeDeCadastroSchema } from './cadastros.js'

// Visitas: construtor do relatório, resultados e check-in (G3a; docs/funcionalidades.md, seção 3C,
// e docs/plano_geolocalizacao.md, seção 9).

/** Tipos de campo do relatório de visita. Os quatro últimos são de CRM (aplicam efeitos ao concluir). */
export const TIPOS_DE_CAMPO_DE_VISITA = [
  'texto_curto',
  'texto_longo',
  'numero',
  'data',
  'sim_nao',
  'escolha_unica',
  'multipla_escolha',
  'nota',
  'contato',
  'proximo_passo',
  'tag',
  'dados_empresa',
] as const
export const tipoDeCampoDeVisitaSchema = z.enum(TIPOS_DE_CAMPO_DE_VISITA)
export type TipoDeCampoDeVisita = z.infer<typeof tipoDeCampoDeVisitaSchema>

export const ROTULO_DO_TIPO_DE_CAMPO: Record<TipoDeCampoDeVisita, string> = {
  texto_curto: 'Texto curto',
  texto_longo: 'Texto longo',
  numero: 'Número',
  data: 'Data',
  sim_nao: 'Sim/não',
  escolha_unica: 'Escolha única',
  multipla_escolha: 'Múltipla escolha',
  nota: 'Nota de 1 a 5',
  contato: 'Contato (CRM)',
  proximo_passo: 'Próximo passo (CRM)',
  tag: 'Tag (CRM)',
  dados_empresa: 'Dados da empresa (CRM)',
}

/** Campos da ficha que o "dados da empresa" pode atualizar. Nunca CNPJ nem razão social. */
export const CAMPOS_DA_EMPRESA_NA_VISITA = [
  'nome_fantasia',
  'website',
  'vertical_id',
  'numero_funcionarios',
] as const
export const campoDaEmpresaNaVisitaSchema = z.enum(CAMPOS_DA_EMPRESA_NA_VISITA)
export type CampoDaEmpresaNaVisita = z.infer<typeof campoDaEmpresaNaVisitaSchema>

export const ROTULO_DO_CAMPO_DA_EMPRESA: Record<CampoDaEmpresaNaVisita, string> = {
  nome_fantasia: 'Nome fantasia',
  website: 'Site',
  vertical_id: 'Vertical',
  numero_funcionarios: 'Número de funcionários',
}

/** Tipos que só podem aparecer uma vez por modelo. */
const UNICOS_NO_MODELO: readonly TipoDeCampoDeVisita[] = ['contato', 'proximo_passo']

export const MAX_CAMPOS_DE_VISITA = 50
export const MAX_OPCOES_DO_CAMPO = 30

const rotuloDoCampoSchema = z
  .string()
  .trim()
  .min(1, 'informe o rótulo')
  .max(120, 'use até 120 caracteres')

export const opcaoDoCampoSchema = z
  .object({
    id: z.uuid(),
    rotulo: z.string().trim().min(1, 'informe a opção').max(80, 'use até 80 caracteres'),
  })
  .strict()
  .meta({ id: 'OpcaoDoCampoDeVisita' })

const baseDoCampo = {
  /** Estável: não muda quando o rótulo muda (base dos relatórios por campo) */
  id: z.uuid(),
  rotulo: rotuloDoCampoSchema,
  obrigatorio: z.boolean(),
}

const TIPOS_SIMPLES = [
  'texto_curto',
  'texto_longo',
  'numero',
  'data',
  'sim_nao',
  'nota',
  'contato',
  'proximo_passo',
] as const

/**
 * Um campo do modelo, como fica no jsonb `visita_modelo_versoes.campos` (a ordem é a posição na
 * lista). `opcoes` só nas escolhas; `tagId` só no `tag` (a tag que o "sim" aplica); `campoEmpresa`
 * só no `dados_empresa`.
 */
export const campoDeVisitaSchema = z
  .discriminatedUnion('tipo', [
    z.object({ ...baseDoCampo, tipo: z.enum(TIPOS_SIMPLES) }).strict(),
    z
      .object({
        ...baseDoCampo,
        tipo: z.enum(['escolha_unica', 'multipla_escolha']),
        opcoes: z
          .array(opcaoDoCampoSchema)
          .min(2, 'informe ao menos duas opções')
          .max(MAX_OPCOES_DO_CAMPO, `use até ${MAX_OPCOES_DO_CAMPO} opções`),
      })
      .strict(),
    z.object({ ...baseDoCampo, tipo: z.literal('tag'), tagId: z.uuid() }).strict(),
    z
      .object({
        ...baseDoCampo,
        tipo: z.literal('dados_empresa'),
        campoEmpresa: campoDaEmpresaNaVisitaSchema,
      })
      .strict(),
  ])
  .meta({ id: 'CampoDeVisita' })
export type CampoDeVisita = z.infer<typeof campoDeVisitaSchema>

const repetidos = (valores: string[]) => valores.filter((v, i) => valores.indexOf(v) !== i)

/** A lista de campos de um modelo, com as regras entre campos (ids únicos, CRM sem repetir). */
export const camposDeVisitaSchema = z
  .array(campoDeVisitaSchema)
  .max(MAX_CAMPOS_DE_VISITA, `use até ${MAX_CAMPOS_DE_VISITA} campos`)
  .superRefine((campos, ctx) => {
    if (repetidos(campos.map((c) => c.id)).length > 0) {
      ctx.addIssue({ code: 'custom', message: 'há campos com o mesmo id' })
    }
    for (const [i, c] of campos.entries()) {
      if ('opcoes' in c && repetidos(c.opcoes.map((o) => o.id)).length > 0) {
        ctx.addIssue({ code: 'custom', path: [i, 'opcoes'], message: 'há opções com o mesmo id' })
      }
      if ('opcoes' in c && repetidos(c.opcoes.map((o) => o.rotulo.toLowerCase())).length > 0) {
        ctx.addIssue({ code: 'custom', path: [i, 'opcoes'], message: 'há opções repetidas' })
      }
    }
    for (const tipo of UNICOS_NO_MODELO) {
      if (campos.filter((c) => c.tipo === tipo).length > 1) {
        ctx.addIssue({
          code: 'custom',
          message: `o campo "${ROTULO_DO_TIPO_DE_CAMPO[tipo]}" só pode aparecer uma vez`,
        })
      }
    }
    const daEmpresa = campos.flatMap((c) => (c.tipo === 'dados_empresa' ? [c.campoEmpresa] : []))
    if (repetidos(daEmpresa).length > 0) {
      ctx.addIssue({ code: 'custom', message: 'o mesmo dado da empresa aparece duas vezes' })
    }
    const tags = campos.flatMap((c) => (c.tipo === 'tag' ? [c.tagId] : []))
    if (repetidos(tags).length > 0) {
      ctx.addIssue({ code: 'custom', message: 'a mesma tag aparece em dois campos' })
    }
  })

// ---- Modelos ----

export const versaoDoModeloDeVisitaSchema = z
  .object({
    id: z.uuid(),
    numero: z.number().int(),
    campos: z.array(campoDeVisitaSchema),
    criadoEm: z.string(),
  })
  .meta({ id: 'VersaoDoModeloDeVisita' })
export type VersaoDoModeloDeVisita = z.infer<typeof versaoDoModeloDeVisitaSchema>

export const modeloDeVisitaSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    padrao: z.boolean(),
    ativo: z.boolean(),
    ordem: z.number().int(),
    versaoAtual: versaoDoModeloDeVisitaSchema,
    /** Quantos resultados (não excluídos) usam este modelo */
    resultados: z.number().int(),
    /** Já tem relatório: editar os campos publica uma versão nova */
    emUso: z.boolean(),
  })
  .meta({ id: 'ModeloDeVisita' })
export type ModeloDeVisita = z.infer<typeof modeloDeVisitaSchema>

export const criarModeloDeVisitaSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    campos: camposDeVisitaSchema,
  })
  .strict()
  .meta({ id: 'CriarModeloDeVisitaEntrada' })
export type CriarModeloDeVisitaEntrada = z.infer<typeof criarModeloDeVisitaSchema>

export const alterarModeloDeVisitaSchema = z
  .object({
    nome: nomeDeCadastroSchema.optional(),
    ativo: z.boolean().optional(),
    /** `true` torna este o padrão (o anterior deixa de ser); `false` não é aceito */
    padrao: z.literal(true).optional(),
    campos: camposDeVisitaSchema.optional(),
  })
  .strict()
  .meta({ id: 'AlterarModeloDeVisitaEntrada' })
export type AlterarModeloDeVisitaEntrada = z.infer<typeof alterarModeloDeVisitaSchema>

// ---- Resultados ----

export const chaveDeResultadoDeVisitaSchema = z.enum(['nao_localizada', 'encerrada'])
export type ChaveDeResultadoDeVisita = z.infer<typeof chaveDeResultadoDeVisitaSchema>

export const resultadoDeVisitaSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    chaveSistema: chaveDeResultadoDeVisitaSchema.nullable(),
    modeloId: z.uuid(),
    ativo: z.boolean(),
    ordem: z.number().int(),
  })
  .meta({ id: 'ResultadoDeVisita' })
export type ResultadoDeVisita = z.infer<typeof resultadoDeVisitaSchema>

export const criarResultadoDeVisitaSchema = z
  .object({ nome: nomeDeCadastroSchema, modeloId: z.uuid() })
  .strict()
  .meta({ id: 'CriarResultadoDeVisitaEntrada' })
export type CriarResultadoDeVisitaEntrada = z.infer<typeof criarResultadoDeVisitaSchema>

export const alterarResultadoDeVisitaSchema = z
  .object({
    nome: nomeDeCadastroSchema.optional(),
    modeloId: z.uuid().optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'AlterarResultadoDeVisitaEntrada' })
export type AlterarResultadoDeVisitaEntrada = z.infer<typeof alterarResultadoDeVisitaSchema>

// ---- Check-in ----

export const MODOS_DE_CHECKIN = ['avisar', 'bloquear', 'so_gravar'] as const
export const modoDeCheckinSchema = z.enum(MODOS_DE_CHECKIN)
export type ModoDeCheckin = z.infer<typeof modoDeCheckinSchema>

export const ROTULO_DO_MODO_DE_CHECKIN: Record<ModoDeCheckin, string> = {
  avisar: 'Avisar',
  bloquear: 'Bloquear',
  so_gravar: 'Só gravar',
}

export const LIMITE_DO_CHECKIN_M = { minimo: 10, maximo: 50_000 } as const

/** "HH:MM" de 00:00 a 23:59. */
export const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use o formato HH:MM (ex.: 17:30)')

export const configuracaoDeVisitasSchema = z
  .object({
    checkinModo: modoDeCheckinSchema,
    checkinLimiteM: z
      .number()
      .int('use um número inteiro de metros')
      .min(LIMITE_DO_CHECKIN_M.minimo, `use ao menos ${LIMITE_DO_CHECKIN_M.minimo} m`)
      .max(LIMITE_DO_CHECKIN_M.maximo, `use até ${LIMITE_DO_CHECKIN_M.maximo} m`),
    lembreteRelatoriosHora: horaSchema,
  })
  .strict()
  .meta({ id: 'ConfiguracaoDeVisitas' })
export type ConfiguracaoDeVisitas = z.infer<typeof configuracaoDeVisitasSchema>
