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
  })
  .strict()
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
  .object({ nome: nomeDeCadastroSchema, cor: corDeTagSchema, ativo: z.boolean() })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarTagEntrada' })
export type AlterarTagEntrada = z.infer<typeof alterarTagSchema>
