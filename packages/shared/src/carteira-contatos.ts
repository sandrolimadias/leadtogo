import { z } from 'zod'

import { telefoneEntradaSchema, tipoTelefoneSchema } from './carteira-empresas.js'
import { porPaginaSchema } from './paginacao.js'

// Contato (a pessoa) e seus vínculos com as empresas da carteira: /v1/carteira/contatos.
// O cargo e o contato principal pertencem ao VÍNCULO com cada empresa, não à pessoa.

/** Texto opcional: vazio vira `null` (limpa o campo); ausente fica `undefined` (não mexe). */
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()

export const MAX_TELEFONES_DO_CONTATO = 10
export const MAX_EMAILS_DO_CONTATO = 10

export const tipoEmailSchema = z.enum(['pessoal', 'trabalho'])
export type TipoEmail = z.infer<typeof tipoEmailSchema>

const DIAS_DO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Aniversário sem ano: dia e mês que existem (29/02 vale; 31/02 não). */
export const aniversarioSchema = z
  .object({ dia: z.number().int().min(1).max(31), mes: z.number().int().min(1).max(12) })
  .strict()
  .refine((v) => v.dia <= (DIAS_DO_MES[v.mes - 1] ?? 31), 'dia que não existe nesse mês')
  .meta({ id: 'AniversarioDoContato' })
export type Aniversario = z.infer<typeof aniversarioSchema>

export const emailEntradaSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('e-mail inválido').max(254)),
    tipo: tipoEmailSchema.optional(),
    principal: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'EmailDoContatoEntrada' })
export type EmailEntrada = z.infer<typeof emailEntradaSchema>

const linkedin = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v === '' ? null : v))
  .refine(
    (v) => v === null || /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/.+/i.test(v),
    'informe o endereço do perfil, como https://www.linkedin.com/in/nome',
  )
  .nullable()
  .optional()

const camposDoContato = {
  nome: z.string().trim().min(2, 'informe o nome').max(200),
  papelDecisaoId: z.uuid().nullable().optional(),
  aniversario: aniversarioSchema.nullable().optional(),
  linkedinUrl: linkedin,
  observacoes: texto(5000),
  /** Se vier, substitui todos os telefones (o primeiro vira o principal se nenhum for marcado) */
  telefones: z.array(telefoneEntradaSchema).max(MAX_TELEFONES_DO_CONTATO).optional(),
  /** Se vier, substitui todos os e-mails */
  emails: z.array(emailEntradaSchema).max(MAX_EMAILS_DO_CONTATO).optional(),
  /** Consentimento (LGPD): falso nos dois = "pediu para não receber contato" */
  aceitaWhatsapp: z.boolean().optional(),
  aceitaEmail: z.boolean().optional(),
  /** Já existe contato com o mesmo e-mail ou telefone: a pessoa viu o aviso e quer criar/salvar mesmo assim */
  ignorarDuplicado: z.boolean().optional(),
}

/** O primeiro vínculo, na criação: a empresa da carteira, o cargo e se é o contato principal dela. */
export const vinculoInicialSchema = z
  .object({
    empresaId: z.uuid(),
    cargo: texto(100),
    principal: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'VinculoInicialDoContato' })

/**
 * POST /v1/carteira/contatos. O vendedor precisa informar a empresa (`vinculo`): sem empresa vinculada o
 * contato só seria visível a gestor e administrador. Gestor e administrador podem criar sem empresa.
 */
export const criarContatoSchema = z
  .object({ ...camposDoContato, vinculo: vinculoInicialSchema.optional() })
  .strict()
  .meta({ id: 'CriarContatoEntrada' })
export type CriarContatoEntrada = z.input<typeof criarContatoSchema>
export type CriarContato = z.output<typeof criarContatoSchema>

/** PATCH /v1/carteira/contatos/{id}: só o que vier muda. Os vínculos têm rotas próprias. */
export const alterarContatoSchema = z
  .object(camposDoContato)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarContatoEntrada' })
export type AlterarContatoEntrada = z.input<typeof alterarContatoSchema>
export type AlterarContato = z.output<typeof alterarContatoSchema>

/** POST /v1/carteira/contatos/{id}/vinculos: liga o contato a outra empresa (reativa o vínculo inativo, se houver). */
export const vincularContatoSchema = z
  .object({ empresaId: z.uuid(), cargo: texto(100), principal: z.boolean().optional() })
  .strict()
  .meta({ id: 'VincularContatoEntrada' })
export type VincularContatoEntrada = z.input<typeof vincularContatoSchema>
export type VincularContato = z.output<typeof vincularContatoSchema>

/**
 * PATCH /v1/carteira/contatos/{id}/vinculos/{empresaId}: só o que vier muda. `ativo: false` é o caminho
 * comum quando a pessoa sai da empresa (mantém o histórico e tira o selo de principal).
 */
export const alterarVinculoSchema = z
  .object({ cargo: texto(100), principal: z.boolean().optional(), ativo: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarVinculoEntrada' })
export type AlterarVinculoEntrada = z.input<typeof alterarVinculoSchema>
export type AlterarVinculo = z.output<typeof alterarVinculoSchema>

// ---- saída ----

export const telefoneDoContatoSchema = z.object({
  id: z.uuid(),
  numero: z.string(),
  e164: z.string(),
  tipo: tipoTelefoneSchema,
  descricao: z.string().nullable(),
  principal: z.boolean(),
})

export const emailDoContatoSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  tipo: tipoEmailSchema,
  principal: z.boolean(),
})

