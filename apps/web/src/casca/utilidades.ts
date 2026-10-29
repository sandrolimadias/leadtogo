import type { EmpresaDoUsuario, Me } from '@leadtogo/api-client'

import { ROTULO_DO_PAPEL } from './navegacao'

/** Nome de exibição da empresa (o fantasia, ou a razão social). */
export const nomeDaEmpresa = (e: Pick<EmpresaDoUsuario, 'nomeFantasia' | 'razaoSocial'>) =>
  e.nomeFantasia ?? e.razaoSocial

/** Nome do perfil de acesso numa empresa (o rótulo do papel, se ainda não houver perfil). */
export const perfilDaEmpresa = (e: Pick<EmpresaDoUsuario, 'perfil' | 'papel'>) =>
  e.perfil?.nome ?? ROTULO_DO_PAPEL[e.papel]

/** Perfil da pessoa na empresa ativa (ou "Administrador" se só administra a conta). */
export function papelDe(me: Me): string {
  const ativa = me.empresas.find((e) => e.ativa)
  if (ativa) return perfilDaEmpresa(ativa)
  return me.administradorDeConta ? 'Administrador' : 'Membro'
}
