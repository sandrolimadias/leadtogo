import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * Tempo real do sino (SSE): cada evento `nova` é um aviso novo; o portal relê o que depende dele. O navegador
 * reconecta sozinho e, ao reconectar, relemos tudo (pode ter perdido eventos). Sem EventSource (testes), não faz nada.
 */
export function useFluxoDoSino(aoChegar?: (aviso: { titulo?: string }) => void): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const fonte = new EventSource('/v1/portal/notificacoes/fluxo')
    const reler = () => {
      void queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
      void queryClient.invalidateQueries({ queryKey: ['inicio'] })
      void queryClient.invalidateQueries({ queryKey: ['chamados'] })
    }
    fonte.addEventListener('nova', (evento) => {
      reler()
      try {
        aoChegar?.(JSON.parse((evento as MessageEvent<string>).data) as { titulo?: string })
      } catch {
        aoChegar?.({})
      }
    })
    fonte.addEventListener('open', reler)
    return () => fonte.close()
  }, [queryClient, aoChegar])
}
