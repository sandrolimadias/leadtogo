import { createFileRoute } from '@tanstack/react-router'

import { TelaDePendentes } from '@/telas/visitas/campo/pendentes'

export const Route = createFileRoute('/_autenticado/visitas/')({
  component: TelaDePendentes,
})