export const vinculoDoContatoSchema = z.object({
  id: z.uuid(),
  empresa: z.object({ id: z.uuid(), nome: z.string() }),
  cargo: z.string().nullable(),
  principal: z.boolean(),
  ativo: z.boolean(),
  desde: z.string().nullable(),
  ate: z.string().nullable(),
  /** O usuário edita a empresa deste vínculo (cargo, principal, inativar): o vendedor só a própria carteira */
  editavel: z.boolean(),
})

export const contatoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    papelDecisao: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    aniversario: z.object({ dia: z.number().int(), mes: z.number().int() }).nullable(),
    linkedinUrl: z.string().nullable(),
    observacoes: z.string().nullable(),
    aceitaWhatsapp: z.boolean(),
    aceitaEmail: z.boolean(),
    /** Quando e como o consentimento foi registrado (nulo: nunca mudou, vale o padrão) */
    consentimentoEm: z.string().nullable(),
    consentimentoOrigem: z.string().nullable(),
    telefones: z.array(telefoneDoContatoSchema),
    emails: z.array(emailDoContatoSchema),
    /** Só os vínculos com empresas que o usuário vê */
    vinculos: z.array(vinculoDoContatoSchema),
    criadoEm: z.string(),
    atualizadoEm: z.string(),
    permissoes: z.object({ editar: z.boolean(), excluir: z.boolean() }),
  })
  .meta({ id: 'Contato' })
export type Contato = z.infer<typeof contatoSchema>

/**
 * 409 `contato_duplicado`: já existe contato com o mesmo e-mail ou telefone. `id` e `nome` só vêm quando
 * o usuário pode ver aquele contato; senão só `visivel: false`. A pessoa escolhe "Abrir contato" ou
 * "Criar mesmo assim" (reenviando com `ignorarDuplicado: true`).
 */
export const contatoExistenteSchema = z
  .object({
    visivel: z.boolean(),
    id: z.uuid().optional(),
    nome: z.string().optional(),
    motivo: z.enum(['email', 'telefone']),
  })
  .meta({ id: 'ContatoExistente' })
export type ContatoExistente = z.infer<typeof contatoExistenteSchema>

// ---- Lista de contatos (GET /v1/carteira/contatos) ----

export const ORDENS_DA_LISTA_DE_CONTATOS = ['nome', 'criado_em'] as const

const textoDeBusca = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === '' ? undefined : v))
  .optional()

/**
 * Consulta da lista. Tudo opcional; os filtros se somam. `empresaId`, `cargo` e `tagId` olham só os
 * vínculos **ativos** (o cargo é do vínculo; a tag é da empresa do vínculo).
 */
export const consultaDeContatosSchema = z
  .object({
    /** Nome (sem acento nem diferença de caixa), e-mail ou telefone (qualquer pedaço dos dígitos) */
    busca: textoDeBusca,
    empresaId: z.uuid().optional(),
    cargo: textoDeBusca,
    papelDecisaoId: z.uuid().optional(),
    tagId: z.uuid().optional(),
    ordem: z.enum(ORDENS_DA_LISTA_DE_CONTATOS).default('nome'),
    sentido: z.enum(['asc', 'desc']).default('asc'),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: porPaginaSchema(),
  })
  .strict()
export type ConsultaDeContatos = z.output<typeof consultaDeContatosSchema>
export type ConsultaDeContatosEntrada = z.input<typeof consultaDeContatosSchema>

export const itemDaListaDeContatosSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    papelDecisao: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    /** Só as empresas que o usuário vê; as ativas primeiro, o principal antes */
    empresas: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        cargo: z.string().nullable(),
        principal: z.boolean(),
        ativo: z.boolean(),
      }),
    ),
    /** Telefone principal em E.164 (Ligar e WhatsApp); nulo se o contato não tem telefone */
    telefone: z.string().nullable(),
    /** Algum telefone do contato é do tipo WhatsApp */
    temWhatsapp: z.boolean(),
    email: z.string().nullable(),
    /** Pediu para não receber contato (consentimento desligado para WhatsApp e e-mail) */
    naoQuerContato: z.boolean(),
    /** O usuário pode editar o contato (o vendedor só edita o ligado a empresa dele) */
    editavel: z.boolean(),
  })
  .meta({ id: 'ItemDaListaDeContatos' })
export type ItemDaListaDeContatos = z.infer<typeof itemDaListaDeContatosSchema>

export const listaDeContatosSchema = z
  .object({
    itens: z.array(itemDaListaDeContatosSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
  })
  .meta({ id: 'ListaDeContatos' })
export type ListaDeContatos = z.infer<typeof listaDeContatosSchema>

/** Opções dos filtros: os cargos que existem nos vínculos ativos que o usuário vê. */
export const opcoesDaListaDeContatosSchema = z
  .object({ cargos: z.array(z.string()) })
  .meta({ id: 'OpcoesDaListaDeContatos' })
export type OpcoesDaListaDeContatos = z.infer<typeof opcoesDaListaDeContatosSchema>

/** Um contato na aba Contatos da empresa (um vínculo, ativo ou não). */
export const contatoDaEmpresaSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    papelDecisao: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    cargo: z.string().nullable(),
    principal: z.boolean(),
    ativo: z.boolean(),
    telefone: z.string().nullable(),
    temWhatsapp: z.boolean(),
    email: z.string().nullable(),
    naoQuerContato: z.boolean(),
  })
  .meta({ id: 'ContatoDaEmpresa' })
export type ContatoDaEmpresa = z.infer<typeof contatoDaEmpresaSchema>
