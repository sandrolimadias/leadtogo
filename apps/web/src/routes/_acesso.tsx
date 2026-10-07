import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AcessoLayout } from '@/components/acesso/layout'

export const Route = createFileRoute('/_acesso')({
  component: () => (
    <AcessoLayout>
      <Outlet />
    </AcessoLayout>
  ),
})
