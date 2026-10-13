import { createFileRoute } from '@tanstack/react-router'

import { EditarEmpresa } from '@/telas/empresas/editar-empresa'

// `$empresaId_` (com o sublinhado) tira esta rota de dentro da ficha: a edição é uma tela própria
export const Route = createFileRoute('/_autenticado/empresas/$empresaId_/editar')({
  component: EditarEmpresa,
})
