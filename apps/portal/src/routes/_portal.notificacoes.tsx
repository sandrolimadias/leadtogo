import { createFileRoute } from '@tanstack/react-router'

import { TelaNotificacoes } from '@/telas/notificacoes'

export const Route = createFileRoute('/_portal/notificacoes')({ component: TelaNotificacoes })
