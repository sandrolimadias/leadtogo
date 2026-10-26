import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'

import { routeTree } from '../routeTree.gen'
import type { ServicosDoPortal } from '../servicos/tipos'

export function criarRoteador(
  queryClient: QueryClient,
  servicos: ServicosDoPortal,
  historico?: Parameters<typeof createRouter>[0]['history'],
) {
  return createRouter({
    routeTree,
    context: { queryClient, servicos },
    defaultPreload: 'intent',
    ...(historico ? { history: historico } : {}),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof criarRoteador>
  }
}
