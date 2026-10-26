import { createFileRoute } from '@tanstack/react-router'

import { TelaBusca } from '@/telas/busca/pagina'

export const Route = createFileRoute('/_portal/busca')({
  validateSearch: (busca: Record<string, unknown>): { q: string } => ({
    q: typeof busca['q'] === 'string' ? busca['q'].slice(0, 100) : '',
  }),
  component: function Busca() {
    const { q } = Route.useSearch()
    // a chave refaz a tela quando o campo do cabeçalho muda o termo
    return <TelaBusca key={q} q={q} />
  },
})
