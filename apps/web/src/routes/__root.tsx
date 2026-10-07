import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import type { ContextoDoRoteador } from '@/auth/guardas'

export type { ContextoDoRoteador }

export const Route = createRootRouteWithContext<ContextoDoRoteador>()({
  component: () => <Outlet />,
})
