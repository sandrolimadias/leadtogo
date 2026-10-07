import { createFileRoute } from '@tanstack/react-router'

import { TelaVerificarEmail } from '@/telas/acesso/verificar-email'

export const Route = createFileRoute('/_acesso/verificar-email')({
  validateSearch: (busca: Record<string, unknown>) => ({
    confirmado:
      busca['confirmado'] === '1' || busca['confirmado'] === 1 || busca['confirmado'] === true,
    error: typeof busca['error'] === 'string' ? busca['error'] : undefined,
    email: typeof busca['email'] === 'string' ? busca['email'] : undefined,
  }),
  component: function VerificarEmail() {
    const { confirmado, error, email } = Route.useSearch()
    return <TelaVerificarEmail confirmado={confirmado} erroDoLink={error} email={email} />
  },
})
