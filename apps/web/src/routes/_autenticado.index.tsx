import { createFileRoute } from '@tanstack/react-router'

import { lerBusca } from '@/telas/dashboard/busca'
import { DashboardSobDemanda } from '@/telas/dashboard/preguicoso'

export const Route = createFileRoute('/_autenticado/')({
  validateSearch: lerBusca,
  component: DashboardSobDemanda,
})
