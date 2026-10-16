import { createFileRoute, Outlet } from '@tanstack/react-router'

// Oportunidades: o funil em Kanban ou lista (/oportunidades) e a ficha (/oportunidades/:id).
export const Route = createFileRoute('/_autenticado/oportunidades')({
  component: Outlet,
})
