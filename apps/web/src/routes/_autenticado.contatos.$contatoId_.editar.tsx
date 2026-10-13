import { createFileRoute } from '@tanstack/react-router'

import { EditarContato } from '@/telas/contatos/editar-contato'

// `$contatoId_` (com o sublinhado) tira esta rota de dentro da ficha: a edição é uma tela própria
export const Route = createFileRoute('/_autenticado/contatos/$contatoId_/editar')({
  component: EditarContato,
})
