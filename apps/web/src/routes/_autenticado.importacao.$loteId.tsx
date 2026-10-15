import { createFileRoute } from '@tanstack/react-router'

import { AssistenteDaImportacao } from '@/telas/importacao/assistente'

export const Route = createFileRoute('/_autenticado/importacao/$loteId')({
  component: AssistenteDaImportacao,
})
