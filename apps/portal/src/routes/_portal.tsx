import { createFileRoute, Outlet } from '@tanstack/react-router'

import { exigirSessao } from '@/app/guardas'
import { Casca } from '@/casca/casca'

/** Tudo que fica atrás do login: a casca do portal. Sem sessão vai para /entrar; com 2FA pendente, para /verificacao. */
export const Route = createFileRoute('/_portal')({
  beforeLoad: async ({ context }) => ({ sessao: await exigirSessao(context) }),
  component: function Portal() {
    const { sessao } = Route.useRouteContext()
    return (
      <Casca sessao={sessao}>
        <Outlet />
      </Casca>
    )
  },
})
