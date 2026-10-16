import { createFileRoute } from '@tanstack/react-router'

import { FichaDaOportunidade } from '@/telas/oportunidades/ficha'

export const Route = createFileRoute('/_autenticado/oportunidades/$oportunidadeId')({
  component: FichaDaOportunidade,
})
