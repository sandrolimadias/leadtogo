import { createFileRoute } from '@tanstack/react-router'

import { TelaDeTags } from '@/telas/cadastros/tags'

export const Route = createFileRoute('/_autenticado/configuracoes/tags')({
  component: TelaDeTags,
})
