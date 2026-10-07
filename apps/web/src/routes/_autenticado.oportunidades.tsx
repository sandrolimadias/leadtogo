import { createFileRoute } from '@tanstack/react-router'
import { Handshake } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/oportunidades')({
  component: () => (
    <PaginaVazia
      titulo="Oportunidades"
      icone={Handshake}
      descricao="Em breve: o funil de vendas, em Kanban e em lista."
    />
  ),
})
