import type { ComentarioDoPortal, PublicacaoDoPortal } from '@leadtogo/api-client'
import {
  MOTIVOS_DE_DENUNCIA,
  ROTULO_DA_REACAO,
  ROTULO_DO_MOTIVO_DE_DENUNCIA,
  type MotivoDeDenuncia,
  TAMANHO_MAXIMO_DO_COMENTARIO,
  TIPOS_DE_REACAO,
  type TipoDeReacao,
} from '@leadtogo/shared'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Flag, MessageCircle, Pin, ThumbsUp, PartyPopper } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextArea } from '@leadtogo/ui/campos'
import { cn } from '@leadtogo/ui/cn'
import { Dialog } from '@leadtogo/ui/dialog'
import { Avatar } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Markdown } from '@leadtogo/ui/markdown'

import { MidiasDoFeed } from './midias-do-feed'
import { toast } from '@leadtogo/ui/toast'

import { dataEHora } from '@/casca/rotulos'
import { useServicos } from '@/servicos/contexto'

const ICONE_DA_REACAO = { curtir: ThumbsUp, parabens: PartyPopper } as const

type Pagina = { itens: PublicacaoDoPortal[]; total: number }

/** Reações da publicação: clicar liga, clicar de novo desliga. O número é o total de todos os clientes. */
function Reacoes({ pub, aoMudar }: { pub: PublicacaoDoPortal; aoMudar: () => void }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  async function reagir(tipo: TipoDeReacao) {
    setOcupado(true)
    const r = await servicos.publicacoes.reagir(pub.id, tipo)
    setOcupado(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    queryClient.setQueryData<{ pages: Pagina[]; pageParams: unknown[] }>(['feed'], (antes) =>
      antes
        ? {
            ...antes,
            pages: antes.pages.map((p) => ({
              ...p,
              itens: p.itens.map((i) =>
                i.id === pub.id
                  ? { ...i, reacoes: r.dados.reacoes, minhasReacoes: r.dados.minhasReacoes }
                  : i,
              ),
            })),
          }
        : antes,
    )
    aoMudar()
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TIPOS_DE_REACAO.map((tipo) => {
        const Icone = ICONE_DA_REACAO[tipo]
        const minha = pub.minhasReacoes.includes(tipo)
        return (
          <button
            key={tipo}
            type="button"
            aria-pressed={minha}
            disabled={ocupado}
            onClick={() => void reagir(tipo)}
            className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:cursor-wait',
              minha
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-border bg-surface text-ink-muted hover:bg-surface-2',
            )}
          >
            <Icone size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>{pub.reacoes[tipo]}</span>
            <span>{ROTULO_DA_REACAO[tipo]}</span>
          </button>
        )
      })}
    </div>
  )
}

function Denuncia({
  comentarioId,
  aberto,
  aoFechar,
  aoDenunciar,
}: {
  comentarioId: string
  aberto: boolean
  aoFechar: () => void
  aoDenunciar: () => void
}) {
  const servicos = useServicos()
  const [motivo, setMotivo] = useState<MotivoDeDenuncia>('spam')
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    setEnviando(true)
    const r = await servicos.publicacoes.denunciar(comentarioId, motivo)
    setEnviando(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    toast.success('Denúncia enviada. A equipe vai analisar.')
    aoDenunciar()
    aoFechar()
  }
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) aoFechar()
      }}
      title="Denunciar comentário"
      description="A equipe analisa e decide se mantém ou oculta. Quem comentou não vê a sua denúncia."
      footer={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button variant="primary" loading={enviando} onClick={() => void enviar()}>
            Enviar denúncia
          </Button>
        </>
      }
    >
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">Motivo</legend>
        {MOTIVOS_DE_DENUNCIA.map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="motivo-da-denuncia"
              checked={motivo === m}
              onChange={() => setMotivo(m)}
            />
            {ROTULO_DO_MOTIVO_DE_DENUNCIA[m]}
          </label>
        ))}
      </fieldset>
    </Dialog>
  )
}

function Comentario({ c, aoMudar }: { c: ComentarioDoPortal; aoMudar: () => void }) {
  const [denunciando, setDenunciando] = useState(false)
  return (
    <li className="flex gap-2.5">
      <Avatar name={c.autorNome} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] leading-5">
          <span className="font-semibold">{c.autorNome}</span>{' '}
          <span className="text-ink-muted">{dataEHora(c.criadoEm)}</span>
        </p>
        <p className="m-0 text-sm leading-5 break-words whitespace-pre-wrap">{c.corpo}</p>
        {c.oculto ? (
          <p className="m-0 mt-1 text-[13px] text-warning">
            A equipe ocultou este comentário: só você o vê.
            {c.ocultoMotivo ? ` Motivo: ${c.ocultoMotivo}` : ''}
          </p>
        ) : null}
        {!c.meu ? (
          c.denunciado ? (
            <p className="m-0 mt-1 text-[13px] text-ink-muted">Você denunciou este comentário.</p>
          ) : (
            <button
              type="button"
              onClick={() => setDenunciando(true)}
              className="mt-1 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[13px] text-ink-muted hover:text-danger"
            >
              <Flag size={13} aria-hidden="true" /> Denunciar
            </button>
          )
        ) : null}
        {denunciando ? (
          <Denuncia
            comentarioId={c.id}
            aberto
            aoFechar={() => setDenunciando(false)}
            aoDenunciar={aoMudar}
          />
        ) : null}
      </div>
    </li>
  )
}

