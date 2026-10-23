import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'

/** Pessoas e perfis ativos para montar a triagem e as áreas (quem gere as áreas não precisa gerir a equipe). */
export function useOpcoesDeConfiguracao() {
  const servicos = useServicos()
  return useQuery({
    queryKey: ['chamados', 'opcoes-de-configuracao'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.opcoesDeConfiguracao()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}
