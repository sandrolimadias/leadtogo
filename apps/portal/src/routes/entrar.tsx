import { createFileRoute } from '@tanstack/react-router'

import { exigirVisitante } from '@/app/guardas'
import { TelaEntrar } from '@/telas/acesso/entrar'

export const Route = createFileRoute('/entrar')({
  beforeLoad: ({ context }) => exigirVisitante(context),
  component: TelaEntrar,
})
