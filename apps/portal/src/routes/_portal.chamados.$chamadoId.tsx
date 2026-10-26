import { createFileRoute } from '@tanstack/react-router'

import { TelaDetalheDoChamado } from '@/telas/chamados/detalhe'

export const Route = createFileRoute('/_portal/chamados/$chamadoId')({
  component: function Detalhe() {
    const { chamadoId } = Route.useParams()
    return <TelaDetalheDoChamado chamadoId={chamadoId} />
  },
})
