import { createFileRoute, redirect } from '@tanstack/react-router'

import { permissoesDaAtiva, podeCom } from '@/auth/permissoes'
import { TelaDeMetricasDeChamados } from '@/telas/chamados/metricas'

export const Route = createFileRoute('/_autenticado/chamados/metricas')({
  beforeLoad: ({ context }) => {
    if (!podeCom(permissoesDaAtiva(context.me), 'chamados.ver_metricas')) {
      throw redirect({ to: '/chamados' })
    }
  },
  component: TelaDeMetricasDeChamados,
})
