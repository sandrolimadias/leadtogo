import type { PermissoesDoPerfil, PoliticaDoisFatores } from '@leadtogo/shared'
import type { Request } from 'express'

/** Papel do membro na empresa ativa (enum `papel_membro`). Legado até a contração: vale o perfil de acesso. */
export type PapelMembro = 'admin' | 'gestor' | 'vendedor'

/** O membro da empresa ativa, com o perfil de acesso carregado na transação da requisição. */
export interface MembroDaRequisicao {
  id: string
  /** Legado: só as rotas ainda não migradas para `@Permissao` o leem (até o commit 6 da Fase 1) */
  papel: PapelMembro
  /** Perfil efetivo (o do membro, ou o de sistema do papel enquanto o membro não tem um); null = nenhum */
  perfil: { id: string; nome: string } | null
  /** Permissões do perfil: `chave → alcance` ou `true`. Sem perfil, vazio (nenhuma permissão). */
  permissoes: PermissoesDoPerfil
}

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
  /** Política ANTIGA de 2FA da empresa: só vale para quem ainda não tem perfil (transição) */
  doisFatoresExigido: PoliticaDoisFatores
  /** O perfil de acesso do membro exige 2FA? `null` = o membro ainda não tem perfil */
  perfilExige2fa: boolean | null
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
