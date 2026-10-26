import { type Coordenada, trechosDoGoogleMaps } from '@leadtogo/shared'
import { ExternalLink } from 'lucide-react'

import { useDispositivo } from '@/casca/dispositivo'
import { Button } from '@leadtogo/ui/button'
import { Dialog } from '@leadtogo/ui/dialog'

/**
 * Os links do Google Maps em trechos (até 3 paradas intermediárias no celular e 9 no computador; G0, seção 7).
 * Sem origem, o primeiro trecho começa onde o aparelho está (o Google usa a posição atual).
 */
export function LinksDeNavegacao(p: {
  aberto: boolean
  aoFechar: () => void
  origem: Coordenada | null
  paradas: readonly Coordenada[]
  voltarPara: Coordenada | null
}) {
  const celular = useDispositivo() === 'celular'
  const trechos = trechosDoGoogleMaps({
    origem: p.origem,
    paradas: p.paradas,
    destinoFinal: p.voltarPara,
    celular,
  })
  return (
    <Dialog
      open={p.aberto}
      onOpenChange={(v) => (v ? undefined : p.aoFechar())}
      title="Abrir no Google Maps"
      description={
        trechos.length > 1
          ? `O Google Maps aceita poucas paradas por link: a rota foi dividida em ${trechos.length} trechos. Abra um de cada vez.`
          : 'A rota inteira cabe num link.'
      }
      footer={<Button onClick={p.aoFechar}>Fechar</Button>}
    >
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {trechos.map((t) => (
          <li key={t.url}>
            <a
              href={t.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm text-ink no-underline hover:bg-surface-sunken"
            >
              <span>{t.rotulo}</span>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
    </Dialog>
  )
}
