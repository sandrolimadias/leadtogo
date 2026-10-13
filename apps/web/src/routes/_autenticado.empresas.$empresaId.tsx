import { createFileRoute } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/empresas/$empresaId')({
  component: () => (
    <PaginaVazia titulo="Empresa" icone={Building2} descricao="Esta tela está em construção." />
  ),
})
