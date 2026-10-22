import { createFileRoute } from '@tanstack/react-router'

import { TelaDeVisitas } from '@/telas/visitas/tela'

export const Route = createFileRoute('/_autenticado/configuracoes/visitas')({
  component: TelaDeVisitas,
})
