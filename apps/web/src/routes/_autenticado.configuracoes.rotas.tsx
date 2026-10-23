import { createFileRoute } from '@tanstack/react-router'

import { TelaDeConfiguracoesDeRotas } from '@/telas/rotas/configuracoes'

export const Route = createFileRoute('/_autenticado/configuracoes/rotas')({
  component: TelaDeConfiguracoesDeRotas,
})
