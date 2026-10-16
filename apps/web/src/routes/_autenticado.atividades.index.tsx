import { createFileRoute } from '@tanstack/react-router'

import { lerBusca } from '@/telas/atividades/busca'
import { ListaDeAtividades } from '@/telas/atividades/lista'

export const Route = createFileRoute('/_autenticado/atividades/')({
  validateSearch: lerBusca,
  component: ListaDeAtividades,
})
