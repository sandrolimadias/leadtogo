import { createFileRoute } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/empresas')({
  component: () => (
    <PaginaVazia
      titulo="Empresas"
      icone={Building2}
      descricao="Em breve: a carteira de empresas, com consulta à Receita."
    />
  ),
})
