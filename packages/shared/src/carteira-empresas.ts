import { z } from 'zod'

import { cnpjValido, normalizarCnpj } from './cnpj.js'
import { cpfValido, normalizarCpf } from './cpf.js'
import { regimeTributarioSchema } from './receita.js'

// Empresa da carteira (cliente, prospect ou lead): schemas de entrada e saída de /v1/carteira/empresas.
// Não confundir com `empresas.ts`, que trata das empresas do grupo (os tenants).

export const tipoDocumentoSchema = z.enum(['cnpj', 'cpf', 'nenhum'])
export type TipoDocumento = z.infer<typeof tipoDocumentoSchema>

export const origemCadastroSchema = z.enum([
  'manual',
  'receita',
  'importacao',
  'prospeccao',
  'whatsapp',
  'api',
])
export type OrigemCadastro = z.infer<typeof origemCadastroSchema>

export const tipoTelefoneSchema = z.enum(['fixo', 'celular', 'whatsapp', 'outro'])

/** Texto opcional: vazio vira `null` (limpa o campo); ausente fica `undefined` (não mexe). */
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()

/** Códigos CNAE têm 7 dígitos (sem os zeros à esquerda, de 100000 a 9999999). */
const codigoCnae = z.number().int().min(100000).max(9999999)

export const MAX_TELEFONES_DA_EMPRESA = 10
export const MAX_CNAES_DA_EMPRESA = 100

export const telefoneEntradaSchema = z
  .object({
    /** Como foi digitado; a API normaliza para E.164 e recusa o que não for um número */
    numero: z.string().trim().min(1, 'informe o telefone').max(30),
    tipo: tipoTelefoneSchema.optional(),
    descricao: texto(100),
    principal: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'TelefoneDaEmpresaEntrada' })
export type TelefoneEntrada = z.infer<typeof telefoneEntradaSchema>

export const enderecoEntradaSchema = z
  .object({
    cep: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ''))
      .refine((v) => v === '' || v.length === 8, 'CEP deve ter 8 dígitos')
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    tipoLogradouro: texto(50),
    logradouro: texto(200),
    numero: texto(30),
    complemento: texto(200),
    bairro: texto(100),
    /** Código IBGE do município */
    municipioCodigo: z.number().int().positive().nullable().optional(),
    /** Só para estabelecimento no exterior (código de país da Receita); nulo = Brasil */
    paisCodigo: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .meta({ id: 'EnderecoDaEmpresaEntrada' })
export type EnderecoEntrada = z.infer<typeof enderecoEntradaSchema>

export const cnaesEntradaSchema = z
  .object({
    principal: codigoCnae.nullable(),
    secundarios: z.array(codigoCnae).max(MAX_CNAES_DA_EMPRESA),
  })
  .strict()
  .meta({ id: 'CnaesDaEmpresaEntrada' })
export type CnaesEntrada = z.infer<typeof cnaesEntradaSchema>

/** Campos que se editam depois do cadastro (o documento não muda). */
const camposEditaveis = {
  razaoSocial: z.string().trim().min(2, 'informe o nome da empresa').max(200),
  nomeFantasia: texto(200),
  mei: z.boolean().optional(),
  dataInicioAtividades: z.iso.date().nullable().optional(),
  porteCodigo: z.number().int().min(0).nullable().optional(),
  regimeTributario: regimeTributarioSchema.optional(),
  /** Quem cuida da carteira. Só gestor e admin escolhem outra pessoa; o vendedor fica sempre com ele mesmo */
  vendedorId: z.uuid().optional(),
  verticalId: z.uuid().nullable().optional(),
  website: texto(200),
  observacoes: texto(5000),
  /** Se vier, substitui todo o endereço */
  endereco: enderecoEntradaSchema.optional(),
  /** Se vier, substitui todos os telefones (o primeiro vira o principal se nenhum for marcado) */
  telefones: z.array(telefoneEntradaSchema).max(MAX_TELEFONES_DA_EMPRESA).optional(),
  /** Se vier, substitui todos os CNAEs */
  cnaes: cnaesEntradaSchema.optional(),
}

