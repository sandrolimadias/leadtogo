import type { TagGrupo } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/auth/contexto'

/** Chave dos grupos de tags de contato (o prefixo `['cadastros', 'tags']` é relido pela configuração). */
export const chaveDasTagsDeContato = ['cadastros', 'tags', 'contato'] as const

/** Os grupos de tags de contato (com as tags, inclusive as inativas). Nunca os de empresa. */
export function useGruposDeTagsDeContato() {
  const servicos = useServicos()
  return useQuery({
    queryKey: chaveDasTagsDeContato,
    retry: false,
    queryFn: async (): Promise<TagGrupo[]> => {
      const r = await servicos.tags.listar('contato')
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}

/** Há o que escolher: algum grupo ativo com alguma tag ativa. */
export const temTagsParaEscolher = (grupos: TagGrupo[] | undefined): boolean =>
  (grupos ?? []).some((g) => g.ativo && g.tags.some((t) => t.ativo))
