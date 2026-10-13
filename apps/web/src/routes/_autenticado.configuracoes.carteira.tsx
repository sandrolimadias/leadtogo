import { createFileRoute } from '@tanstack/react-router'

import { TelaDaCarteiraDaEmpresa } from '@/telas/gestao/carteira-da-empresa'

export const Route = createFileRoute('/_autenticado/configuracoes/carteira')({
  component: TelaDaCarteiraDaEmpresa,
})
