import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'

/** Áreas ativas para escolher (ou "não sei", que manda para a triagem). */
export function useAreasDeAtendimento() {
  const servicos = useServicos()
  return useQuery({
    queryKey: ['chamados', 'areas'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.areas.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}
