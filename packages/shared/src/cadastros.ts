import { z } from 'zod'

/** Nome de um item de cadastro: sem espaços nas pontas, de 1 a 80 caracteres. */
export const nomeDeCadastroSchema = z
  .string()
  .trim()
  .min(1, 'informe o nome')
  .max(80, 'use até 80 caracteres')

/** Paleta de tags do design system (`tag-<cor>-bg` / `-fg`): o nome da cor, nunca hexadecimal. */
export const CORES_DE_TAG = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
] as const
export const corDeTagSchema = z.enum(CORES_DE_TAG).meta({ id: 'CorDeTag' })
export type CorDeTag = z.infer<typeof corDeTagSchema>

/** Nova ordem de uma lista: os ids de TODOS os itens do escopo, na ordem desejada. */
export const novaOrdemSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(500) })
  .strict()
  .meta({ id: 'NovaOrdemEntrada' })
export type NovaOrdemEntrada = z.infer<typeof novaOrdemSchema>

// ---- Tags e grupos de tags (docs/funcionalidades.md, seção 2) ----

export const selecaoDeTagSchema = z.enum(['unica', 'multipla'])
export type SelecaoDeTag = z.infer<typeof selecaoDeTagSchema>

/** A quem as tags de um grupo se aplicam. Escolhido na criação do grupo e nunca muda. */
export const alvoDeTagSchema = z.enum(['empresa', 'contato'])
export type AlvoDeTag = z.infer<typeof alvoDeTagSchema>

/**
 * Tags que as regras do sistema usam pela `chave_sistema` (importação, "empresa vira Cliente",
 * Visitada e Contactada): podem ser renomeadas e recoloridas, mas nunca inativadas nem excluídas.
 * Prospect e Inativo também nascem com chave, mas nenhuma regra depende delas.
 */
export const CHAVES_DE_TAG_COM_REGRA = ['lead', 'cliente', 'visitada', 'contactada'] as const

export const tagSchema = z
  .object({
    id: z.uuid(),
    tagGrupoId: z.uuid(),
    nome: z.string(),
    cor: corDeTagSchema,
    ativo: z.boolean(),
    ordem: z.number().int(),
    /** Identifica as tags das regras automáticas (`lead`, `cliente`, `visitada`...); null nas criadas pelo usuário */
    chaveSistema: z.string().nullable(),
    /** Tags de Status: a empresa com esta tag aparece no mapa (Inativo nasce desligada) */
    apareceNoMapa: z.boolean(),
    /** Tags de Status: o chip já vem ligado ao abrir o mapa (Prospect e Inativo nascem desligados) */
    visivelAoAbrir: z.boolean(),
  })
  .meta({ id: 'Tag' })
export type Tag = z.infer<typeof tagSchema>

export const tagGrupoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    selecao: selecaoDeTagSchema,
    obrigatorio: z.boolean(),
    /** Criado pelo sistema: não pode ser excluído nem ter a seleção e o "obrigatório" mudados */
    sistema: z.boolean(),
    /** Tags aplicadas por regra (ex.: Visitação), não pelo usuário */
    automatico: z.boolean(),
    /** Empresas (Status, Visitação...) ou contatos: as tags do grupo só valem para esse destino */
    aplicaA: alvoDeTagSchema,
    ativo: z.boolean(),
    ordem: z.number().int(),
    tags: z.array(tagSchema),
  })
  .meta({ id: 'TagGrupo' })
export type TagGrupo = z.infer<typeof tagGrupoSchema>

export const criarTagGrupoSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    selecao: selecaoDeTagSchema,
    obrigatorio: z.boolean().default(false),
    aplicaA: alvoDeTagSchema.default('empresa'),
  })
  .strict()
  .refine((d) => !(d.aplicaA === 'contato' && d.obrigatorio), {
    message: 'grupo de tags de contato não pode ser obrigatório',
    path: ['obrigatorio'],
  })
  .meta({ id: 'CriarTagGrupoEntrada' })
