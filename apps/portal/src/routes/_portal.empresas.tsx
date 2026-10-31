import { createFileRoute } from '@tanstack/react-router'

import { TelaEscolherEmpresa } from '@/telas/empresas/escolher'

export const Route = createFileRoute('/_portal/empresas')({ component: TelaEscolherEmpresa })
