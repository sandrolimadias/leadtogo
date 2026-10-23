import type { SituacaoDeRota } from '@leadtogo/shared'

import type { TomDoBadge } from '@/components/ui/exibicao'

/** O tom do selo de cada situação da rota. */
export const TOM_DA_SITUACAO: Record<SituacaoDeRota, TomDoBadge> = {
  planejada: 'outline',
  em_andamento: 'info',
  concluida: 'success',
  cancelada: 'danger',
}
