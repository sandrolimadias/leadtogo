import { z } from 'zod'

import { cnpjValido, normalizarCnpj } from './cnpj.js'

/** Limites de senha: os mesmos da API (Better Auth) e do formulário. */
export const SENHA_MIN = 10
export const SENHA_MAX = 128

/** Primeiro acesso: cria a conta dona, a primeira empresa e o administrador (POST /v1/primeiro-acesso). */
export const primeiroAcessoSchema = z
  .object({
    nome: z.string().trim().min(2, 'informe o nome').max(120),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email('e-mail inválido')),
    senha: z
      .string()
      .min(SENHA_MIN, `a senha deve ter ao menos ${SENHA_MIN} caracteres`)
      .max(SENHA_MAX, `a senha deve ter no máximo ${SENHA_MAX} caracteres`),
    empresa: z.object({
      razaoSocial: z.string().trim().min(2, 'informe a razão social').max(200),
      nomeFantasia: z.string().trim().max(200).optional(),
      /** Opcional; se vier, é validado (numérico ou alfanumérico) e guardado sem máscara */
      cnpj: z
        .string()
        .trim()
        .min(1)
        .optional()
        .refine((v) => v === undefined || cnpjValido(v), 'CNPJ inválido')
        .transform((v) => (v === undefined ? undefined : normalizarCnpj(v))),
    }),
    /** Nome da conta dona (cobrança); se omitido, usa a razão social */
    contaNome: z.string().trim().min(2).max(200).optional(),
  })
  .strict()
  .meta({ id: 'PrimeiroAcessoEntrada' })

export type PrimeiroAcessoEntrada = z.input<typeof primeiroAcessoSchema>
export type PrimeiroAcesso = z.output<typeof primeiroAcessoSchema>

/** Resposta do primeiro acesso. */
export const primeiroAcessoResultadoSchema = z
  .object({
    usuarioId: z.uuid(),
    contaId: z.uuid(),
    tenantId: z.uuid(),
    membroId: z.uuid(),
    /** O e-mail precisa ser confirmado antes de entrar (VERIFICACAO_EMAIL ligada) */
    verificacaoEmailPendente: z.boolean(),
  })
  .meta({ id: 'PrimeiroAcessoResultado' })
export type PrimeiroAcessoResultado = z.infer<typeof primeiroAcessoResultadoSchema>

/** Resposta de GET /v1/primeiro-acesso/estado: o cadastro da primeira conta está aberto? */
export const primeiroAcessoEstadoSchema = z
  .object({ aberto: z.boolean() })
  .meta({ id: 'PrimeiroAcessoEstado' })
export type PrimeiroAcessoEstado = z.infer<typeof primeiroAcessoEstadoSchema>

/** Resposta de GET /v1/acesso/opcoes: o que a tela de login pode oferecer. */
export const opcoesDeAcessoSchema = z
  .object({ loginGoogle: z.boolean() })
  .meta({ id: 'OpcoesDeAcesso' })
export type OpcoesDeAcesso = z.infer<typeof opcoesDeAcessoSchema>
