import { createFileRoute, redirect } from '@tanstack/react-router'

import { permissoesDaAtiva, podeCom } from '@/auth/permissoes'
import { PERMISSOES_DAS_CONFIGURACOES } from '@/casca/navegacao'
import { Configuracoes } from '@/telas/gestao/configuracoes'

// Configurações: quem tem ao menos uma permissão de configuração no perfil de acesso da empresa
// ativa. Os demais não veem o menu e, se digitarem o endereço, voltam para o início.
export const Route = createFileRoute('/_autenticado/configuracoes')({
  beforeLoad: ({ context }) => {
    if (!podeCom(permissoesDaAtiva(context.me), PERMISSOES_DAS_CONFIGURACOES)) {
      throw redirect({ to: '/' })
    }
  },
  component: Configuracoes,
})
