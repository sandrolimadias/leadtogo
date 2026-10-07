import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/')({
  component: () => (
    <PaginaVazia
      titulo="Dashboard"
      icone={LayoutDashboard}
      descricao="Indicadores, previsão e atividades do dia chegam na etapa MVP · Dashboard."
    />
  ),
})
