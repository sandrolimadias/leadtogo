import { createFileRoute, Outlet } from '@tanstack/react-router'

// Atividades: a lista com as abas Agendadas, Atrasadas e Realizadas (/atividades). Registrar e editar são janelas.
export const Route = createFileRoute('/_autenticado/atividades')({
  component: Outlet,
})
