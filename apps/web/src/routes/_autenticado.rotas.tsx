import { createFileRoute } from '@tanstack/react-router'
import { Route as RotaIcone } from 'lucide-react'

import { PaginaVazia } from '@/casca/partes'

export const Route = createFileRoute('/_autenticado/rotas')({
  component: () => (
    <PaginaVazia titulo="Rotas" icone={RotaIcone} descricao="O roteiro de visitas é da Fase 3." />
  ),
})
