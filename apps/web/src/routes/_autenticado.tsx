import { createFileRoute, Outlet } from '@tanstack/react-router'

import { exigirAplicativo } from '@/auth/guardas'

// Tudo o que fica atrás do login. Administrador sem 2FA é desviado para a ativação (a casca fica
// bloqueada até ativar). A casca do app (navegação, barra superior) entra no E9c.
export const Route = createFileRoute('/_autenticado')({
  beforeLoad: ({ context, location }) => exigirAplicativo(context, location.href),
  component: Outlet,
})
