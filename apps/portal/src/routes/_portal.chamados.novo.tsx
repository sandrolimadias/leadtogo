import { createFileRoute } from '@tanstack/react-router'

import { TelaNovoChamado } from '@/telas/chamados/novo'

export const Route = createFileRoute('/_portal/chamados/novo')({ component: TelaNovoChamado })
