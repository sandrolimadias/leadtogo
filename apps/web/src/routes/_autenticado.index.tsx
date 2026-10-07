import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/')({
  component: () => (
    <PaginaVazia
      titulo="Dashboard"
      icone={LayoutDashboard}
      descricao="Em breve: indicadores, previsão e atividades do dia."
    />
  ),
})
