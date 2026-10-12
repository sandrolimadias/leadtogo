import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_autenticado/configuracoes/')({
  beforeLoad: () => {
    throw redirect({ to: '/configuracoes/usuarios', replace: true })
  },
})
