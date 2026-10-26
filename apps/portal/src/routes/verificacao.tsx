import { createFileRoute, redirect } from '@tanstack/react-router'

import { exigirSessao } from '@/app/guardas'
import { TelaVerificacao } from '@/telas/acesso/verificacao'

export const Route = createFileRoute('/verificacao')({
  beforeLoad: async ({ context }) => {
    const sessao = await exigirSessao(context, { permitePendente: true })
    if (!sessao.segundoFatorPendente) throw redirect({ to: '/' })
    return { sessao }
  },
  component: function Verificacao() {
    const { sessao } = Route.useRouteContext()
    return <TelaVerificacao sessao={sessao} />
  },
})
