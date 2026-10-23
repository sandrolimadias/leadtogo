import { createFileRoute } from '@tanstack/react-router'

import { TelaDaRota } from '@/telas/rotas/rota'

export const Route = createFileRoute('/_autenticado/rotas/$rotaId')({
  component: TelaDaRota,
})
