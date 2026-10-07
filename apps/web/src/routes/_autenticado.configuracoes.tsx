import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/configuracoes')({
  component: () => (
    <PaginaVazia
      titulo="Configurações"
      icone={Settings}
      descricao="Cadastros auxiliares, usuários e a política de 2FA da empresa chegam na etapa MVP · Configurações."
    />
  ),
})
