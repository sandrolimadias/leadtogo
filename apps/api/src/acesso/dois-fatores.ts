import type { Conexao } from '@leadtogo/db'
import { politicaExige } from '@leadtogo/shared'

import type { Vinculo } from './requisicao.js'
import { vinculosComPerfil } from './vinculos.service.js'

/**
 * Regras de 2FA. Quem a regra alcança:
 *  - dono ou administrador de conta: SEMPRE (vê o consolidado de todas as empresas);
 *  - os demais: o flag `exige_2fa` do perfil de acesso que têm em cada empresa (Fase 1); quem ainda não
 *    tem perfil (transição), a política antiga da empresa para o papel.
 */
export const exige2fa = (v: Vinculo): boolean =>
  v.perfilExige2fa ?? politicaExige(v.doisFatoresExigido, v.papel)

/** Falta 2FA agora? Vale a regra da EMPRESA ATIVA (e a de administrador de conta). */
export function doisFatoresPendente(dados: {
  twoFactorEnabled: boolean
  administradorDeConta: boolean
  vinculos: Vinculo[]
  empresaAtivaId: string | null
}): boolean {
  if (dados.twoFactorEnabled) return false
  if (dados.administradorDeConta) return true
  const ativa = dados.vinculos.find((v) => v.tenantId === dados.empresaAtivaId)
  return ativa ? exige2fa(ativa) : false
}

/** Alguma regra exige 2FA deste usuário (em qualquer empresa dele)? Se sim, ele não pode desativar. */
export function doisFatoresObrigatorio(dados: {
  administradorDeConta: boolean
  vinculos: Vinculo[]
}): boolean {
  return dados.administradorDeConta || dados.vinculos.some(exige2fa)
}

/**
 * Por que o 2FA é obrigatório para esta pessoa (o primeiro motivo): administrador da conta, ou a política
 * de uma empresa dela para o papel que ela tem lá (a empresa ativa vem primeiro). Null se não é obrigatório.
 */
export function motivoDoisFatores(dados: {
  administradorDeConta: boolean
  vinculos: Vinculo[]
  empresaAtivaId?: string | null
}): {
  origem: 'conta' | 'empresa'
  empresaId: string | null
  papel: Vinculo['papel'] | null
} | null {
  if (dados.administradorDeConta) return { origem: 'conta', empresaId: null, papel: null }
  const exigentes = dados.vinculos.filter(exige2fa)
  const v = exigentes.find((e) => e.tenantId === dados.empresaAtivaId) ?? exigentes[0]
  return v ? { origem: 'empresa', empresaId: v.tenantId, papel: v.papel } : null
}

/** Para fora do pedido da API (ex.: o gancho do Better Auth que barra a desativação do 2FA). */
export async function obrigatorioParaUsuario(banco: Conexao, usuarioId: string): Promise<boolean> {
  const [administra, vinculos] = await Promise.all([
    banco.cliente`
      SELECT 1 FROM conta_administradores
      WHERE usuario_id = ${usuarioId} AND papel IN ('dono', 'administrador') LIMIT 1`,
    vinculosComPerfil(banco, usuarioId),
  ])
  return doisFatoresObrigatorio({ administradorDeConta: administra.length > 0, vinculos })
}
