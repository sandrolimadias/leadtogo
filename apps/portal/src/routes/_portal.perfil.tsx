import { createFileRoute } from '@tanstack/react-router'

import { TelaPerfil } from '@/telas/perfil/pagina'

export const Route = createFileRoute('/_portal/perfil')({
  component: function Perfil() {
    const { sessao } = Route.useRouteContext()
    return <TelaPerfil inicial={sessao} />
  },
})
