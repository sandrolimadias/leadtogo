import { createFileRoute } from '@tanstack/react-router'

import { exigirVisitante } from '@/auth/guardas'
import { TelaDeLogin } from '@/telas/acesso/login'

export const Route = createFileRoute('/_acesso/login')({
  validateSearch: (busca: Record<string, unknown>) => ({
    redirect: typeof busca['redirect'] === 'string' ? busca['redirect'] : undefined,
  }),
  beforeLoad: ({ context }) => exigirVisitante(context),
  component: function Login() {
    const { redirect } = Route.useSearch()
    return <TelaDeLogin redirect={redirect} />
  },
})
