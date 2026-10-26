import { ROTULO_DO_ESTADO_NO_PORTAL, type EstadoDoChamadoNoPortal } from '@leadtogo/shared'

import { Badge } from '@leadtogo/ui/exibicao'

import { TOM_DO_ESTADO } from '@/casca/rotulos'

/** O estado do chamado como o cliente o enxerga (nunca o estado interno da equipe). */
export function EstadoDoChamado({ estado }: { estado: EstadoDoChamadoNoPortal }) {
  return <Badge tone={TOM_DO_ESTADO[estado]}>{ROTULO_DO_ESTADO_NO_PORTAL[estado]}</Badge>
}
