import { createFileRoute } from '@tanstack/react-router'
import { LayoutGrid } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/consolidado')({
  component: () => (
    <PaginaVazia
      titulo="Painel consolidado"
      icone={LayoutGrid}
      descricao="Em breve: o painel que soma todas as suas empresas."
    />
  ),
})
