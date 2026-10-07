import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/contatos')({
  component: () => (
    <PaginaVazia
      titulo="Contatos"
      icone={Users}
      descricao="Os contatos de cada empresa chegam depois do cadastro de Empresas."
    />
  ),
})
