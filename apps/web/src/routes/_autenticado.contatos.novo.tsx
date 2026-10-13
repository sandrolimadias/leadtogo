import { createFileRoute } from '@tanstack/react-router'

import { NovoContato } from '@/telas/contatos/novo-contato'

export const Route = createFileRoute('/_autenticado/contatos/novo')({
  // `?empresa=<id>`: o cadastro já começa com a empresa escolhida (vem da aba Contatos da empresa)
  validateSearch: (entrada: Record<string, unknown>): { empresa?: string } =>
    typeof entrada['empresa'] === 'string' && entrada['empresa'].trim() !== ''
      ? { empresa: entrada['empresa'].trim() }
      : {},
  component: NovoContato,
})
