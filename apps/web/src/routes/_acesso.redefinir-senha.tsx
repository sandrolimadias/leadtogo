import { createFileRoute } from '@tanstack/react-router'

import { TelaRedefinirSenha } from '@/telas/acesso/recuperar-senha'

export const Route = createFileRoute('/_acesso/redefinir-senha')({
  validateSearch: (busca: Record<string, unknown>) => ({
    token: typeof busca['token'] === 'string' ? busca['token'] : undefined,
    error: typeof busca['error'] === 'string' ? busca['error'] : undefined,
  }),
  component: function RedefinirSenha() {
    const { token, error } = Route.useSearch()
    return <TelaRedefinirSenha token={token} erroDoLink={error} />
  },
})
