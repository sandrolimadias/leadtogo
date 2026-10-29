import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'

/** A consulta dos chamados abertos da empresa: a aba usa a lista; a ficha, o total no rótulo da aba. */
export function useChamadosAbertosDaEmpresa(empresaId: string, ligado: boolean) {
  const servicos = useServicos()
  return useQuery({
    queryKey: ['chamados', 'da-empresa', empresaId],
    enabled: ligado,
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.listar({
        empresaClienteId: empresaId,
        abertos: 'true',
        porPagina: 100,
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}
