import { createFileRoute } from '@tanstack/react-router'

import { TelaDosDadosDaEmpresa } from '@/telas/gestao/dados-da-empresa'

export const Route = createFileRoute('/_autenticado/configuracoes/empresa')({
  component: TelaDosDadosDaEmpresa,
})
