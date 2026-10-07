import { createFileRoute } from '@tanstack/react-router'
import { Target } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/prospeccao')({
  component: () => (
    <PaginaVazia
      titulo="Prospecção"
      icone={Target}
      descricao="Em breve: a busca na Receita para montar a carteira."
    />
  ),
})
