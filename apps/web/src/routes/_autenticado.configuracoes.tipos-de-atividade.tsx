import { createFileRoute } from '@tanstack/react-router'

import { TelaDeTiposDeAtividade } from '@/telas/cadastros/tipos-de-atividade'

export const Route = createFileRoute('/_autenticado/configuracoes/tipos-de-atividade')({
  component: TelaDeTiposDeAtividade,
})
