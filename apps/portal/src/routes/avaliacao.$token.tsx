import { createFileRoute } from '@tanstack/react-router'

import { TelaDeAvaliacaoPorLink } from '@/telas/agenda/avaliacao-por-link'

/** Avaliação do evento pelo link pessoal enviado por e-mail (Fase 4G), sem login. */
export const Route = createFileRoute('/avaliacao/$token')({
  component: function AvaliacaoPorLink() {
    const { token } = Route.useParams()
    return <TelaDeAvaliacaoPorLink token={token} />
  },
})
