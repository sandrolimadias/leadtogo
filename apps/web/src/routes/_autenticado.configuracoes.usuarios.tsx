import { createFileRoute } from '@tanstack/react-router'

import { TelaDeUsuarios } from '@/telas/gestao/usuarios'

export const Route = createFileRoute('/_autenticado/configuracoes/usuarios')({
  component: TelaDeUsuarios,
})
