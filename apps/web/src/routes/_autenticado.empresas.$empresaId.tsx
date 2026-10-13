import { createFileRoute } from '@tanstack/react-router'

import { FichaDaEmpresa } from '@/telas/empresas/ficha'

export const Route = createFileRoute('/_autenticado/empresas/$empresaId')({
  component: FichaDaEmpresa,
})
