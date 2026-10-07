import { createFileRoute } from '@tanstack/react-router'

import { TelaDeVerificacao } from '@/telas/acesso/dois-fatores-login'

export const Route = createFileRoute('/_acesso/verificacao')({
  validateSearch: (busca: Record<string, unknown>) => ({
    redirect: typeof busca['redirect'] === 'string' ? busca['redirect'] : undefined,
  }),
  component: function Verificacao() {
    const { redirect } = Route.useSearch()
    return <TelaDeVerificacao redirect={redirect} />
  },
})
