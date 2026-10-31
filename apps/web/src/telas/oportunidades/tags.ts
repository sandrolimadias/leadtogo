import type { TagGrupo } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'

/** Chave dos grupos de tags de oportunidade (o prefixo `['cadastros', 'tags']` é relido pela configuração). */
export const chaveDasTagsDeOportunidade = ['cadastros', 'tags', 'oportunidade'] as const

/** Os grupos de tags de oportunidade (com as tags, inclusive as inativas). Nunca os de empresa nem os de contato. */
export function useGruposDeTagsDeOportunidade() {
  const servicos = useServicos()
  return useQuery({
    queryKey: chaveDasTagsDeOportunidade,
    retry: false,
    queryFn: async (): Promise<TagGrupo[]> => {
      const r = await servicos.tags.listar('oportunidade')
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}
