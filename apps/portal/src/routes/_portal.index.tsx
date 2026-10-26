import { createFileRoute } from '@tanstack/react-router'

import { TelaInicio } from '@/telas/inicio'

export const Route = createFileRoute('/_portal/')({
  component: function Inicio() {
    const { sessao } = Route.useRouteContext()
    return <TelaInicio sessao={sessao} />
  },
})
