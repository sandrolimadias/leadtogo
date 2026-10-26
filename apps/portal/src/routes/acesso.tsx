import { createFileRoute } from '@tanstack/react-router'

import { TelaConfirmarLink } from '@/telas/acesso/confirmar-link'

/** O link do e-mail aponta para `/acesso#<token>`. A página só confere; o botão é que consome o link. */
export const Route = createFileRoute('/acesso')({ component: TelaConfirmarLink })
