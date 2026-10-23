import { createFileRoute } from '@tanstack/react-router'

import { TelaDeRotas } from '@/telas/rotas/lista'

export const Route = createFileRoute('/_autenticado/rotas/')({
  component: TelaDeRotas,
})
