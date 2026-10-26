import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import type { ContextoDoRoteador } from '@/app/guardas'

export const Route = createRootRouteWithContext<ContextoDoRoteador>()({
  component: () => <Outlet />,
})
