import type { EmpresaDoUsuario, Me } from '@leadtogo/api-client'

import { toast } from '@/components/ui/toast'

import { ROTULO_DO_PAPEL } from './navegacao'

/** Nome de exibição da empresa (o fantasia, ou a razão social). */
export const nomeDaEmpresa = (e: Pick<EmpresaDoUsuario, 'nomeFantasia' | 'razaoSocial'>) =>
  e.nomeFantasia ?? e.razaoSocial

/** Papel da pessoa na empresa ativa (ou "Administrador" se só administra a conta). */
export function papelDe(me: Me): string {
  const ativa = me.empresas.find((e) => e.ativa)
  if (ativa) return ROTULO_DO_PAPEL[ativa.papel]
  return me.administradorDeConta ? 'Administrador' : 'Membro'
}

/** Ação que ainda não existe (busca global, registrar atividade): avisa em vez de ficar muda. */
export function avisarEmBreve(o_que: string) {
  toast.info(o_que, { description: 'Esta função chega nas próximas etapas.' })
}
