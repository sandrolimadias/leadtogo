import { createFileRoute } from '@tanstack/react-router'

import { TelaDeChamados } from '@/telas/chamados/lista'

export const Route = createFileRoute('/_autenticado/chamados/')({
  component: TelaDeChamados,
})
