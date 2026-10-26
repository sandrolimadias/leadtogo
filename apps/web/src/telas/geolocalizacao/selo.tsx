import type { PosicaoDaEmpresa } from '@leadtogo/shared'
import { CircleAlert, CircleCheck, CircleDashed, MapPin } from 'lucide-react'

import { Badge } from '@leadtogo/ui/exibicao'

import { ROTULO_DO_ESTADO, TOM_DO_ESTADO } from './rotulos'

const ICONE = {
  exata: CircleCheck,
  aproximada: MapPin,
  sem_coordenada: CircleDashed,
  a_confirmar: CircleAlert,
} as const

/** O selo de precisão (exata, aproximada, sem coordenada, a confirmar): sempre com palavra, nunca só a cor. */
export function SeloDePosicao({ posicao }: { posicao: Pick<PosicaoDaEmpresa, 'estado'> }) {
  return (
    <Badge tone={TOM_DO_ESTADO[posicao.estado]} icon={ICONE[posicao.estado]}>
      {ROTULO_DO_ESTADO[posicao.estado]}
    </Badge>
  )
}
