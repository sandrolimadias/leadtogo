import { z } from 'zod'

import { papelMembroSchema } from './me.js'
import { SENHA_MAX, SENHA_MIN } from './primeiro-acesso.js'

/** Token do convite: aleatório (32 bytes em base64url = 43 caracteres), enviado só por e-mail. */
const tokenSchema = z.string().trim().min(20, 'convite inválido').max(200, 'convite inválido')

/** POST /v1/convites (administrador): convida um e-mail para a empresa ativa com um papel. */
export const criarConviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email('e-mail inválido')),
    papel: papelMembroSchema,
  })
  .strict()
  .meta({ id: 'CriarConviteEntrada' })
export type CriarConviteEntrada = z.infer<typeof criarConviteSchema>

/** POST /v1/convites/consultar (público): o token vai no corpo, nunca na URL (a URL vai para logs). */
export const consultarConviteSchema = z
  .object({ token: tokenSchema })
  .strict()
  .meta({ id: 'ConsultarConviteEntrada' })
export type ConsultarConviteEntrada = z.infer<typeof consultarConviteSchema>

/**
 * POST /v1/convites/aceitar (público). Quem ainda não tem conta informa nome e senha; quem já tem
 * entra com a conta (cookie de sessão) e manda só o token.
 */
export const aceitarConviteSchema = z
  .object({
    token: tokenSchema,
    nome: z.string().trim().min(2, 'informe o nome').max(120).optional(),
    senha: z
      .string()
      .min(SENHA_MIN, `a senha deve ter ao menos ${SENHA_MIN} caracteres`)
      .max(SENHA_MAX, `a senha deve ter no máximo ${SENHA_MAX} caracteres`)
      .optional(),
  })
  .strict()
  .meta({ id: 'AceitarConviteEntrada' })
export type AceitarConviteEntrada = z.infer<typeof aceitarConviteSchema>

/** Convite pendente, como o administrador o vê (nunca inclui o token). */
export const conviteResumoSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    papel: papelMembroSchema,
    expiraEm: z.iso.datetime(),
    criadoEm: z.iso.datetime(),
    /** `expirado` ainda aparece na lista para o administrador reenviar ou cancelar */
    situacao: z.enum(['pendente', 'expirado']),
  })
  .meta({ id: 'ConviteResumo' })
export type ConviteResumo = z.infer<typeof conviteResumoSchema>

/** Resposta de POST /v1/convites. */
export const conviteCriadoSchema = conviteResumoSchema
  .extend({
    /** O e-mail saiu? (false quando o SMTP não está configurado: o token não é devolvido em hipótese alguma) */
    emailEnviado: z.boolean(),
  })
  .meta({ id: 'ConviteCriado' })
export type ConviteCriado = z.infer<typeof conviteCriadoSchema>

/** Resposta de POST /v1/convites/consultar: o que o convidado vê antes de aceitar. */
export const conviteConsultaSchema = z
  .object({
    empresa: z.object({ razaoSocial: z.string(), nomeFantasia: z.string().nullable() }),
    email: z.string(),
    papel: papelMembroSchema,
    expiraEm: z.iso.datetime(),
    /** Já existe conta com este e-mail: o convidado entra e aceita; senão, informa nome e senha */
    contaExistente: z.boolean(),
  })
  .meta({ id: 'ConviteConsulta' })
export type ConviteConsulta = z.infer<typeof conviteConsultaSchema>

/** Resposta de POST /v1/convites/aceitar. */
export const conviteAceitoSchema = z
  .object({
    tenantId: z.uuid(),
    membroId: z.uuid(),
    usuarioId: z.uuid(),
    /** A conta foi criada agora (o e-mail já vale como confirmado: o convite chegou nele) */
    contaCriada: z.boolean(),
  })
  .meta({ id: 'ConviteAceito' })
export type ConviteAceito = z.infer<typeof conviteAceitoSchema>

/** Item de GET /v1/membros. O e-mail só aparece para administradores e gestores. */
export const membroDaEquipeSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    cargo: z.string().nullable(),
    email: z.string().nullable().optional(),
    papel: papelMembroSchema,
    ativo: z.boolean(),
    /** Tem acesso ao sistema (false = vendedor externo, sem login) */
    temLogin: z.boolean(),
    cor: z.string().nullable(),
    /**
     * Data (AAAA-MM-DD, fuso de São Paulo) da sessão mais recente da pessoa: aproximada (a sessão só
     * se atualiza uma vez por dia). Só para administradores; null se nunca entrou ou sem login.
     */
    ultimoAcesso: z.iso.date().nullable().optional(),
  })
  .meta({ id: 'MembroDaEquipe' })
export type MembroDaEquipe = z.infer<typeof membroDaEquipeSchema>

/** PATCH /v1/membros/:id (administrador): muda o papel e/ou ativa e desativa o membro. */
export const alterarMembroSchema = z
  .object({ papel: papelMembroSchema.optional(), ativo: z.boolean().optional() })
  .strict()
  .refine((v) => v.papel !== undefined || v.ativo !== undefined, 'informe o papel ou a situação')
  .meta({ id: 'AlterarMembroEntrada' })
export type AlterarMembroEntrada = z.infer<typeof alterarMembroSchema>
