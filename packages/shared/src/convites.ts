import { z } from 'zod'

import { papelMembroSchema, type PapelMembro } from './me.js'
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
export type CriarConviteEntrada = z.infer<typeof criarConviteSchema>

/** POST /v1/convites/consultar (público): o token vai no corpo, nunca na URL (a URL vai para logs). */
export const consultarConviteSchema = z.object({ token: tokenSchema }).strict()
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
export type AceitarConviteEntrada = z.infer<typeof aceitarConviteSchema>

/** Convite pendente, como o administrador o vê (nunca inclui o token). */
export interface ConviteResumo {
  id: string
  email: string
  papel: PapelMembro
  expiraEm: string
  criadoEm: string
  /** `expirado` ainda aparece na lista para o administrador reenviar ou cancelar */
  situacao: 'pendente' | 'expirado'
}

/** Resposta de POST /v1/convites. */
export interface ConviteCriado extends ConviteResumo {
  /** O e-mail saiu? (false quando o SMTP não está configurado: o token não é devolvido em hipótese alguma) */
  emailEnviado: boolean
}

/** Resposta de POST /v1/convites/consultar: o que o convidado vê antes de aceitar. */
export interface ConviteConsulta {
  empresa: { razaoSocial: string; nomeFantasia: string | null }
  email: string
  papel: PapelMembro
  expiraEm: string
  /** Já existe conta com este e-mail: o convidado entra e aceita; senão, informa nome e senha */
  contaExistente: boolean
}

/** Resposta de POST /v1/convites/aceitar. */
export interface ConviteAceito {
  tenantId: string
  membroId: string
  usuarioId: string
  /** A conta foi criada agora (o e-mail já vale como confirmado: o convite chegou nele) */
  contaCriada: boolean
}

/** Item de GET /v1/membros. O e-mail só aparece para administradores e gestores. */
export interface MembroDaEquipe {
  id: string
  nome: string
  cargo: string | null
  email?: string | null
  papel: PapelMembro
  ativo: boolean
  /** Tem acesso ao sistema (false = vendedor externo, sem login) */
  temLogin: boolean
  cor: string | null
}
