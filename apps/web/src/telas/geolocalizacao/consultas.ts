import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'

export const chaveDoResumo = ['geolocalizacao', 'resumo'] as const
export const chaveDasRegioes = (uf: string | undefined) =>
  ['geolocalizacao', 'regioes', uf] as const

/** As regiões da UF (microrregiões oficiais e as do administrador), compartilhadas pelas abas. */
export function useRegioes(uf: string | undefined) {
  const servicos = useServicos()
  return useQuery({
    queryKey: chaveDasRegioes(uf),
    enabled: uf !== undefined,
    retry: false,
    queryFn: async () => {
      const r = await servicos.geolocalizacao.regioes.listar(uf)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}
