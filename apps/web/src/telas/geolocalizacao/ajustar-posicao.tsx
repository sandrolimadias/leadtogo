import type { PosicaoDaEmpresa } from '@leadtogo/shared'
import { RAIO_DE_INCERTEZA_M } from '@leadtogo/shared'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { MapaBase } from '@/components/mapa/mapa-base'

/** Centro do mapa quando nem a empresa nem o município têm posição: o meio do Brasil (a pessoa ajusta o zoom). */
const MEIO_DO_BRASIL: [number, number] = [-52, -14]

/**
 * "Ajustar posição": um mapa pequeno com o pin da empresa. A pessoa arrasta o pin (ou toca no mapa) e
 * confirma; a posição vira exata, de origem "ajustada à mão", e nenhuma geocodificação a sobrescreve.
 */
export function AjustarPosicao({
  aberto,
  aoFechar,
  nomeDaEmpresa,
  posicao,
  salvando,
  erro,
  aoConfirmar,
}: {
  aberto: boolean
  aoFechar: () => void
  nomeDaEmpresa: string
  posicao: Pick<PosicaoDaEmpresa, 'latitude' | 'longitude' | 'centroSugerido' | 'estado'>
  salvando: boolean
  erro?: string | undefined
  aoConfirmar: (latitude: number, longitude: number) => void
}) {
  const inicio =
    posicao.latitude !== null && posicao.longitude !== null
      ? { latitude: posicao.latitude, longitude: posicao.longitude }
      : posicao.centroSugerido
  const [ponto, setPonto] = useState<{ latitude: number; longitude: number } | null>(inicio)
  const [mexeu, setMexeu] = useState(false)
  const temPosicao = posicao.latitude !== null
  const mover = (latitude: number, longitude: number) => {
    setPonto({ latitude, longitude })
    setMexeu(true)
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (!a) aoFechar()
      }}
      title="Ajustar a posição"
      width={640}
      description={`Arraste o pin até a porta de ${nomeDaEmpresa}, ou toque no mapa onde ela fica.`}
      footer={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button
            variant="primary"
            loading={salvando}
            disabled={!ponto || (temPosicao && !mexeu)}
            onClick={() => ponto && aoConfirmar(ponto.latitude, ponto.longitude)}
          >
            Confirmar posição
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!inicio ? (
          <Alert tone="info">
            Ainda não há posição nem centro da cidade para esta empresa. Toque no mapa para marcar
            onde ela fica.
          </Alert>
        ) : null}
        <MapaBase
          rotulo="Mapa para ajustar a posição da empresa"
          className="h-[360px] w-full rounded-md border border-border max-md:h-[300px]"
          centro={inicio ? [inicio.longitude, inicio.latitude] : MEIO_DO_BRASIL}
          zoom={inicio ? (temPosicao ? 17 : 13) : 4}
          semControles={false}
          {...(ponto ? { arrastavel: { ...ponto, aoSoltar: mover } } : {})}
          {...(ponto && !mexeu && temPosicao ? { raioM: RAIO_DE_INCERTEZA_M.rua } : {})}
          aoClicarNoMapa={mover}
        />
        {ponto ? (
          <p className="m-0 text-xs text-ink-muted">
            Posição: {ponto.latitude.toFixed(6)}, {ponto.longitude.toFixed(6)}
            {mexeu ? ' (nova, ainda não confirmada)' : ''}
          </p>
        ) : null}
        {erro ? <Alert tone="danger">{erro}</Alert> : null}
      </div>
    </Dialog>
  )
}
