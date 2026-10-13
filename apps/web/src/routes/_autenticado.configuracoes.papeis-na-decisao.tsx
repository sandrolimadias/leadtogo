import { createFileRoute } from '@tanstack/react-router'

import { TelaDePapeisNaDecisao } from '@/telas/cadastros/papeis-na-decisao'

export const Route = createFileRoute('/_autenticado/configuracoes/papeis-na-decisao')({
  component: TelaDePapeisNaDecisao,
})
