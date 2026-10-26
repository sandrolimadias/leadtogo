import { createFileRoute } from '@tanstack/react-router'

import { TelaAgenda } from '@/telas/agenda/lista'

export const Route = createFileRoute('/_portal/agenda')({ component: TelaAgenda })
