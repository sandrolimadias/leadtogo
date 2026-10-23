import { createFileRoute } from '@tanstack/react-router'

import { TelaDoMapa } from '@/telas/mapa/pagina'

/** `?rota=nova` ou `?rota=<id>` abre o editor de rota (G4) por cima do mapa. */
export const Route = createFileRoute('/_autenticado/mapa')({
  validateSearch: (busca: Record<string, unknown>): { rota?: string } =>
    typeof busca['rota'] === 'string' && busca['rota'] !== '' ? { rota: busca['rota'] } : {},
  component: TelaDoMapa,
})
