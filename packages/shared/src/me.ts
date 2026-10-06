import { z } from 'zod'

/** Papel do membro em uma empresa. */
export const papelMembroSchema = z.enum(['admin', 'gestor', 'vendedor'])
export type PapelMembro = z.infer<typeof papelMembroSchema>

/** Situação da empresa (`situacao_tenant`). Só `teste` e `ativo` podem ser usadas. */
export type SituacaoEmpresa = 'teste' | 'ativo' | 'suspenso' | 'cancelado'

/** Uma empresa em que o usuário é membro, com o papel dele nela (GET /v1/me). */
export interface EmpresaDoUsuario {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  papel: PapelMembro
  situacao: SituacaoEmpresa
  /** É a empresa ativa da sessão */
  ativa: boolean
}

/** Resposta de GET /v1/me. */
export interface MeResposta {
  usuario: {
    id: string
    nome: string
    email: string
    emailVerificado: boolean
    twoFactorEnabled: boolean
  }
  empresas: EmpresaDoUsuario[]
  /** Empresa ativa da sessão; null até o usuário escolher (POST /v1/sessao/empresa-ativa) */
  empresaAtivaId: string | null
  /** Dono ou administrador de alguma conta: tem o painel consolidado */
  administradorDeConta: boolean
  /**
   * Administrador (de empresa ou de conta) que ainda não ativou o 2FA: até ativar, a API só deixa
   * passar este endpoint, as rotas de 2FA e o logout.
   */
  doisFatoresPendente: boolean
}

/** Corpo de POST /v1/sessao/empresa-ativa. */
export const empresaAtivaSchema = z.object({ empresaId: z.uuid('empresa inválida') }).strict()
export type EmpresaAtivaEntrada = z.infer<typeof empresaAtivaSchema>

/** Resposta de POST /v1/sessao/empresa-ativa. */
export interface EmpresaAtivaResposta {
  empresaAtivaId: string
  empresa: EmpresaDoUsuario
}
