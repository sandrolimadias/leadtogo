import { createFileRoute } from '@tanstack/react-router'

import { TelaDeOrigensEMotivos } from '@/telas/cadastros/origens-e-motivos'

export const Route = createFileRoute('/_autenticado/configuracoes/origens-e-motivos')({
  component: TelaDeOrigensEMotivos,
})
