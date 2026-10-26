import { createFileRoute } from '@tanstack/react-router'

import { TelaDoPortal } from '@/telas/portal/hub'

export const Route = createFileRoute('/_autenticado/portal/')({ component: TelaDoPortal })
