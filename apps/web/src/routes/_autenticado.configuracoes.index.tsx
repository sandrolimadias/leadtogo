import { createFileRoute, redirect } from '@tanstack/react-router'

import { permissoesDaAtiva, podeCom } from '@/auth/permissoes'
import { SECOES } from '@/telas/gestao/secoes-das-configuracoes'

// A primeira seção que a pessoa pode abrir (Usuários e equipe, para o Administrador)
export const Route = createFileRoute('/_autenticado/configuracoes/')({
  beforeLoad: ({ context }) => {
    const permissoes = permissoesDaAtiva(context.me)
    const primeira = SECOES.find((s) => podeCom(permissoes, s.permissoes))
    throw redirect({ to: primeira?.para ?? '/', replace: true })
  },
})
