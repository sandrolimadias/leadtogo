import { createFileRoute } from '@tanstack/react-router'

import { exigirVisitante } from '@/auth/guardas'
import { TelaEsqueciSenha } from '@/telas/acesso/recuperar-senha'

export const Route = createFileRoute('/_acesso/esqueci-senha')({
  beforeLoad: ({ context }) => exigirVisitante(context),
  component: TelaEsqueciSenha,
})
