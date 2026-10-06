import { z } from 'zod'

/** Papel do membro em uma empresa. */
export const papelMembroSchema = z.enum(['admin', 'gestor', 'vendedor'])
export type PapelMembro = z.infer<typeof papelMembroSchema>

/** Situação da empresa (`situacao_tenant`). Só `teste` e `ativo` podem ser usadas. */
export const situacaoEmpresaSchema = z.enum(['teste', 'ativo', 'suspenso', 'cancelado'])
export type SituacaoEmpresa = z.infer<typeof situacaoEmpresaSchema>

/** Uma empresa em que o usuário é membro, com o papel dele nela (GET /v1/me). */
export const empresaDoUsuarioSchema = z
  .object({
    id: z.uuid(),
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
    papel: papelMembroSchema,
    situacao: situacaoEmpresaSchema,
    /** É a empresa ativa da sessão */
    ativa: z.boolean(),
  })
  .meta({ id: 'EmpresaDoUsuario' })
export type EmpresaDoUsuario = z.infer<typeof empresaDoUsuarioSchema>

/** Resposta de GET /v1/me. */
export const meRespostaSchema = z
  .object({
    usuario: z.object({
      id: z.uuid(),
      nome: z.string(),
      email: z.string(),
      emailVerificado: z.boolean(),
      twoFactorEnabled: z.boolean(),
    }),
    empresas: z.array(empresaDoUsuarioSchema),
    /** Empresa ativa da sessão; null até o usuário escolher (POST /v1/sessao/empresa-ativa) */
    empresaAtivaId: z.uuid().nullable(),
    /** Dono ou administrador de alguma conta: tem o painel consolidado */
    administradorDeConta: z.boolean(),
    /**
     * Administrador (de empresa ou de conta) que ainda não ativou o 2FA: até ativar, a API só deixa
     * passar este endpoint, as rotas de 2FA e o logout.
     */
    doisFatoresPendente: z.boolean(),
  })
  .meta({ id: 'MeResposta' })
export type MeResposta = z.infer<typeof meRespostaSchema>

/** Corpo de POST /v1/sessao/empresa-ativa. */
export const empresaAtivaSchema = z
  .object({ empresaId: z.uuid('empresa inválida') })
  .strict()
  .meta({ id: 'EmpresaAtivaEntrada' })
export type EmpresaAtivaEntrada = z.infer<typeof empresaAtivaSchema>

/** Resposta de POST /v1/sessao/empresa-ativa. */
export const empresaAtivaRespostaSchema = z
  .object({ empresaAtivaId: z.uuid(), empresa: empresaDoUsuarioSchema })
  .meta({ id: 'EmpresaAtivaResposta' })
export type EmpresaAtivaResposta = z.infer<typeof empresaAtivaRespostaSchema>
