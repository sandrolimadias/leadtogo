import { z } from 'zod'

import { cnpjValido, normalizarCnpj } from './cnpj.js'
import { cpfValido, normalizarCpf } from './cpf.js'
import { tipoTelefoneSchema } from './carteira-empresas.js'

// API pública v1 (`/v1/publica/*`, docs/plano_api_aberta.md, seção 5): o contrato com as integrações (n8n, ERPs,
// site). Campos em português e snake_case; datas ISO 8601 com fuso; dinheiro como string decimal ("350.00");
// tags pela chave do sistema ou pelo id, nunca pelo nome. Só mudanças ADITIVAS dentro da v1: o arquivo
// docs/api/publica-v1.openapi.json é o retrato do contrato, conferido no CI.

const instante = z.iso.datetime({ offset: true })
const dia = z.iso.date()
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()

/** Dinheiro na API pública: string decimal com até 2 casas ("350.00"); o número também é aceito na entrada. */
export const dinheiroPublicoSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d{1,13}(\.\d{1,2})?$/, 'use "1234.56"'),
    z.number().min(0),
  ])
  .transform((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : Number(v)))
  .refine((v) => v >= 0 && v <= 9_999_999_999_999.99, 'valor fora da faixa')

/** Uma tag pela chave do sistema (`cliente`, `adimplente`) ou pelo id. */
export const referenciaDeTagSchema = z.string().trim().min(1).max(80)

export const MAXIMO_DO_LOTE = 500
export const LIMITE_PADRAO_DA_PAGINA = 50
export const LIMITE_MAXIMO_DA_PAGINA = 200

// ------------------------------------------------------------------------------------------------- comuns

export const consultaPaginadaSchema = z.object({
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIMITE_MAXIMO_DA_PAGINA)
    .default(LIMITE_PADRAO_DA_PAGINA),
  /** O `proximo_cursor` da página anterior */
  cursor: z.string().max(200).optional(),
  /** Só o que mudou desde este instante (para sincronizar) */
  atualizado_desde: instante.optional(),
})

const pessoa = z.object({ id: z.uuid(), nome: z.string() })
const pessoaComEmail = pessoa.extend({ email: z.string().nullable() })

export const tagPublicaSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    chave_sistema: z.string().nullable(),
    grupo: z.object({ id: z.uuid(), nome: z.string(), chave_sistema: z.string().nullable() }),
  })
  .meta({ id: 'PublicaTag' })
export type TagPublica = z.infer<typeof tagPublicaSchema>

const telefonePublico = z.object({
  numero: z.string(),
  e164: z.string(),
  tipo: tipoTelefoneSchema,
  principal: z.boolean(),
})

const telefoneEntrada = z
  .object({
    numero: z.string().trim().min(1).max(30),
    tipo: tipoTelefoneSchema.optional(),
    principal: z.boolean().optional(),
  })
  .strict()

// ---------------------------------------------------------------------------------------------- identidade

export const euPublicoSchema = z
  .object({
    empresa: z.object({ id: z.uuid(), nome: z.string() }),
    chave: z.object({ id: z.uuid(), nome: z.string() }),
    permissoes: z.array(z.string()),
    limites: z.object({ por_minuto: z.number().int(), por_dia: z.number().int() }),
  })
  .meta({ id: 'PublicaEu' })
export type EuPublico = z.infer<typeof euPublicoSchema>

// ------------------------------------------------------------------------------------------------ empresas

export const empresaPublicaSchema = z
  .object({
    id: z.uuid(),
    tipo_documento: z.enum(['cnpj', 'cpf', 'nenhum']),
    documento: z.string().nullable(),
    razao_social: z.string(),
    nome_fantasia: z.string().nullable(),
    /** O fantasia, ou a razão social */
    nome: z.string(),
    /** A tag do grupo Status (Lead, Prospect, Cliente, Inativo, pelo nome que a empresa deu) */
    status: tagPublicaSchema.nullable(),
    tags: z.array(tagPublicaSchema),
    responsavel: pessoaComEmail,
    vertical: pessoa.nullable(),
    website: z.string().nullable(),
    observacoes: z.string().nullable(),
    telefones: z.array(telefonePublico),
    endereco: z.object({
      cep: z.string().nullable(),
      logradouro: z.string().nullable(),
      numero: z.string().nullable(),
      complemento: z.string().nullable(),
      bairro: z.string().nullable(),
      municipio_ibge: z.number().int().nullable(),
      municipio: z.string().nullable(),
      uf: z.string().nullable(),
    }),
    receita: z.object({
      /** Salva sem a consulta da Receita (fila do worker): a situação ainda não foi conferida */
      situacao_nao_verificada: z.boolean(),
      atualizada_em: instante.nullable(),
    }),
    ultima_visita_em: instante.nullable(),
    ultimo_contato_em: instante.nullable(),
    proxima_atividade_em: instante.nullable(),
    criado_em: instante,
    atualizado_em: instante,
  })
  .meta({ id: 'PublicaEmpresa' })