/**
 * POST /v1/carteira/empresas. `documento`: CNPJ (numérico ou alfanumérico) ou CPF, com ou sem máscara;
 * ausente quando `tipoDocumento` é `nenhum`. Para CNPJ a API consulta a Receita por conta própria
 * (situação, sócios e descrição dos CNAEs): o que o cliente manda nos demais campos é o que vale.
 */
export const criarEmpresaCarteiraSchema = z
  .object({
    tipoDocumento: tipoDocumentoSchema,
    documento: z.string().trim().max(30).optional(),
    ...camposEditaveis,
    /** Tag do grupo Status; sem ela, vale Lead */
    statusTagId: z.uuid().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const informado = v.documento !== undefined && v.documento !== ''
    if (v.tipoDocumento === 'nenhum') {
      if (informado) ctx.addIssue({ code: 'custom', path: ['documento'], message: 'sem documento' })
    } else if (!informado) {
      ctx.addIssue({ code: 'custom', path: ['documento'], message: 'informe o documento' })
    } else if (v.tipoDocumento === 'cnpj' && !cnpjValido(v.documento ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['documento'], message: 'CNPJ inválido' })
    } else if (v.tipoDocumento === 'cpf' && !cpfValido(v.documento ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['documento'], message: 'CPF inválido' })
    }
  })
  .transform((v) => ({
    ...v,
    documento:
      v.tipoDocumento === 'cnpj'
        ? normalizarCnpj(v.documento ?? '')
        : v.tipoDocumento === 'cpf'
          ? normalizarCpf(v.documento ?? '')
          : undefined,
  }))
  .meta({ id: 'CriarEmpresaDaCarteiraEntrada' })
export type CriarEmpresaCarteiraEntrada = z.input<typeof criarEmpresaCarteiraSchema>
export type CriarEmpresaCarteira = z.output<typeof criarEmpresaCarteiraSchema>

/** PATCH /v1/carteira/empresas/{id}: só o que vier muda. O documento e o Status não se alteram aqui. */
export const alterarEmpresaCarteiraSchema = z
  .object(camposEditaveis)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarEmpresaDaCarteiraEntrada' })
export type AlterarEmpresaCarteiraEntrada = z.input<typeof alterarEmpresaCarteiraSchema>
export type AlterarEmpresaCarteira = z.output<typeof alterarEmpresaCarteiraSchema>

// ---- saída ----

const pessoaSchema = z.object({ id: z.uuid(), nome: z.string() })

export const telefoneDaEmpresaSchema = z.object({
  id: z.uuid(),
  numero: z.string(),
  e164: z.string(),
  tipo: tipoTelefoneSchema,
  descricao: z.string().nullable(),
  principal: z.boolean(),
})

