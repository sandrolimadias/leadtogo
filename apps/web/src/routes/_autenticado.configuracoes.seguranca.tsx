import { createFileRoute } from '@tanstack/react-router'

import { TelaDeSegurancaDaEmpresa } from '@/telas/gestao/seguranca-da-empresa'

export const Route = createFileRoute('/_autenticado/configuracoes/seguranca')({
  component: TelaDeSegurancaDaEmpresa,
})
