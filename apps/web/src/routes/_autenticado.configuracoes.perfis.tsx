import { createFileRoute } from '@tanstack/react-router'

import { TelaDePerfis } from '@/telas/perfis/tela'

export const Route = createFileRoute('/_autenticado/configuracoes/perfis')({
  component: TelaDePerfis,
})