export type EmpresaPublica = z.infer<typeof empresaPublicaSchema>

export const consultaDeEmpresasPublicaSchema = consultaPaginadaSchema
  .extend({
    cnpj: z.string().trim().max(30).optional(),
    /** Tag do grupo Status pela chave do sistema (`lead`, `prospect`, `cliente`, `inativo`) ou pelo id */
    status: referenciaDeTagSchema.optional(),
    /** Qualquer tag, pela chave do sistema ou pelo id */
    tag: referenciaDeTagSchema.optional(),
    responsavel_id: z.uuid().optional(),
  })
  .strict()
export type ConsultaDeEmpresasPublica = z.infer<typeof consultaDeEmpresasPublicaSchema>

export const listaDeEmpresasPublicaSchema = z
  .object({ dados: z.array(empresaPublicaSchema), proximo_cursor: z.string().nullable() })
  .meta({ id: 'PublicaListaDeEmpresas' })

const enderecoEntrada = z
  .object({
    cep: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ''))
      .refine((v) => v === '' || v.length === 8, 'CEP deve ter 8 dígitos')
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    logradouro: texto(200),
    numero: texto(30),
    complemento: texto(200),
    bairro: texto(100),
    municipio_ibge: z.number().int().positive().nullable().optional(),
  })
  .strict()

const camposDaEmpresa = {
  razao_social: z.string().trim().min(2).max(200),
  nome_fantasia: texto(200),
  website: texto(200),
  observacoes: texto(5000),
  /** Se vier, substitui todos os telefones */
  telefones: z.array(telefoneEntrada).max(10).optional(),
  /** Se vier, substitui todo o endereço */
  endereco: enderecoEntrada.optional(),
  /** Quem cuida da empresa. Sem ele, o responsável padrão da chave; mudar depois exige `empresas.transferir` */
  responsavel_id: z.uuid().optional(),
  /** O mesmo, pelo e-mail do membro da equipe */
  responsavel_email: z.email().optional(),
}

const documentoConferido = <
  T extends { tipo_documento: 'cnpj' | 'cpf' | 'nenhum'; documento?: string | undefined },
>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  const informado = v.documento !== undefined && v.documento !== ''
  if (v.tipo_documento === 'nenhum') {
    if (informado) ctx.addIssue({ code: 'custom', path: ['documento'], message: 'sem documento' })
  } else if (!informado) {
    ctx.addIssue({ code: 'custom', path: ['documento'], message: 'informe o documento' })
  } else if (v.tipo_documento === 'cnpj' && !cnpjValido(v.documento ?? '')) {
    ctx.addIssue({ code: 'custom', path: ['documento'], message: 'CNPJ inválido' })
  } else if (v.tipo_documento === 'cpf' && !cpfValido(v.documento ?? '')) {
    ctx.addIssue({ code: 'custom', path: ['documento'], message: 'CPF inválido' })
  }
}

const documentoNormalizado = <
  T extends { tipo_documento: 'cnpj' | 'cpf' | 'nenhum'; documento?: string | undefined },
>(
  v: T,
): T => ({
  ...v,
  documento:
    v.tipo_documento === 'cnpj'
      ? normalizarCnpj(v.documento ?? '')
      : v.tipo_documento === 'cpf'
        ? normalizarCpf(v.documento ?? '')
        : undefined,
})

