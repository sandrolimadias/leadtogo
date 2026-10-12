import { createFileRoute, redirect } from '@tanstack/react-router'

import { Configuracoes } from '@/telas/gestao/configuracoes'

// Configurações: só o administrador da empresa ativa. Gestor e vendedor (e quem só administra a conta)
// não veem o menu e, se digitarem o endereço, voltam para o início.
export const Route = createFileRoute('/_autenticado/configuracoes')({
  beforeLoad: ({ context }) => {
    const ativa = context.me.empresas.find((e) => e.ativa)
    if (ativa?.papel !== 'admin') throw redirect({ to: '/' })
  },
  component: Configuracoes,
})
