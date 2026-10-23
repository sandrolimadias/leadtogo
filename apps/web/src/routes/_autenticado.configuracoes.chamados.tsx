import { createFileRoute } from '@tanstack/react-router'

import { TelaDeConfiguracoesDeChamados } from '@/telas/chamados/configuracao/pagina-de-configuracao'

export const Route = createFileRoute('/_autenticado/configuracoes/chamados')({
  component: TelaDeConfiguracoesDeChamados,
})