const objetoDeCriarEmpresa = z
  .object({
    tipo_documento: z.enum(['cnpj', 'cpf', 'nenhum']).default('cnpj'),
    documento: z.string().trim().max(30).optional(),
    ...camposDaEmpresa,
    /** Tag do grupo Status pela chave do sistema ou pelo id; sem ela, Lead */
    status: referenciaDeTagSchema.optional(),
    /** Outras tags a aplicar (não automáticas), pela chave do sistema ou pelo id */
    tags: z.array(referenciaDeTagSchema).max(20).optional(),
    /** CNPJ: consultar a Receita (na fila do worker, sem segurar a resposta). Padrão: true */
    consultar_receita: z.boolean().default(true),
  })
  .strict()

export const criarEmpresaPublicaSchema = objetoDeCriarEmpresa
  .superRefine(documentoConferido)
  .transform(documentoNormalizado)
  .meta({ id: 'PublicaCriarEmpresa' })
export type CriarEmpresaPublica = z.output<typeof criarEmpresaPublicaSchema>

export const alterarEmpresaPublicaSchema = z
  .object(camposDaEmpresa)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'PublicaAlterarEmpresa' })
export type AlterarEmpresaPublica = z.output<typeof alterarEmpresaPublicaSchema>

/** Lote: cria ou atualiza pelo documento (CNPJ ou CPF). Cada item é independente: um ruim não derruba o lote. */
export const loteDeEmpresasPublicaSchema = z
  .object({ empresas: z.array(z.unknown()).min(1).max(MAXIMO_DO_LOTE) })
  .strict()
  .meta({ id: 'PublicaLoteDeEmpresas' })

export const RESULTADOS_DO_ITEM = ['criado', 'atualizado', 'ignorado', 'erro'] as const
export const resultadoDoLotePublicoSchema = z
  .object({
    resumo: z.object({
      criados: z.number().int(),
      atualizados: z.number().int(),
      ignorados: z.number().int(),
      erros: z.number().int(),
    }),
    itens: z.array(
      z.object({
        indice: z.number().int(),
        documento: z.string().nullable(),
        resultado: z.enum(RESULTADOS_DO_ITEM),
        id: z.uuid().nullable(),
        erro: z
          .object({ codigo: z.string(), mensagem: z.string(), campos: z.array(z.string()) })
          .nullable(),
      }),
    ),
  })
  .meta({ id: 'PublicaResultadoDoLote' })
export type ResultadoDoLotePublico = z.infer<typeof resultadoDoLotePublicoSchema>

// ------------------------------------------------------------------------------------------------ contatos

export const contatoPublicoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    emails: z.array(z.object({ email: z.string(), principal: z.boolean() })),
    telefones: z.array(telefonePublico),
    empresas: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        cargo: z.string().nullable(),
        principal: z.boolean(),
      }),
    ),
    aceita_whatsapp: z.boolean(),
    aceita_email: z.boolean(),
    observacoes: z.string().nullable(),
    criado_em: instante,
    atualizado_em: instante,
  })
  .meta({ id: 'PublicaContato' })
export type ContatoPublico = z.infer<typeof contatoPublicoSchema>

export const consultaDeContatosPublicaSchema = consultaPaginadaSchema
  .extend({
    email: z.string().trim().max(254).optional(),
    /** Em E.164 (+5527999990000) ou como digitado */
    telefone: z.string().trim().max(30).optional(),
    empresa_id: z.uuid().optional(),
  })
  .strict()
export type ConsultaDeContatosPublica = z.infer<typeof consultaDeContatosPublicaSchema>

export const listaDeContatosPublicaSchema = z
  .object({ dados: z.array(contatoPublicoSchema), proximo_cursor: z.string().nullable() })
  .meta({ id: 'PublicaListaDeContatos' })

const camposDoContato = {
  nome: z.string().trim().min(2).max(200),
  /** Se vier, substitui todos os e-mails (o primeiro vira o principal) */
  emails: z
    .array(z.string().trim().toLowerCase().pipe(z.email().max(254)))
    .max(5)
    .optional(),
  /** Se vier, substitui todos os telefones */
  telefones: z.array(telefoneEntrada).max(10).optional(),
  observacoes: texto(5000),
  aceita_whatsapp: z.boolean().optional(),
  aceita_email: z.boolean().optional(),
}

