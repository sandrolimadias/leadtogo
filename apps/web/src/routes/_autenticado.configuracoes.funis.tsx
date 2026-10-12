import { createFileRoute } from '@tanstack/react-router'

import { TelaDeFunis } from '@/telas/cadastros/funis'

export const Route = createFileRoute('/_autenticado/configuracoes/funis')({
  component: TelaDeFunis,
})
