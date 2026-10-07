import { useQueryClient } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'
import { toast } from '@/components/ui/toast'

/**
 * Troca a empresa ativa da sessão. Tudo o que depende da empresa (preferências, listas) é recarregado; a
 * tela atual continua aberta. Devolve se deu certo.
 */
export function useTrocarEmpresa() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  return async (empresaId: string, opcoes: { avisar?: boolean } = {}): Promise<boolean> => {
    const r = await servicos.trocarEmpresa(empresaId)
    if (!r.ok) {
      toast.error('Não foi possível trocar de empresa', { description: r.erro.mensagem })
      return false
    }
    await queryClient.invalidateQueries()
    if (opcoes.avisar !== false) toast.info('Empresa ativa trocada')
    return true
  }
}

export const VERSAO_DO_APP = (import.meta.env['VITE_APP_VERSION'] as string | undefined) ?? 'dev'
