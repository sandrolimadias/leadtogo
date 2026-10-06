import type { Request } from 'express'

/** Papel do membro na empresa ativa (enum `papel_membro`). */
export type PapelMembro = 'admin' | 'gestor' | 'vendedor'

export interface Sessao {
  sessaoId: string
  usuarioId: string
  email: string
  nome: string
  twoFactorEnabled: boolean
  /** Empresa ativa gravada na sessão (pode ser null: o usuário ainda não escolheu) */
  empresaAtivaId: string | null
}

export interface Vinculo {
  tenantId: string
  papel: PapelMembro
}

/** O que o TenantGuard decidiu para a requisição; o interceptor o executa. */
export type Acesso =
  | { tipo: 'sem-empresa' }
  | { tipo: 'empresa'; tenantId: string }
  | { tipo: 'consolidado'; tenantIds: string[] }

export interface DadosDeAcesso {
  sessao: Sessao
  vinculos: Vinculo[]
  /** Dono ou administrador de alguma conta (não confundir com admin de uma empresa) */
  administradorDeConta: boolean
  acesso: Acesso
}

export type RequisicaoAutenticada = Request & { dadosDeAcesso?: DadosDeAcesso }
