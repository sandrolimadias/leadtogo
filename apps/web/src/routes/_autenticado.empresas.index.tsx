import { createFileRoute } from '@tanstack/react-router'

import { lerBusca } from '@/telas/empresas/busca'
import { ListaDeEmpresas } from '@/telas/empresas/lista'

export const Route = createFileRoute('/_autenticado/empresas/')({
  validateSearch: lerBusca,
  component: ListaDeEmpresas,
})
