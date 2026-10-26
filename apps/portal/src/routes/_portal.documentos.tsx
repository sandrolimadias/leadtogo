import { createFileRoute } from '@tanstack/react-router'

import { TelaDocumentos } from '@/telas/documentos/lista'

export const Route = createFileRoute('/_portal/documentos')({ component: TelaDocumentos })
