import { createFileRoute } from '@tanstack/react-router'

import { TelaDeIntegracoes } from '@/telas/gestao/integracoes'

export const Route = createFileRoute('/_autenticado/configuracoes/integracoes')({
  component: TelaDeIntegracoes,
})
