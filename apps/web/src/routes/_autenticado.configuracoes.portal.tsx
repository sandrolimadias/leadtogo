import { createFileRoute } from '@tanstack/react-router'

import { TelaDeConfiguracoesDoPortal } from '@/telas/portal/configuracao'

export const Route = createFileRoute('/_autenticado/configuracoes/portal')({
  component: TelaDeConfiguracoesDoPortal,
})