export type CriarTagGrupoEntrada = z.input<typeof criarTagGrupoSchema>

export const alterarTagGrupoSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    selecao: selecaoDeTagSchema,
    obrigatorio: z.boolean(),
    ativo: z.boolean(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarTagGrupoEntrada' })
export type AlterarTagGrupoEntrada = z.infer<typeof alterarTagGrupoSchema>

export const criarTagSchema = z
  .object({
    tagGrupoId: z.uuid(),
    nome: nomeDeCadastroSchema,
    cor: corDeTagSchema.default('gray'),
  })
  .strict()
  .meta({ id: 'CriarTagEntrada' })
export type CriarTagEntrada = z.input<typeof criarTagSchema>

export const alterarTagSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    cor: corDeTagSchema,
    ativo: z.boolean(),
    apareceNoMapa: z.boolean(),
    visivelAoAbrir: z.boolean(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarTagEntrada' })
export type AlterarTagEntrada = z.infer<typeof alterarTagSchema>

// ---- Verticais, soluções, origens, motivos e tipos de atividade (Módulo 1) ----

const algumCampo = (d: object) => Object.keys(d).length > 0
const MENSAGEM_ALGUM_CAMPO = 'informe ao menos um campo'

export const verticalSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    cor: corDeTagSchema,
    ativo: z.boolean(),
    ordem: z.number().int(),
  })
  .meta({ id: 'Vertical' })
export type Vertical = z.infer<typeof verticalSchema>
export const criarVerticalSchema = z
  .object({ nome: nomeDeCadastroSchema, cor: corDeTagSchema.default('gray') })
  .strict()
  .meta({ id: 'CriarVerticalEntrada' })
export type CriarVerticalEntrada = z.input<typeof criarVerticalSchema>
export const alterarVerticalSchema = z
  .object({ nome: nomeDeCadastroSchema, cor: corDeTagSchema, ativo: z.boolean() })
  .partial()
  .strict()
  .refine(algumCampo, MENSAGEM_ALGUM_CAMPO)
  .meta({ id: 'AlterarVerticalEntrada' })
export type AlterarVerticalEntrada = z.infer<typeof alterarVerticalSchema>

const descricaoSchema = z.string().trim().max(500, 'use até 500 caracteres')
export const solucaoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    cor: corDeTagSchema,
    descricao: z.string().nullable(),
    ativo: z.boolean(),
    ordem: z.number().int(),
  })
  .meta({ id: 'Solucao' })
export type Solucao = z.infer<typeof solucaoSchema>
export const criarSolucaoSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    cor: corDeTagSchema.default('gray'),
    descricao: descricaoSchema.nullish(),
  })
  .strict()
  .meta({ id: 'CriarSolucaoEntrada' })
export type CriarSolucaoEntrada = z.input<typeof criarSolucaoSchema>
export const alterarSolucaoSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    cor: corDeTagSchema,
    descricao: descricaoSchema.nullable(),
    ativo: z.boolean(),
  })
  .partial()
  .strict()
  .refine(algumCampo, MENSAGEM_ALGUM_CAMPO)
  .meta({ id: 'AlterarSolucaoEntrada' })
export type AlterarSolucaoEntrada = z.infer<typeof alterarSolucaoSchema>

export const origemSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    ativo: z.boolean(),
    ordem: z.number().int(),
    /** Origem usada por regras do sistema (`importacao`); null nas criadas pelo usuário */
    chaveSistema: z.string().nullable(),
  })
  .meta({ id: 'Origem' })
export type Origem = z.infer<typeof origemSchema>
export const criarOrigemSchema = z
  .object({ nome: nomeDeCadastroSchema })
  .strict()
  .meta({ id: 'CriarOrigemEntrada' })
export type CriarOrigemEntrada = z.infer<typeof criarOrigemSchema>
export const alterarOrigemSchema = z
  .object({ nome: nomeDeCadastroSchema, ativo: z.boolean() })
  .partial()
  .strict()
  .refine(algumCampo, MENSAGEM_ALGUM_CAMPO)
  .meta({ id: 'AlterarOrigemEntrada' })
