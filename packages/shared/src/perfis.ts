import { z } from 'zod'

import { alcanceSchema, chaveDeSistemaSchema, validarPermissoes } from './permissoes.js'

/** Matriz de permissões de um perfil: `chave → alcance` ou `true`, só chaves do catálogo. */
export const permissoesDoPerfilSchema = z
  .record(z.string(), z.union([alcanceSchema, z.literal(true)]))
  .superRefine((valor, ctx) => {
    for (const erro of validarPermissoes(valor)) {
      ctx.addIssue({ code: 'custom', message: erro })
    }
  })
  .meta({ id: 'PermissoesDoPerfil' })

const nomeSchema = z.string().trim().min(1, 'Informe o nome do perfil.').max(60)
const descricaoSchema = z.string().trim().max(300).nullable()

/** Um perfil de acesso da empresa ativa (Configurações → Perfis de acesso). */
export const perfilDeAcessoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    descricao: z.string().nullable(),
    /** Administrador, Gestor e Vendedor: editáveis, nunca excluídos */
    sistema: z.boolean(),
    chaveSistema: chaveDeSistemaSchema.nullable(),
    exige2fa: z.boolean(),
    ativo: z.boolean(),
    /** Membros não excluídos com este perfil (ativos e inativos) */
    membros: z.number().int(),
    permissoes: permissoesDoPerfilSchema,
  })
  .meta({ id: 'PerfilDeAcesso' })
export type PerfilDeAcesso = z.infer<typeof perfilDeAcessoSchema>

export const criarPerfilSchema = z
  .object({
    nome: nomeSchema,
    descricao: descricaoSchema.optional(),
    exige2fa: z.boolean().default(false),
    permissoes: permissoesDoPerfilSchema.default({}),
  })
  .strict()
  .meta({ id: 'CriarPerfil' })
export type CriarPerfilEntrada = z.infer<typeof criarPerfilSchema>

/** Editar: só o que vier muda. `permissoes` substitui a matriz inteira. */
export const editarPerfilSchema = z
  .object({
    nome: nomeSchema.optional(),
    descricao: descricaoSchema.optional(),
    exige2fa: z.boolean().optional(),
    ativo: z.boolean().optional(),
    permissoes: permissoesDoPerfilSchema.optional(),
  })
  .strict()
  .meta({ id: 'EditarPerfil' })
export type EditarPerfilEntrada = z.infer<typeof editarPerfilSchema>

export const duplicarPerfilSchema = z
  .object({ nome: nomeSchema })
  .strict()
  .meta({ id: 'DuplicarPerfil' })
export type DuplicarPerfilEntrada = z.infer<typeof duplicarPerfilSchema>

/** Trocar o perfil de um membro. */
export const atribuirPerfilSchema = z
  .object({ perfilId: z.uuid() })
  .strict()
  .meta({ id: 'AtribuirPerfil' })
export type AtribuirPerfilEntrada = z.infer<typeof atribuirPerfilSchema>

/** Membro com um perfil (aba "Usuários do perfil"). */
export const membroDoPerfilSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    ativo: z.boolean(),
    temLogin: z.boolean(),
  })
  .meta({ id: 'MembroDoPerfil' })
export type MembroDoPerfil = z.infer<typeof membroDoPerfilSchema>

/** Resposta da troca de perfil de um membro. */
export const perfilDoMembroSchema = z
  .object({
    membroId: z.uuid(),
    perfil: z.object({ id: z.uuid(), nome: z.string() }),
  })
  .meta({ id: 'PerfilDoMembro' })
export type PerfilDoMembro = z.infer<typeof perfilDoMembroSchema>
