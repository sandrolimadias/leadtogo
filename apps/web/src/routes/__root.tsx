import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export interface ContextoDoRoteador {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<ContextoDoRoteador>()({
  component: () => <Outlet />,
})