export const criarContatoPublicoSchema = z
  .object({
    ...camposDoContato,
    /** A empresa do contato (obrigatória): pelo id ou pelo CNPJ */
    empresa_id: z.uuid().optional(),
    empresa_cnpj: z.string().trim().max(30).optional(),
    cargo: texto(100),
    principal: z.boolean().optional(),
    /** Já existe contato com o mesmo e-mail ou telefone: cria mesmo assim (padrão: 409 `contato_duplicado`) */
    ignorar_duplicado: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.empresa_id !== undefined || v.empresa_cnpj !== undefined, {
    message: 'informe empresa_id ou empresa_cnpj',
    path: ['empresa_id'],
  })
  .meta({ id: 'PublicaCriarContato' })
export type CriarContatoPublico = z.output<typeof criarContatoPublicoSchema>

export const alterarContatoPublicoSchema = z
  .object(camposDoContato)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'PublicaAlterarContato' })
export type AlterarContatoPublico = z.output<typeof alterarContatoPublicoSchema>

// ---------------------------------------------------------------------------------------------- atividades

export const atividadePublicaSchema = z
  .object({
    id: z.uuid(),
    tipo: z.object({ id: z.uuid(), nome: z.string(), chave_sistema: z.string().nullable() }),
    titulo: z.string(),
    situacao: z.enum(['pendente', 'realizada', 'cancelada']),
    inicio: instante,
    fim: instante.nullable(),
    dia_inteiro: z.boolean(),
    realizada_em: instante.nullable(),
    resultado: z.string().nullable(),
    observacoes: z.string().nullable(),
    empresa_id: z.uuid().nullable(),
    contato_id: z.uuid().nullable(),
    oportunidade_id: z.uuid().nullable(),
    responsavel: pessoaComEmail,
    origem: z.string(),
    id_externo: z.string().nullable(),
    criado_em: instante,
    atualizado_em: instante,
  })
  .meta({ id: 'PublicaAtividade' })
export type AtividadePublica = z.infer<typeof atividadePublicaSchema>

export const consultaDeAtividadesPublicaSchema = consultaPaginadaSchema
  .extend({
    empresa_id: z.uuid().optional(),
    responsavel_id: z.uuid().optional(),
    situacao: z.enum(['pendente', 'realizada', 'cancelada']).optional(),
    id_externo: z.string().trim().max(200).optional(),
  })
  .strict()
export type ConsultaDeAtividadesPublica = z.infer<typeof consultaDeAtividadesPublicaSchema>

export const listaDeAtividadesPublicaSchema = z
  .object({ dados: z.array(atividadePublicaSchema), proximo_cursor: z.string().nullable() })
  .meta({ id: 'PublicaListaDeAtividades' })

export const criarAtividadePublicaSchema = z
  .object({
    /** Tipo de atividade pela chave do sistema (`ligacao`, `visita`, `tarefa`...) ou pelo id */
    tipo: z.string().trim().min(1).max(80),
    titulo: z.string().trim().min(1).max(200),
    empresa_id: z.uuid().optional(),
    empresa_cnpj: z.string().trim().max(30).optional(),
    contato_id: z.uuid().optional(),
    oportunidade_id: z.uuid().optional(),
    responsavel_id: z.uuid().optional(),
    responsavel_email: z.email().optional(),
    inicio: instante,
    fim: instante.optional(),
    dia_inteiro: z.boolean().default(false),
    situacao: z.enum(['pendente', 'realizada']).default('pendente'),
    /** Obrigatório quando realizada */
    resultado: texto(5000),
    observacoes: texto(5000),
    /** Identificador no sistema de origem: repetir o mesmo devolve a atividade já criada (200) */
    id_externo: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.situacao === 'realizada' && !v.resultado) {
      ctx.addIssue({ code: 'custom', path: ['resultado'], message: 'informe o resultado' })
    }
  })
  .meta({ id: 'PublicaCriarAtividade' })
export type CriarAtividadePublica = z.output<typeof criarAtividadePublicaSchema>

export const concluirAtividadePublicaSchema = z
  .object({ resultado: z.string().trim().min(1).max(5000), realizada_em: instante.optional() })
  .strict()
  .meta({ id: 'PublicaConcluirAtividade' })
export type ConcluirAtividadePublica = z.output<typeof concluirAtividadePublicaSchema>

