import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Toaster } from '@leadtogo/ui/toaster'
import { TooltipProvider } from '@leadtogo/ui/tooltip'

import { criarQueryClient } from './app/consulta'
import { criarRoteador } from './app/roteador'
import { useDispositivo } from './casca/dispositivo'
import { ServicosProvider } from './servicos/contexto'
import { servicosReais } from './servicos/reais'
import type { ServicosDoPortal } from './servicos/tipos'

/** `servicos` e `historico` só mudam nos testes (serviços de mentira e histórico em memória). */
export function App({
  servicos = servicosReais,
  historico,
  aoCriarRoteador,
}: {
  servicos?: ServicosDoPortal
  historico?: Parameters<typeof criarRoteador>[2]
  aoCriarRoteador?: (roteador: ReturnType<typeof criarRoteador>) => void
}) {
  const [queryClient] = useState(criarQueryClient)
  const [roteador] = useState(() => {
    const novo = criarRoteador(queryClient, servicos, historico)
    aoCriarRoteador?.(novo)
    return novo
  })
  return (
    <QueryClientProvider client={queryClient}>
      <ServicosProvider servicos={servicos}>
        <TooltipProvider>
          <RouterProvider router={roteador} />
          <AvisosDaTela />
          <DensidadePorDispositivo />
        </TooltipProvider>
      </ServicosProvider>
    </QueryClientProvider>
  )
}

/** Os avisos sobem acima da barra inferior no celular. */
function AvisosDaTela() {
  return <Toaster celular={useDispositivo() === 'celular'} />
}

/**
 * `data-density` no <html> conforme o aparelho: toque (44 px, fonte 16 px) no celular e no tablet, padrão
 * (36 px) no desktop. No <html> vale também para diálogos e menus, que ficam fora da casca.
 */
function DensidadePorDispositivo() {
  const dispositivo = useDispositivo()
  useEffect(() => {
    const raiz = document.documentElement
    if (dispositivo === 'desktop') raiz.removeAttribute('data-density')
    else raiz.setAttribute('data-density', 'touch')
    return () => raiz.removeAttribute('data-density')
  }, [dispositivo])
  return null
}