function Comentarios({ pub, aoMudar }: { pub: PublicacaoDoPortal; aoMudar: () => void }) {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: ['comentarios', pub.id],
    queryFn: async () => {
      const r = await servicos.publicacoes.comentarios(pub.id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function comentar() {
    setEnviando(true)
    const r = await servicos.publicacoes.comentar(pub.id, texto.trim())
    setEnviando(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      if (r.erro.codigo === 'comentarios_fechados') void consulta.refetch()
      return
    }
    setTexto('')
    await consulta.refetch()
    aoMudar()
  }
  const dados = consulta.data
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
      {consulta.isError ? (
        <Alert tone="danger" title="Não foi possível carregar os comentários." />
      ) : !dados ? (
        <Skeleton lines={2} />
      ) : (
        <>
          {dados.itens.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">Ainda não há comentários.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {dados.itens.map((c) => (
                <Comentario key={c.id} c={c} aoMudar={() => void consulta.refetch()} />
              ))}
            </ul>
          )}
          {dados.comentariosAbertos ? (
            <div className="flex flex-col gap-2">
              <TextArea
                label="Escreva um comentário"
                value={texto}
                maxLength={TAMANHO_MAXIMO_DO_COMENTARIO}
                onChange={(e) => setTexto(e.target.value)}
                hint="Texto simples. Os outros clientes veem seu primeiro nome e a inicial do sobrenome."
              />
              <div>
                <Button
                  variant="primary"
                  loading={enviando}
                  disabled={texto.trim() === ''}
                  onClick={() => void comentar()}
                >
                  Comentar
                </Button>
              </div>
            </div>
          ) : (
            <p className="m-0 text-sm text-ink-muted">Os comentários estão fechados.</p>
          )}
        </>
      )}
    </div>
  )
}

function Cartao({ pub, nomeDoPortal }: { pub: PublicacaoDoPortal; nomeDoPortal: string }) {
  const queryClient = useQueryClient()
  const [comentando, setComentando] = useState(false)
  const recarregar = () => void queryClient.invalidateQueries({ queryKey: ['feed'] })
  return (
    <article
      aria-label={pub.titulo}
      className="overflow-hidden rounded-md border border-border bg-surface"
    >
      <div className="flex flex-col gap-3 p-4">
        <header className="flex items-start gap-3">
          <Avatar name={nomeDoPortal} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm leading-5 font-semibold">{nomeDoPortal}</p>
            <p className="m-0 text-[13px] leading-4 text-ink-muted">{dataEHora(pub.publicadaEm)}</p>
          </div>
          {pub.fixada ? (
            <span className="inline-flex items-center gap-1 text-[13px] text-ink-muted">
              <Pin size={14} aria-hidden="true" /> Fixada
            </span>
          ) : null}
        </header>
        <h2 className="m-0 text-base leading-6 font-semibold">{pub.titulo}</h2>
        <Markdown texto={pub.corpo} />
        <MidiasDoFeed midias={pub.midias} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <Reacoes pub={pub} aoMudar={() => undefined} />
        <button
          type="button"
          aria-expanded={comentando}
          onClick={() => setComentando((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium text-ink-muted hover:text-ink"
        >
          <MessageCircle size={15} aria-hidden="true" />
          {pub.comentarios} {pub.comentarios === 1 ? 'comentário' : 'comentários'}
        </button>
      </div>
      {comentando ? <Comentarios pub={pub} aoMudar={recarregar} /> : null}
    </article>
  )
}

/** O feed de publicações da equipe (Início). Marca como lidas as que aparecem na tela. */
export function FeedDePublicacoes({ nomeDoPortal }: { nomeDoPortal: string }) {
  const servicos = useServicos()
  const consulta = useInfiniteQuery({
    queryKey: ['feed'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const r = await servicos.publicacoes.feed(pageParam)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
    getNextPageParam: (ultima, todas) =>
      todas.reduce((n, p) => n + p.itens.length, 0) < ultima.total ? todas.length + 1 : undefined,
  })
  const itens = useMemo(() => consulta.data?.pages.flatMap((p) => p.itens) ?? [], [consulta.data])
  const jaMarcadas = useRef(new Set<string>())
  useEffect(() => {
    const novas = itens.map((i) => i.id).filter((id) => !jaMarcadas.current.has(id))
    if (novas.length === 0) return
    for (const id of novas) jaMarcadas.current.add(id)
    void servicos.publicacoes.marcarLidas(novas.slice(0, 50))
  }, [itens, servicos])

  if (consulta.isError) {
    return (
      <Alert tone="danger" title="Não foi possível carregar as publicações.">
        Tente de novo em instantes.
      </Alert>
    )
  }
  if (consulta.isPending) return <Skeleton lines={4} />
  if (itens.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Nenhuma publicação ainda"
        description="Quando a equipe publicar um comunicado, ele aparece aqui."
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {itens.map((p) => (
        <Cartao key={p.id} pub={p} nomeDoPortal={nomeDoPortal} />
      ))}
      {consulta.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            loading={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Ver publicações anteriores
          </Button>
        </div>
      ) : null}
    </div>
  )
}
