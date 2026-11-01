import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { toast } from '@leadtogo/ui/toast'

import { CHAVE_DA_SESSAO } from '@/app/guardas'
import { useServicos } from '@/servicos/contexto'

export const CHAVE_DAS_EMPRESAS = ['empresas-do-acesso'] as const

/** As empresas-clientes que o mesmo e-mail acessa (Fase 4B, B-1). */
export function useEmpresasDoAcesso() {
  const servicos = useServicos()
  return useQuery({
    queryKey: CHAVE_DAS_EMPRESAS,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await servicos.empresas.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
}

/**
 * Troca de empresa: abre a sessão no outro acesso e limpa tudo o que estava em cache (nada da empresa anterior
 * pode aparecer na nova).
 */
export function useTrocarEmpresa() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  return async (acessoId: string): Promise<boolean> => {
    const r = await servicos.empresas.trocar(acessoId)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return false
    }
    queryClient.clear()
    queryClient.setQueryData(CHAVE_DA_SESSAO, r.dados)
    await navegar({ to: r.dados.segundoFatorPendente ? '/verificacao' : '/' })
    toast.success(`Você está em ${r.dados.empresaCliente.nome}`)
    return true
  }
}
