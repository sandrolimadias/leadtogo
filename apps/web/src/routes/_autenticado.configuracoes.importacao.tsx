import { createFileRoute } from '@tanstack/react-router'

import { TelaDePerfisDeImportacao } from '@/telas/importacao/perfis'

export const Route = createFileRoute('/_autenticado/configuracoes/importacao')({
  component: TelaDePerfisDeImportacao,
})
