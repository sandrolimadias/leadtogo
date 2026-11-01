import { createFileRoute } from '@tanstack/react-router'

import { TelaDeCheckin } from '@/telas/agenda/checkin'

/** Check-in pelo QR do evento (Fase 4G): logado é um toque; sem login, o e-mail da inscrição. */
export const Route = createFileRoute('/checkin/$token')({
  component: function Checkin() {
    const { token } = Route.useParams()
    return <TelaDeCheckin token={token} />
  },
})
