import { createFileRoute } from '@tanstack/react-router'

import { TelaFormularioPublico } from '@/telas/formularios/responder'

/** Formulário público (Fase 4E): qualquer pessoa responde, sem login. */
export const Route = createFileRoute('/f/$slug')({
  component: function FormularioPublico() {
    const { slug } = Route.useParams()
    return <TelaFormularioPublico slug={slug} />
  },
})
