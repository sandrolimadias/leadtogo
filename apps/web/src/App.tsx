import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'

import { criarQueryClient } from './app/consulta'
import { criarRoteador } from './app/roteador'
import { Toaster } from './components/ui/toaster'
import { TooltipProvider } from './components/ui/tooltip'

export function App() {
  const [queryClient] = useState(criarQueryClient)
  const [roteador] = useState(() => criarRoteador(queryClient))
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={roteador} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
