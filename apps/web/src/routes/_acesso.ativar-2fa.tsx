import { createFileRoute, redirect } from '@tanstack/react-router'

import { exigirSessao } from '@/auth/guardas'
import { TelaDeAtivarDoisFatores } from '@/telas/acesso/ativar-dois-fatores'

export const Route = createFileRoute('/_acesso/ativar-2fa')({
  beforeLoad: async ({ context }) => {
    const me = await exigirSessao(context, '/ativar-2fa')
    if (me.usuario.twoFactorEnabled) throw redirect({ to: '/' })
  },
  component: TelaDeAtivarDoisFatores,
})
