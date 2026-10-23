import { createFileRoute, Outlet } from '@tanstack/react-router'

// Visitas no campo (G3b): os relatórios pendentes (/visitas) e o relatório (/visitas/:id).
export const Route = createFileRoute('/_autenticado/visitas')({
  component: Outlet,
})
