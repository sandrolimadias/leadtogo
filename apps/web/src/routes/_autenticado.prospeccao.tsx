import { createFileRoute } from '@tanstack/react-router'
import { Target } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/prospeccao')({
  component: () => (
    <PaginaVazia
      titulo="Prospecção"
      icone={Target}
      descricao="A busca na Receita para montar a carteira chega depois de Empresas."
    />
  ),
})
