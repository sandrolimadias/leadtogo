import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { permissoesDaAtiva, podeCom } from '@/auth/permissoes'

// Hub do Portal do Cliente. Quem não tem nenhuma das permissões do portal (ver, publicar, moderar, documentos, agenda,
// avisos) no perfil de acesso da empresa ativa volta para o início (e a API recusa de qualquer jeito).
export const Route = createFileRoute('/_autenticado/portal')({
  beforeLoad: ({ context }) => {
    if (
      !podeCom(permissoesDaAtiva(context.me), [
        'portal.ver',
        'portal.publicar',
        'portal.moderar',
        'portal.documentos',
        'portal.agenda',
        'portal.avisos',
      ])
    )
      throw redirect({ to: '/' })
  },
  component: Outlet,
})
