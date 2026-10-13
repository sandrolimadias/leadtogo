import { createFileRoute } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/empresas/nova')({
  component: () => (
    <PaginaVazia
      titulo="Nova empresa"
      icone={Building2}
      descricao="Esta tela está em construção."
    />
  ),
})
