import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { permissoesDaAtiva, podeCom } from '@/auth/permissoes'

// Hub do Portal do Cliente. Quem não tem `portal.ver`, `portal.publicar` nem `portal.moderar` no perfil de acesso da
// empresa ativa volta para o início (e a API recusa de qualquer jeito).
export const Route = createFileRoute('/_autenticado/portal')({
  beforeLoad: ({ context }) => {
    if (
      !podeCom(permissoesDaAtiva(context.me), [
        'portal.ver',
        'portal.publicar',
        'portal.moderar',
        'portal.documentos',
      ])
    )
      throw redirect({ to: '/' })
  },
  component: Outlet,
})
