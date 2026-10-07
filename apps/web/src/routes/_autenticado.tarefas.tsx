import { createFileRoute } from '@tanstack/react-router'
import { SquareKanban } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/tarefas')({
  component: () => (
    <PaginaVazia
      titulo="Tarefas"
      icone={SquareKanban}
      descricao="Em breve: o seu quadro de tarefas."
    />
  ),
})