export const empresaCarteiraSchema = z
  .object({
    id: z.uuid(),
    tipoDocumento: tipoDocumentoSchema,
    documento: z.string().nullable(),
    matrizFilial: z.enum(['matriz', 'filial']).nullable(),
    /** A matriz desta filial, se estiver cadastrada e o usuário puder vê-la */
    matriz: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    /** As filiais cadastradas que o usuário pode ver */
    filiais: z.array(
      z.object({ id: z.uuid(), nome: z.string(), documento: z.string().nullable() }),
    ),
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
    /** Nome de exibição: o fantasia, ou a razão social */
    nome: z.string(),
    mei: z.boolean(),
    dataInicioAtividades: z.string().nullable(),
    porte: z.object({ codigo: z.number().int(), descricao: z.string() }).nullable(),
    regimeTributario: regimeTributarioSchema,
    vendedor: pessoaSchema,
    vertical: z.object({ id: z.uuid(), nome: z.string(), cor: z.string() }).nullable(),
    website: z.string().nullable(),
    endereco: z.object({
      cep: z.string().nullable(),
      tipoLogradouro: z.string().nullable(),
      logradouro: z.string().nullable(),
      numero: z.string().nullable(),
      complemento: z.string().nullable(),
      bairro: z.string().nullable(),
      municipio: z
        .object({ codigoIbge: z.number().int(), nome: z.string(), uf: z.string() })
        .nullable(),
      paisCodigo: z.number().int().nullable(),
    }),
    observacoes: z.string().nullable(),
    origemCadastro: origemCadastroSchema,
    telefones: z.array(telefoneDaEmpresaSchema),
    cnaes: z.array(
      z.object({ codigo: z.number().int(), descricao: z.string(), principal: z.boolean() }),
    ),
    socios: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        qualificacao: z.string().nullable(),
        /** Preenchido quando o sócio já foi convertido em contato */
        contatoId: z.uuid().nullable(),
      }),
    ),
    tags: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        cor: z.string(),
        tagGrupoId: z.uuid(),
        automatica: z.boolean(),
      }),
    ),
    /** Situação na Receita, da última consulta guardada; nulo para CPF, sem documento ou sem consulta */
    receita: z
      .object({
        situacao: z.string(),
        motivo: z.string().nullable(),
        ativa: z.boolean(),
        desde: z.string().nullable(),
        consultadoEm: z.string(),
      })
      .nullable(),
    /** Salva sem poder consultar a Receita: o sistema reconsulta depois */
    situacaoNaoVerificada: z.boolean(),
    receitaAtualizadoEm: z.string().nullable(),
    ultimaVisitaEm: z.string().nullable(),
    ultimoContatoEm: z.string().nullable(),
    proximaAtividadeEm: z.string().nullable(),
    criadoEm: z.string(),
    atualizadoEm: z.string(),
    /** O que o usuário pode fazer com esta empresa */
    permissoes: z.object({ editar: z.boolean(), excluir: z.boolean(), transferir: z.boolean() }),
  })
  .meta({ id: 'EmpresaDaCarteira' })
export type EmpresaCarteira = z.infer<typeof empresaCarteiraSchema>

/**
 * 409 `empresa_ja_cadastrada`: o documento já está na carteira. `existente` só traz o id e o nome
 * quando o usuário pode ver aquela empresa ("Abrir ficha"); senão, `visivel` é falso e nada vaza.
 */
export const empresaExistenteSchema = z
  .object({
    visivel: z.boolean(),
    id: z.uuid().optional(),
    nome: z.string().optional(),
  })
  .meta({ id: 'EmpresaExistente' })
export type EmpresaExistente = z.infer<typeof empresaExistenteSchema>

/**
 * PUT /v1/carteira/empresas/{id}/tags: as tags que a empresa passa a ter nos grupos manuais. Grupo de
 * seleção única aceita uma só; grupo obrigatório (Status) exige uma. As tags dos grupos automáticos
 * (Visitação) são do sistema: continuam como estão.
 */
export const definirTagsDaEmpresaSchema = z
  .object({ tagIds: z.array(z.uuid()).max(50) })
  .strict()
  .meta({ id: 'DefinirTagsDaEmpresaEntrada' })
export type DefinirTagsDaEmpresa = z.output<typeof definirTagsDaEmpresaSchema>

/** Até quantas empresas uma ação em massa aceita de uma vez. */
export const MAX_EMPRESAS_EM_MASSA = 200

/**
 * POST /v1/carteira/empresas/tags-em-massa: aplica UMA tag a várias empresas. Tag de grupo de seleção
 * única (o Status) substitui a que a empresa já tinha no grupo.
 */
export const aplicarTagEmMassaSchema = z
  .object({
    empresaIds: z.array(z.uuid()).min(1).max(MAX_EMPRESAS_EM_MASSA),
    tagId: z.uuid(),
  })
  .strict()
  .meta({ id: 'AplicarTagEmMassaEntrada' })
export type AplicarTagEmMassa = z.output<typeof aplicarTagEmMassaSchema>

export const resultadoDaTagEmMassaSchema = z
  .object({
    /** Empresas que mudaram de tag */
    aplicadas: z.number().int(),
    /** Já tinham a tag: nada a fazer */
    semMudanca: z.number().int(),
    /** Não existem, são de outro vendedor ou o usuário não pode editá-las: ficaram como estavam */
    ignoradas: z.number().int(),
  })
  .meta({ id: 'ResultadoDaTagEmMassa' })
export type ResultadoDaTagEmMassa = z.infer<typeof resultadoDaTagEmMassaSchema>
