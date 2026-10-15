import { createFileRoute } from '@tanstack/react-router'

import { ListaDeImportacoes } from '@/telas/importacao/lotes'

export const Route = createFileRoute('/_autenticado/importacao/')({
  component: ListaDeImportacoes,
})
