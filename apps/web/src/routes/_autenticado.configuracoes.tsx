import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/configuracoes')({
  component: () => (
    <PaginaVazia
      titulo="Configurações"
      icone={Settings}
      descricao="Em breve: cadastros da empresa, equipe e segurança (verificação em duas etapas)."
    />
  ),
})
