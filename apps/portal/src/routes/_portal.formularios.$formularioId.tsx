import { createFileRoute } from '@tanstack/react-router'

import { TelaResponderFormulario } from '@/telas/formularios/responder'

export const Route = createFileRoute('/_portal/formularios/$formularioId')({
  component: function Formulario() {
    const { formularioId } = Route.useParams()
    return <TelaResponderFormulario id={formularioId} />
  },
})
