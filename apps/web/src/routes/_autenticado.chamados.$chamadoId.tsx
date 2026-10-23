import { createFileRoute } from '@tanstack/react-router'

import { TelaDoChamado } from '@/telas/chamados/detalhe'

export const Route = createFileRoute('/_autenticado/chamados/$chamadoId')({
  component: function Pagina() {
    const { chamadoId } = Route.useParams()
    return <TelaDoChamado chamadoId={chamadoId} />
  },
})
