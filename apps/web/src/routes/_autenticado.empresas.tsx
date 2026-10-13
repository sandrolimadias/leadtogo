import { createFileRoute, Outlet } from '@tanstack/react-router'

// Empresas: a lista (/empresas), o cadastro (/empresas/nova) e a ficha (/empresas/:id).
export const Route = createFileRoute('/_autenticado/empresas')({
  component: Outlet,
})
