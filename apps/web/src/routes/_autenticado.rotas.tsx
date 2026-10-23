import { createFileRoute, Outlet } from '@tanstack/react-router'

// Rotas (G4): a lista (/rotas) e a rota, com a execução no celular (/rotas/:id). O editor fica no mapa.
export const Route = createFileRoute('/_autenticado/rotas')({
  component: Outlet,
})
