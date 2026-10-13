import { createFileRoute } from '@tanstack/react-router'

import { NovaEmpresa } from '@/telas/empresas/nova-empresa'

export const Route = createFileRoute('/_autenticado/empresas/nova')({
  component: NovaEmpresa,
})
