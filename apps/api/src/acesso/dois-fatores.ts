import type { Conexao } from '@leadtogo/db'
import { politicaExige } from '@leadtogo/shared'

import type { Vinculo } from './requisicao.js'

/**
 * Regras de 2FA (política por empresa). Quem a regra alcança:
 *  - dono ou administrador de conta: SEMPRE (vê o consolidado de todas as empresas);
 *  - os demais: conforme a política da empresa em que estão, para o papel que têm nela.
 */

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
  return ativa ? politicaExige(ativa.doisFatoresExigido, ativa.papel) : false
}

/** Alguma regra exige 2FA deste usuário (em qualquer empresa dele)? Se sim, ele não pode desativar. */
export function doisFatoresObrigatorio(dados: {
  administradorDeConta: boolean
  vinculos: Vinculo[]
}): boolean {
  return (
    dados.administradorDeConta ||
    dados.vinculos.some((v) => politicaExige(v.doisFatoresExigido, v.papel))
  )
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
  const exigentes = dados.vinculos.filter((v) => politicaExige(v.doisFatoresExigido, v.papel))
  const v = exigentes.find((e) => e.tenantId === dados.empresaAtivaId) ?? exigentes[0]
  return v ? { origem: 'empresa', empresaId: v.tenantId, papel: v.papel } : null
}

/** Para fora do pedido da API (ex.: o gancho do Better Auth que barra a desativação do 2FA). */
export async function obrigatorioParaUsuario(banco: Conexao, usuarioId: string): Promise<boolean> {
  const [administra, vinculos] = await Promise.all([
    banco.cliente`
      SELECT 1 FROM conta_administradores
      WHERE usuario_id = ${usuarioId} AND papel IN ('dono', 'administrador') LIMIT 1`,
    banco.cliente<
      {
        tenant_id: string
        papel: Vinculo['papel']
        dois_fatores_exigido: Vinculo['doisFatoresExigido']
      }[]
    >`SELECT tenant_id, papel, dois_fatores_exigido FROM app_vinculos_com_politica(${usuarioId})`,
  ])
  return doisFatoresObrigatorio({
    administradorDeConta: administra.length > 0,
    vinculos: vinculos.map((l) => ({
      tenantId: l.tenant_id,
      papel: l.papel,
      doisFatoresExigido: l.dois_fatores_exigido,
    })),
  })
}
