import type { SessaoDoPortal } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'

import { useServicos } from '@/servicos/contexto'

import { CHAVE_DA_SESSAO } from './guardas'

/**
 * A sessão como ela está agora no cache: as telas que mudam algo dela (nome, 2FA) atualizam o cache e tudo que a
 * mostra acompanha. O valor do roteador (`beforeLoad`) é só o ponto de partida.
 */
export function useSessaoAtual(inicial: SessaoDoPortal): SessaoDoPortal {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: CHAVE_DA_SESSAO,
    initialData: inicial,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await servicos.sessao.atual()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  return consulta.data
}
