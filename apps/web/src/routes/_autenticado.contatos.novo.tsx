import { createFileRoute } from '@tanstack/react-router'

import { NovoContato } from '@/telas/contatos/novo-contato'

export const Route = createFileRoute('/_autenticado/contatos/novo')({
  component: NovoContato,
})
