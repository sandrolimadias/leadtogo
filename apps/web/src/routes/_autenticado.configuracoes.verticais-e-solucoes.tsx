import { createFileRoute } from '@tanstack/react-router'

import { TelaDeVerticaisESolucoes } from '@/telas/cadastros/verticais-e-solucoes'

export const Route = createFileRoute('/_autenticado/configuracoes/verticais-e-solucoes')({
  component: TelaDeVerticaisESolucoes,
})
