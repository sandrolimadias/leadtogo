import { createFileRoute, redirect } from '@tanstack/react-router'

import { TelaCriarEmpresa } from '@/telas/gestao/criar-empresa'

// Só o administrador da conta cria empresas; quem não é vai para o início
export const Route = createFileRoute('/_autenticado/criar-empresa')({
  beforeLoad: ({ context }) => {
    if (!context.me.administradorDeConta) throw redirect({ to: '/' })
  },
  component: TelaCriarEmpresa,
})