// ------------------------------------------------------------------------------------------- oportunidades

export const oportunidadePublicaSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    empresa_id: z.uuid(),
    contato_id: z.uuid().nullable(),
    funil: pessoa,
    fase: pessoa,
    status: z.string(),
    valor_unico: z.string(),
    valor_mensal: z.string(),
    meses: z.number().int(),
    valor_total: z.string(),
    probabilidade: z.number().int(),
    previsao_fechamento: dia.nullable(),
    data_fechamento: instante.nullable(),
    responsavel: pessoaComEmail,
    origem: pessoa.nullable(),
    observacoes: z.string().nullable(),
    criado_em: instante,
    atualizado_em: instante,
  })
  .meta({ id: 'PublicaOportunidade' })
export type OportunidadePublica = z.infer<typeof oportunidadePublicaSchema>

export const consultaDeOportunidadesPublicaSchema = consultaPaginadaSchema
  .extend({
    empresa_id: z.uuid().optional(),
    funil_id: z.uuid().optional(),
    fase_id: z.uuid().optional(),
    status: z.string().trim().max(30).optional(),
    responsavel_id: z.uuid().optional(),
  })
  .strict()
export type ConsultaDeOportunidadesPublica = z.infer<typeof consultaDeOportunidadesPublicaSchema>

export const listaDeOportunidadesPublicaSchema = z
  .object({ dados: z.array(oportunidadePublicaSchema), proximo_cursor: z.string().nullable() })
  .meta({ id: 'PublicaListaDeOportunidades' })

export const criarOportunidadePublicaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    empresa_id: z.uuid().optional(),
    empresa_cnpj: z.string().trim().max(30).optional(),
    contato_id: z.uuid().optional(),
    funil_id: z.uuid().optional(),
    fase_id: z.uuid().optional(),
    origem_id: z.uuid().optional(),
    responsavel_id: z.uuid().optional(),
    responsavel_email: z.email().optional(),
    valor_unico: dinheiroPublicoSchema.optional(),
    valor_mensal: dinheiroPublicoSchema.optional(),
    meses: z.number().int().min(0).max(600).optional(),
    previsao_fechamento: dia.optional(),
    observacoes: texto(5000),
  })
  .strict()
  .refine((v) => v.empresa_id !== undefined || v.empresa_cnpj !== undefined, {
    message: 'informe empresa_id ou empresa_cnpj',
    path: ['empresa_id'],
  })
  .meta({ id: 'PublicaCriarOportunidade' })
export type CriarOportunidadePublica = z.output<typeof criarOportunidadePublicaSchema>

export const alterarOportunidadePublicaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    /** Muda a fase (mesmo funil) */
    fase_id: z.uuid(),
    responsavel_id: z.uuid(),
    valor_unico: dinheiroPublicoSchema,
    valor_mensal: dinheiroPublicoSchema,
    meses: z.number().int().min(0).max(600),
    previsao_fechamento: dia.nullable(),
    observacoes: texto(5000),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'PublicaAlterarOportunidade' })
export type AlterarOportunidadePublica = z.output<typeof alterarOportunidadePublicaSchema>

// ------------------------------------------------------------------------------------------------ cadastros

export const listaDeTagsPublicaSchema = z
  .object({
    dados: z.array(tagPublicaSchema.extend({ ativa: z.boolean(), automatica: z.boolean() })),
  })
  .meta({ id: 'PublicaListaDeTags' })

export const listaDeCadastrosPublicaSchema = z
  .object({
    dados: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        chave_sistema: z.string().nullable(),
        ativo: z.boolean(),
      }),
    ),
  })
  .meta({ id: 'PublicaListaDeCadastros' })

export const listaDeFunisPublicaSchema = z
  .object({
    dados: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        padrao: z.boolean(),
        ativo: z.boolean(),
        fases: z.array(
          z.object({ id: z.uuid(), nome: z.string(), ordem: z.number().int(), ativa: z.boolean() }),
        ),
      }),
    ),
  })
  .meta({ id: 'PublicaListaDeFunis' })

export const listaDeMembrosPublicaSchema = z
  .object({ dados: z.array(pessoaComEmail.extend({ ativo: z.boolean() })) })
  .meta({ id: 'PublicaListaDeMembros' })
