import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { permissoesDaAtiva, podeCom } from '@/auth/permissoes'

// Central de chamados (Fase 2): a lista (/chamados) e o chamado (/chamados/:id). Quem não tem `chamados.ver`
// no perfil de acesso da empresa ativa volta para o início (e a API recusa de qualquer jeito).
export const Route = createFileRoute('/_autenticado/chamados')({
  beforeLoad: ({ context }) => {
    if (!podeCom(permissoesDaAtiva(context.me), 'chamados.ver')) throw redirect({ to: '/' })
  },
  component: Outlet,
})
