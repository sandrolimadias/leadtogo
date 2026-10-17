import { createFileRoute } from '@tanstack/react-router'

import { TelaDoMapa } from '@/telas/mapa/pagina'

export const Route = createFileRoute('/_autenticado/mapa')({
  component: TelaDoMapa,
})
