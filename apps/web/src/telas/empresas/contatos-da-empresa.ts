import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'

/** A consulta dos contatos de uma empresa, compartilhada entre a aba e o número do rótulo da aba. */
export function useContatosDaEmpresa(empresaId: string) {
  const servicos = useServicos()
  return useQuery({
    queryKey: ['contatos', 'da-empresa', empresaId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.contatos.daEmpresa(empresaId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}
