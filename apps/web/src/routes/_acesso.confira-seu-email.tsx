import { createFileRoute } from '@tanstack/react-router'

import { TelaConfiraSeuEmail } from '@/telas/acesso/recuperar-senha'

export const Route = createFileRoute('/_acesso/confira-seu-email')({
  validateSearch: (busca: Record<string, unknown>) => ({
    email: typeof busca['email'] === 'string' ? busca['email'] : undefined,
  }),
  component: function ConfiraSeuEmail() {
    const { email } = Route.useSearch()
    return <TelaConfiraSeuEmail email={email} />
  },
})
