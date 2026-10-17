import { createFileRoute } from '@tanstack/react-router'

import { TelaDeGeolocalizacao } from '@/telas/geolocalizacao/pagina'

export const Route = createFileRoute('/_autenticado/geolocalizacao')({
  component: TelaDeGeolocalizacao,
})
