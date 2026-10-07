import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'

import { criarQueryClient } from './app/consulta'
import { criarRoteador } from './app/roteador'
import { ServicosProvider } from './auth/contexto'
import { servicosReais } from './auth/servicos'
import type { ServicosDeAcesso } from './auth/tipos'
import { Toaster } from './components/ui/toaster'
import { TooltipProvider } from './components/ui/tooltip'

/** `servicos` e `historico` só mudam nos testes (serviços de mentira e histórico em memória). */
export function App({
  servicos = servicosReais,
  historico,
}: {
  servicos?: ServicosDeAcesso
  historico?: Parameters<typeof criarRoteador>[2]
}) {
  const [queryClient] = useState(criarQueryClient)
  const [roteador] = useState(() => criarRoteador(queryClient, servicos, historico))
  return (
    <QueryClientProvider client={queryClient}>
      <ServicosProvider servicos={servicos}>
        <TooltipProvider>
          <RouterProvider router={roteador} />
          <Toaster />
        </TooltipProvider>
      </ServicosProvider>
    </QueryClientProvider>
  )
}