export type AlterarOrigemEntrada = z.infer<typeof alterarOrigemSchema>

export const papelDecisaoSchema = z
  .object({ id: z.uuid(), nome: z.string(), ativo: z.boolean(), ordem: z.number().int() })
  .meta({ id: 'PapelNaDecisao' })
export type PapelDecisao = z.infer<typeof papelDecisaoSchema>
export const criarPapelDecisaoSchema = z
  .object({ nome: nomeDeCadastroSchema })
  .strict()
  .meta({ id: 'CriarPapelNaDecisaoEntrada' })
export type CriarPapelDecisaoEntrada = z.infer<typeof criarPapelDecisaoSchema>
export const alterarPapelDecisaoSchema = z
  .object({ nome: nomeDeCadastroSchema, ativo: z.boolean() })
  .partial()
  .strict()
  .refine(algumCampo, MENSAGEM_ALGUM_CAMPO)
  .meta({ id: 'AlterarPapelNaDecisaoEntrada' })
export type AlterarPapelDecisaoEntrada = z.infer<typeof alterarPapelDecisaoSchema>

/** Status de fechamento em que um motivo pode valer (Conquistado não pede motivo). */
export const STATUS_COM_MOTIVO = ['perdido', 'cancelado', 'suspenso'] as const
export const statusComMotivoSchema = z.enum(STATUS_COM_MOTIVO)
export type StatusComMotivo = z.infer<typeof statusComMotivoSchema>
const aplicaASchema = z
  .array(statusComMotivoSchema)
  .min(1, 'escolha ao menos um status')
  .refine((v) => new Set(v).size === v.length, 'status repetido')

export const motivoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    aplicaA: z.array(statusComMotivoSchema),
    ativo: z.boolean(),
    ordem: z.number().int(),
  })
  .meta({ id: 'Motivo' })
export type Motivo = z.infer<typeof motivoSchema>
export const criarMotivoSchema = z
  .object({ nome: nomeDeCadastroSchema, aplicaA: aplicaASchema })
  .strict()
  .meta({ id: 'CriarMotivoEntrada' })
export type CriarMotivoEntrada = z.infer<typeof criarMotivoSchema>
export const alterarMotivoSchema = z
  .object({ nome: nomeDeCadastroSchema, aplicaA: aplicaASchema, ativo: z.boolean() })
  .partial()
  .strict()
  .refine(algumCampo, MENSAGEM_ALGUM_CAMPO)
  .meta({ id: 'AlterarMotivoEntrada' })
export type AlterarMotivoEntrada = z.infer<typeof alterarMotivoSchema>

export const contaComoSchema = z.enum(['visita', 'contato', 'nenhum'])
export type ContaComo = z.infer<typeof contaComoSchema>
/** Nome de ícone Lucide (kebab-case); a tela oferece uma lista, a API só confere o formato. */
const iconeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'nome de ícone inválido')
  .max(40)

export const tipoAtividadeSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    icone: z.string(),
    cor: corDeTagSchema,
    contaComo: contaComoSchema,
    exigeEmpresa: z.boolean(),
    sincronizaAgenda: z.boolean(),
    ativo: z.boolean(),
    ordem: z.number().int(),
    /** Tipo padrão do sistema (`ligacao`, `visita`, `tarefa`...); null nos criados pelo usuário */
    chaveSistema: z.string().nullable(),
  })
  .meta({ id: 'TipoAtividade' })
export type TipoAtividade = z.infer<typeof tipoAtividadeSchema>
export const criarTipoAtividadeSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    icone: iconeSchema,
    cor: corDeTagSchema.default('gray'),
    contaComo: contaComoSchema.default('nenhum'),
    exigeEmpresa: z.boolean().default(true),
    sincronizaAgenda: z.boolean().default(false),
  })
  .strict()
  .meta({ id: 'CriarTipoAtividadeEntrada' })
