import type { MidiaDoPortal } from '@leadtogo/api-client'
import { enderecoDoEmbed } from '@leadtogo/shared'
import { Play } from 'lucide-react'
import { useState } from 'react'

/** Vídeo que só carrega ao tocar na capa (privacidade e dados móveis): nada do YouTube/Vimeo antes do clique. */
function Video({ m }: { m: MidiaDoPortal }) {
  const [tocando, setTocando] = useState(false)
  if (!m.video) return null
  const nome = m.video.provedor === 'vimeo' ? 'Vimeo' : 'YouTube'
  return (
    <figure className="m-0 flex flex-col gap-1">
      {tocando ? (
        <iframe
          src={`${enderecoDoEmbed(m.video)}?autoplay=1`}
          title={m.legenda ?? `Vídeo do ${nome}`}
          className="aspect-video w-full rounded-sm border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      ) : (
        <button
          type="button"
          onClick={() => setTocando(true)}
          aria-label={`Assistir ao vídeo${m.legenda ? `: ${m.legenda}` : ''}`}
          className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-0 bg-ink text-on-brand"
        >
          <Play size={36} aria-hidden="true" />
          <span className="text-xs">Toque para assistir ({nome})</span>
        </button>
      )}
      {m.legenda ? (
        <figcaption className="text-[13px] text-ink-muted">{m.legenda}</figcaption>
      ) : null}
    </figure>
  )
}

/** As imagens (já liberadas pelo antivírus) e os vídeos da publicação. */
export function MidiasDoFeed({ midias }: { midias: MidiaDoPortal[] }) {
  if (midias.length === 0) return null
  const imagens = midias.filter((m) => m.tipo === 'imagem' && m.imagemUrl)
  const videos = midias.filter((m) => m.tipo === 'video')
  return (
    <div className="flex flex-col gap-2">
      {imagens.length > 0 ? (
        <div className={imagens.length > 1 ? 'grid grid-cols-2 gap-1.5' : 'flex'}>
          {imagens.map((m) => (
            <figure key={m.id} className="m-0 flex flex-col gap-1">
              <img
                src={m.imagemUrl ?? ''}
                alt={m.textoAlternativo ?? ''}
                loading="lazy"
                className="max-h-[420px] w-full rounded-sm object-cover"
              />
              {m.legenda ? (
                <figcaption className="text-[13px] text-ink-muted">{m.legenda}</figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}
      {videos.map((m) => (
        <Video key={m.id} m={m} />
      ))}
    </div>
  )
}
