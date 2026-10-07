import { createFileRoute } from '@tanstack/react-router'

import { TelaDeConvite } from '@/telas/acesso/convite'

export const Route = createFileRoute('/_acesso/convite')({
  validateSearch: (busca: Record<string, unknown>) => ({
    token: typeof busca['token'] === 'string' ? busca['token'] : undefined,
  }),
  component: function Convite() {
    const { token } = Route.useSearch()
    return <TelaDeConvite token={token} />
  },
})
