import { createFileRoute } from '@tanstack/react-router'

import { lerBusca } from '@/telas/contatos/busca'
import { ListaDeContatos } from '@/telas/contatos/lista'

export const Route = createFileRoute('/_autenticado/contatos/')({
  validateSearch: lerBusca,
  component: ListaDeContatos,
})
