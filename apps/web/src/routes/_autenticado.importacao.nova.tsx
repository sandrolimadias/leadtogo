import { createFileRoute } from '@tanstack/react-router'

import { EnviarPlanilha } from '@/telas/importacao/enviar'

export const Route = createFileRoute('/_autenticado/importacao/nova')({
  component: EnviarPlanilha,
})
