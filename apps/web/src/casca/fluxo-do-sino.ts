import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { toast } from '@leadtogo/ui/toast'

/** Endereço do fluxo em tempo real do sino (SSE; mesma origem, com o cookie da sessão). */
export const ENDERECO_DO_FLUXO = '/v1/notificacoes/fluxo'

/**
 * Tempo real do sino: uma conexão SSE enquanto o app está aberto. Cada aviso `nova` atualiza o sino e as
 * telas de chamados e mostra um aviso curto. O navegador reconecta sozinho (EventSource) e, ao reconectar,
 * relê a lista, para não perder o que chegou no intervalo. Sem EventSource (testes, navegador antigo), o
 * sino só se atualiza ao abrir.
 */
export function useFluxoDoSino(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const fonte = new EventSource(ENDERECO_DO_FLUXO)
    const atualizar = () => {
      void queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
      void queryClient.invalidateQueries({ queryKey: ['chamados'] })
    }
    fonte.addEventListener('nova', (e) => {
      try {
        const { titulo } = JSON.parse((e as MessageEvent<string>).data) as { titulo?: string }
        if (titulo) toast.info(titulo)
      } catch {
        // dado torto: o sino atualiza mesmo assim
      }
      atualizar()
    })
    fonte.addEventListener('open', atualizar)
    return () => fonte.close()
  }, [queryClient])
}
