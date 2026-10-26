import { createFileRoute } from '@tanstack/react-router'

import { TelaChamados } from '@/telas/chamados/lista'

export const Route = createFileRoute('/_portal/chamados/')({ component: TelaChamados })
