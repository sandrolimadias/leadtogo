import type { EventoPublico } from '@leadtogo/api-client'
import type { FormularioParaResponder } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarDays, MapPin, Video } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { Dialog } from '@leadtogo/ui/dialog'
import { Avatar, Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Markdown } from '@leadtogo/ui/markdown'

import { comoResultadoDoEnvio } from '@/casca/resultado-do-envio'
import { diaEMes, diaPorExtenso, periodoDoEvento } from '@/casca/rotulos'
import { EnvioPublico } from '@/components/envio-publico'
import type { Resultado } from '@/servicos/resultado'
import { useServicos } from '@/servicos/contexto'

type Dialogo = { tipo: 'inscricao'; evento: EventoPublico } | { tipo: 'associacao' } | null

function DialogoPublico({
  titulo,
  chave,
  carregar,
  enviar,
  aoFechar,
}: {
  titulo: string
  chave: readonly unknown[]
  carregar: () => Promise<Resultado<FormularioParaResponder>>
  enviar: Parameters<typeof EnvioPublico>[0]['enviar']
  aoFechar: () => void
}) {
  const f = useQuery({
    queryKey: chave,
    retry: false,
    queryFn: async () => {
      const r = await carregar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) aoFechar()
      }}
      title={titulo}
      width={640}
    >
      {f.isError ? <Alert tone="danger">{f.error.message}</Alert> : null}
      {f.data ? (
        <EnvioPublico formulario={f.data} enviar={enviar} />
      ) : f.isError ? null : (
        <Skeleton lines={5} />
      )}
    </Dialog>
  )
}

const ROTULO_DA_DISPONIBILIDADE = {
  disponivel: null,
  poucas_vagas: 'Poucas vagas',
  lotado: 'Lotado · lista de espera',
} as const

function CartaoPublico({ e, aoInscrever }: { e: EventoPublico; aoInscrever: () => void }) {
  const dm = diaEMes(e.inicioEm)
  const vagas = ROTULO_DA_DISPONIBILIDADE[e.disponibilidade]
  return (
    <article
      aria-label={e.titulo}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
    >
      <div className="flex gap-3">
        <div
          aria-hidden="true"
          className="flex size-14 flex-none flex-col items-center justify-center rounded-md bg-surface-sunken"
        >
          <span className="text-[11px] leading-4 font-semibold text-ink-muted">{dm.mes}</span>
          <span className="text-xl leading-6 font-semibold">{dm.dia}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 text-base leading-6 font-semibold">{e.titulo}</h2>
          <p className="m-0 text-sm text-ink-muted">
            {diaPorExtenso(e.inicioEm)} · {periodoDoEvento(e.inicioEm, e.fimEm)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!e.inscricaoAberta ? <Badge tone="info">Exclusivo para associados</Badge> : null}
        {vagas ? <Badge tone="warning">{vagas}</Badge> : null}
      </div>
      {e.local ? (
        <p className="m-0 inline-flex items-center gap-1 text-sm text-ink-muted">
          <MapPin size={14} aria-hidden="true" /> {e.local}
        </p>
      ) : null}
      {e.online ? (
        <p className="m-0 inline-flex items-center gap-1 text-sm text-ink-muted">
          <Video size={14} aria-hidden="true" /> Online (o link chega a quem se inscreve)
        </p>
      ) : null}
      {e.descricao ? <Markdown texto={e.descricao} /> : null}
      <div className="mt-auto pt-1">
        {e.inscricaoAberta ? (
          <Button variant="primary" onClick={aoInscrever}>
            {e.disponibilidade === 'lotado' ? 'Entrar na lista de espera' : 'Inscrever-se'}
          </Button>
        ) : (
          <Link
            to="/entrar"
            className="inline-flex h-9 items-center rounded-sm border border-border px-3 text-sm font-semibold text-ink no-underline hover:bg-surface-hover"
          >
            Entrar para se inscrever
          </Link>
        )}
      </div>
    </article>
  )
}

/**
 * Página pública de eventos (Fase 4H, F-3 e F-4): sem login, pelo endereço do portal. Cartões em grade (1 coluna
 * no celular, 2 no tablet, 3 no computador), com Entrar e "Seja um Associado" no topo.
 */
export function TelaDeEventosPublicos({ slug }: { slug: string }) {
  const servicos = useServicos()
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const pagina = useQuery({
    queryKey: ['pagina-publica', slug],
    retry: false,
    queryFn: async () => {
      const r = await servicos.pagina.abrir(slug)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  useEffect(() => {
    if (pagina.data) document.title = `Eventos · ${pagina.data.nome}`
  }, [pagina.data])

  if (pagina.isError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
        <Alert tone="info">{pagina.error.message}</Alert>
      </main>
    )
  }
  const p = pagina.data
  return (
    <div className="min-h-dvh overflow-y-auto bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <Avatar name={p?.nome ?? 'Portal'} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-xs leading-4 text-ink-muted">Eventos</p>
            <h1 className="m-0 truncate text-xl leading-7 font-semibold">{p?.nome ?? '…'}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {p?.associacao ? (
              <Button variant="primary" onClick={() => setDialogo({ tipo: 'associacao' })}>
                Seja um Associado
              </Button>
            ) : null}
            <Link
              to="/entrar"
              className="inline-flex h-9 items-center rounded-sm border border-border px-3 text-sm font-semibold text-ink no-underline hover:bg-surface-hover"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {!p ? (
          <Skeleton lines={6} />
        ) : p.eventos.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nenhum evento agendado"
            description="Volte em breve: os próximos eventos aparecem aqui."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {p.eventos.map((e) => (
              <CartaoPublico
                key={e.id}
                e={e}
                aoInscrever={() => setDialogo({ tipo: 'inscricao', evento: e })}
              />
            ))}
          </div>
        )}
      </main>
      {dialogo?.tipo === 'inscricao' ? (
        <DialogoPublico
          titulo={`Inscrição: ${dialogo.evento.titulo}`}
          chave={['pagina-publica', slug, 'inscricao', dialogo.evento.id]}
          carregar={() => servicos.pagina.formularioDeInscricao(slug, dialogo.evento.id)}
          aoFechar={() => {
            setDialogo(null)
            void pagina.refetch()
          }}
          enviar={async (d) => {
            const r = await servicos.pagina.inscrever(slug, dialogo.evento.id, d)
            return r.ok
              ? { ok: true, mensagem: r.dados.mensagem }
              : { ok: false, resultado: comoResultadoDoEnvio(r) ?? { mensagem: 'Erro' } }
          }}
        />
      ) : null}
      {dialogo?.tipo === 'associacao' ? (
        <DialogoPublico
          titulo="Seja um Associado"
          chave={['pagina-publica', slug, 'associacao']}
          carregar={() => servicos.pagina.formularioDeAssociacao(slug)}
          aoFechar={() => setDialogo(null)}
          enviar={async (d) => {
            const r = await servicos.pagina.associar(slug, d)
            return r.ok
              ? { ok: true, mensagem: r.dados.mensagem }
              : { ok: false, resultado: comoResultadoDoEnvio(r) ?? { mensagem: 'Erro' } }
          }}
        />
      ) : null}
    </div>
  )
}
