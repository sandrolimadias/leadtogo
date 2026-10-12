import { z } from 'zod'

import { cnpjValido, normalizarCnpj } from './cnpj.js'
import { empresaDoUsuarioSchema } from './me.js'

/**
 * POST /v1/empresas (administrador da conta): cria uma empresa nova na conta. Só a razão social é
 * obrigatória. O CNPJ, se vier, é validado (numérico ou alfanumérico, com dígitos verificadores) e
 * guardado sem máscara.
 */
export const criarEmpresaSchema = z
  .object({
    razaoSocial: z.string().trim().min(2, 'informe a razão social').max(200),
    nomeFantasia: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : undefined)),
    cnpj: z
      .string()
      .trim()
      .min(1)
      .optional()
      .refine((v) => v === undefined || cnpjValido(v), 'CNPJ inválido')
      .transform((v) => (v === undefined ? undefined : normalizarCnpj(v))),
    /** Obrigatória só quando a pessoa administra mais de uma conta */
    contaId: z.uuid().optional(),
  })
  .strict()
  .meta({ id: 'CriarEmpresaEntrada' })
export type CriarEmpresaEntrada = z.input<typeof criarEmpresaSchema>
export type CriarEmpresa = z.output<typeof criarEmpresaSchema>

/** Resposta de POST /v1/empresas. A empresa NÃO vira a ativa sozinha: o front troca em seguida. */
export const empresaCriadaSchema = z
  .object({
    empresa: empresaDoUsuarioSchema,
    /** O CNPJ já está em outra empresa DA MESMA CONTA (aviso; nunca olha outras contas) */
    cnpjRepetidoNaConta: z.boolean(),
  })
  .meta({ id: 'EmpresaCriada' })
export type EmpresaCriada = z.infer<typeof empresaCriadaSchema>
