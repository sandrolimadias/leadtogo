import { createFileRoute } from '@tanstack/react-router'

import { RelatorioDaRota } from '@/telas/visitas/campo/relatorio'

export const Route = createFileRoute('/_autenticado/visitas/$relatorioId')({
  component: RelatorioDaRota,
})
