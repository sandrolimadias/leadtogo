import { createFileRoute, Outlet } from '@tanstack/react-router'

// Contatos: a lista (/contatos), o cadastro (/contatos/novo) e a edição (/contatos/:id/editar).
export const Route = createFileRoute('/_autenticado/contatos')({
  component: Outlet,
})
