import { createFileRoute } from '@tanstack/react-router'

import { lerBusca } from '@/telas/busca/rota'
import { TelaDeBusca } from '@/telas/busca/pagina'

export const Route = createFileRoute('/_autenticado/busca')({
  validateSearch: lerBusca,
  component: TelaDeBusca,
})
