import { createFileRoute } from '@tanstack/react-router'

import { TelaDePrimeiroAcesso } from '@/telas/acesso/primeiro-acesso'

export const Route = createFileRoute('/_acesso/primeiro-acesso')({
  component: TelaDePrimeiroAcesso,
})
