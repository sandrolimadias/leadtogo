import { createFileRoute } from '@tanstack/react-router'

import { TelaDeEventosPublicos } from '@/telas/pagina/eventos-publicos'

/** Página pública de eventos do portal (Fase 4H), sem login. */
export const Route = createFileRoute('/eventos/$slug')({
  component: function EventosPublicos() {
    const { slug } = Route.useParams()
    return <TelaDeEventosPublicos slug={slug} />
  },
})
