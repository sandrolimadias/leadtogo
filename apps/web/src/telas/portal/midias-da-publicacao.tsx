import type { MidiaDaPublicacao } from '@leadtogo/api-client'
import {
  enderecoDoEmbed,
  extrairVideo,
  MAXIMO_DE_MIDIAS_POR_PUBLICACAO,
  TAMANHO_MAXIMO_DA_IMAGEM,
  TIPOS_DE_IMAGEM,
} from '@leadtogo/shared'
import { ImagePlus, PlayCircle, Trash2, Video } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

const ESTADO = {
  pendente_varredura: { rotulo: 'Em verificação', tom: 'warning' },
  limpo: { rotulo: 'Liberada', tom: 'success' },
  infectado: { rotulo: 'Bloqueada', tom: 'danger' },
} as const

/**
 * Imagens e vídeo da publicação (Fase 4D). A imagem vai direto ao armazenamento e passa pelo antivírus antes de
 * aparecer aos clientes; o vídeo é só um link do YouTube ou do Vimeo.
 */
export function MidiasDaPublicacao({
  publicacaoId,
  midias,
  podeEditar,
  aoMudar,
}: {
  publicacaoId: string
  midias: MidiaDaPublicacao[]
  podeEditar: boolean
  aoMudar: () => void
}) {
  const servicos = useServicos()
  const [link, setLink] = useState('')
  const [alt, setAlt] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const cheio = midias.length >= MAXIMO_DE_MIDIAS_POR_PUBLICACAO

  const adicionarVideo = async () => {
    setErro(null)
    setOcupado(true)
    const r = await servicos.portal.publicacoes.adicionarVideo(publicacaoId, { url: link.trim() })
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setLink('')
    toast.success('Vídeo adicionado')
    aoMudar()
  }

  const escolherImagem = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setErro(null)
    if (!(TIPOS_DE_IMAGEM as readonly string[]).includes(arquivo.type)) {
      setErro('Use uma imagem JPG, PNG ou WebP.')
      return
    }
    if (arquivo.size > TAMANHO_MAXIMO_DA_IMAGEM) {
      setErro('A imagem passa de 10 MB.')
      return
    }
    setOcupado(true)
    const reservada = await servicos.portal.publicacoes.adicionarImagem(publicacaoId, {
      textoAlternativo: alt.trim(),
      arquivo: { nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size },
    })
    if (!reservada.ok) {
      setOcupado(false)
      setErro(reservada.erro.mensagem)
      return
    }
    const enviada = await servicos.portal.publicacoes.enviarImagem(
      reservada.dados.envio.url,
      arquivo,
      reservada.dados.envio.cabecalhos,
    )
    const confirmada = enviada.ok
      ? await servicos.portal.publicacoes.confirmarImagem(publicacaoId, reservada.dados.midia.id)
      : enviada
    setOcupado(false)
    if (!confirmada.ok) {
      setErro(confirmada.erro.mensagem)
      aoMudar()
      return
    }
    setAlt('')
    toast.success('Imagem enviada. Ela aparece aos clientes depois da verificação do antivírus.')
    aoMudar()
  }

  const remover = async (m: MidiaDaPublicacao) => {
    const r = await servicos.portal.publicacoes.removerMidia(publicacaoId, m.id)
    if (!r.ok) toast.error(r.erro.mensagem)
    else aoMudar()
  }

  const videoValido = extrairVideo(link) !== null
  return (
    <section aria-label="Imagens e vídeo" className="flex flex-col gap-3">
      <h3 className="m-0 text-sm font-semibold">
        Imagens e vídeo{' '}
        <span className="font-normal text-ink-muted">
          ({midias.length} de {MAXIMO_DE_MIDIAS_POR_PUBLICACAO})
        </span>
      </h3>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      {midias.length > 0 ? (
        <ul aria-label="Mídias" className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-3">
          {midias.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-1 overflow-hidden rounded-sm border border-border bg-surface-sunken"
            >
              {m.tipo === 'imagem' ? (
                m.imagem?.url ? (
                  <img
                    src={m.imagem.url}
                    alt={m.textoAlternativo ?? ''}
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center p-2 text-center text-xs text-ink-muted">
                    {m.imagem?.nome}
                  </div>
                )
              ) : (
                <a
                  href={m.video ? enderecoDoEmbed(m.video) : undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex aspect-video items-center justify-center gap-1 text-xs text-ink-muted"
                >
                  <PlayCircle size={20} aria-hidden="true" />
                  {m.video?.provedor === 'vimeo' ? 'Vimeo' : 'YouTube'}
                </a>
              )}
              <div className="flex items-center gap-1 px-2 pb-2">
                {m.imagem ? (
                  <Badge tone={ESTADO[m.imagem.estado].tom}>{ESTADO[m.imagem.estado].rotulo}</Badge>
                ) : (
                  <Badge tone="info">Vídeo</Badge>
                )}
                {podeEditar ? (
                  <button
                    type="button"
                    aria-label={`Tirar ${m.tipo === 'imagem' ? 'a imagem' : 'o vídeo'}`}
                    onClick={() => void remover(m)}
                    className="ml-auto inline-flex size-7 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-ink-muted hover:bg-surface-hover"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {podeEditar && !cheio ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <TextField
              label="Descrição da imagem"
              hint="Para quem usa leitor de tela. Obrigatória."
              value={alt}
              maxLength={300}
              onChange={(e) => setAlt(e.target.value)}
            />
            <input
              ref={entrada}
              type="file"
              accept={TIPOS_DE_IMAGEM.join(',')}
              className="hidden"
              aria-label="Arquivo da imagem"
              onChange={(e) => void escolherImagem(e)}
            />
            <Button
              icon={ImagePlus}
              loading={ocupado}
              disabled={alt.trim().length < 3}
              onClick={() => entrada.current?.click()}
            >
              Enviar imagem
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <TextField
              label="Link do vídeo"
              hint="YouTube ou Vimeo."
              value={link}
              maxLength={500}
              onChange={(e) => setLink(e.target.value)}
            />
            <Button
              icon={Video}
              loading={ocupado}
              disabled={!videoValido}
              onClick={() => void adicionarVideo()}
            >
              Adicionar vídeo
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
