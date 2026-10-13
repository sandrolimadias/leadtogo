import { createFileRoute } from '@tanstack/react-router'

import { FichaDoContato } from '@/telas/contatos/ficha'

export const Route = createFileRoute('/_autenticado/contatos/$contatoId')({
  component: FichaDoContato,
})