export type CriarTipoAtividadeEntrada = z.input<typeof criarTipoAtividadeSchema>
export const alterarTipoAtividadeSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    icone: iconeSchema,
    cor: corDeTagSchema,
    contaComo: contaComoSchema,
    exigeEmpresa: z.boolean(),
    sincronizaAgenda: z.boolean(),
    ativo: z.boolean(),
  })
  .partial()
  .strict()
  .refine(algumCampo, MENSAGEM_ALGUM_CAMPO)
  .meta({ id: 'AlterarTipoAtividadeEntrada' })
export type AlterarTipoAtividadeEntrada = z.infer<typeof alterarTipoAtividadeSchema>

// ---- Funis e fases (docs/funcionalidades.md, seção 6) ----

const probabilidadeSchema = z.number().int().min(0).max(100)
/** Dias sem atividade na fase para destacar a oportunidade como parada; null = sem alerta. */
const diasAlertaSchema = z.number().int().min(1).max(3650).nullable()

export const funilFaseSchema = z
  .object({
    id: z.uuid(),
    funilId: z.uuid(),
    nome: z.string(),
    cor: corDeTagSchema,
    probabilidadePadrao: z.number().int(),
    diasAlertaParada: z.number().int().nullable(),
    /** Fase inativa sai do Kanban e das escolhas; a que já teve oportunidade só se inativa (Módulo 6) */
    ativo: z.boolean(),
    ordem: z.number().int(),
  })
  .meta({ id: 'FunilFase' })
export type FunilFase = z.infer<typeof funilFaseSchema>

export const funilSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    /** Funil aberto por padrão no Kanban: sempre exatamente um por empresa */
    padrao: z.boolean(),
    ativo: z.boolean(),
    ordem: z.number().int(),
    fases: z.array(funilFaseSchema),
  })
  .meta({ id: 'Funil' })
export type Funil = z.infer<typeof funilSchema>

export const criarFaseSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    cor: corDeTagSchema.default('gray'),
    probabilidadePadrao: probabilidadeSchema.default(0),
    diasAlertaParada: diasAlertaSchema.default(null),
  })
  .strict()
  .meta({ id: 'CriarFunilFaseEntrada' })
export type CriarFaseEntrada = z.input<typeof criarFaseSchema>

export const alterarFaseSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    cor: corDeTagSchema,
    probabilidadePadrao: probabilidadeSchema,
    diasAlertaParada: diasAlertaSchema,
    ativo: z.boolean(),
  })
  .partial()
  .strict()
  .refine(algumCampo, MENSAGEM_ALGUM_CAMPO)
  .meta({ id: 'AlterarFunilFaseEntrada' })
export type AlterarFaseEntrada = z.infer<typeof alterarFaseSchema>

/** Quantas fases ATIVAS um funil pode ter (as inativas não contam): o Kanban precisa caber na tela. */
export const MAX_FASES_ATIVAS_POR_FUNIL = 6

/** Um funil nasce com ao menos uma fase (a primeira etapa do andamento). */
export const criarFunilSchema = z
  .object({
    nome: nomeDeCadastroSchema,
    fases: z.array(criarFaseSchema).min(1, 'informe ao menos uma fase').max(30),
  })
  .strict()
  .meta({ id: 'CriarFunilEntrada' })
export type CriarFunilEntrada = z.input<typeof criarFunilSchema>

/** `padrao` só aceita `true` (tornar este o funil padrão): o padrão anterior deixa de ser. */
export const alterarFunilSchema = z
  .object({ nome: nomeDeCadastroSchema, ativo: z.boolean(), padrao: z.literal(true) })
  .partial()
  .strict()
  .refine(algumCampo, MENSAGEM_ALGUM_CAMPO)
  .meta({ id: 'AlterarFunilEntrada' })
export type AlterarFunilEntrada = z.infer<typeof alterarFunilSchema>
