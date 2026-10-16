import { createFileRoute } from '@tanstack/react-router'

import { lerBusca } from '@/telas/oportunidades/busca'
import { PaginaDeOportunidades } from '@/telas/oportunidades/pagina'

export const Route = createFileRoute('/_autenticado/oportunidades/')({
  validateSearch: lerBusca,
  component: PaginaDeOportunidades,
})
