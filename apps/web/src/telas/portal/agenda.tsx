import type { Evento, ItemDeEvento, ParticipanteDoEvento } from '@leadtogo/api-client'
import {
  ROTULO_DA_SITUACAO_DO_EVENTO,
  TAMANHOS_DE_PAGINA_DE_CARTOES,
  type SituacaoDoEvento,
} from '@leadtogo/shared'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Megaphone, Pencil, Plus, Trash2, UserMinus, XCircle } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePaginaDeCartoes } from '@/lib/por-pagina-local'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { cn } from '@leadtogo/ui/cn'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge, type TomDoBadge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Markdown } from '@leadtogo/ui/markdown'
import { Paginacao } from '@leadtogo/ui/paginacao'
import { toast } from '@leadtogo/ui/toast'

import { dataHora } from '../chamados/rotulos'

import { EditorDeEvento } from './editor-de-evento'

const TOM: Record<SituacaoDoEvento, TomDoBadge> = {
  rascunho: 'neutral',
  publicado: 'success',
  cancelado: 'danger',
}
type Aba = 'proximos' | 'passados' | 'rascunhos'
const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: 'proximos', rotulo: 'Próximos' },
  { valor: 'passados', rotulo: 'Passados' },
  { valor: 'rascunhos', rotulo: 'Rascunhos' },
]

const vagas = (e: ItemDeEvento): string =>
  e.vagasTotais === null
    ? `${e.confirmados} confirmados · sem limite de vagas`
    : `${e.confirmados} de ${e.vagasTotais} vagas${e.listaDeEspera > 0 ? ` · ${e.listaDeEspera} na fila` : ''}`

function LinhaDaLista({
  e,
  ativa,
  aoEscolher,
}: {
  e: ItemDeEvento
  ativa: boolean
  aoEscolher: () => void
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-current={ativa ? 'true' : undefined}
        onClick={aoEscolher}
        className={cn(
          'flex w-full cursor-pointer flex-col gap-1 border-0 px-4 py-3 text-left',
          ativa ? 'bg-brand-soft' : 'bg-transparent hover:bg-surface-hover',
        )}
      >
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={TOM[e.situacao]}>{ROTULO_DA_SITUACAO_DO_EVENTO[e.situacao]}</Badge>
          <span className="ml-auto text-ink-muted">{dataHora(e.inicioEm)}</span>
        </span>
        <span className="font-semibold">{e.titulo}</span>
        {e.situacao !== 'rascunho' ? (
          <span className="text-xs text-ink-muted">{vagas(e)}</span>
        ) : null}
      </button>
    </li>
  )
}

function Pessoa({
  p,
  podeGerir,
  aoRemover,
}: {
  p: ParticipanteDoEvento
  podeGerir: boolean
  aoRemover: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 last:border-b-0">
      {p.posicaoNaFila !== null ? (
        <span className="w-6 text-sm font-semibold text-ink-muted tabular-nums">
          {p.posicaoNaFila}º
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 basis-48 flex-col">
        <span className="truncate font-semibold">{p.pessoa}</span>
        <span className="truncate text-xs text-ink-muted">
          {p.empresa} · {p.email}
        </span>
      </span>
      <span className="text-xs text-ink-muted tabular-nums">
        {p.promovidoEm
          ? `Promovido em ${dataHora(p.promovidoEm)}`
          : dataHora(p.confirmadoEm ?? p.entrouNaFilaEm)}
      </span>
      {podeGerir ? (
        <Button
          size="sm"
          variant="ghost"
          icon={UserMinus}
          aria-label={`Tirar ${p.pessoa}`}
          onClick={aoRemover}
        >
          Tirar
        </Button>
      ) : null}
    </li>
  )
}

function Detalhe({
  id,
  aoMudar,
  aoEditar,
  aoPublicar,
}: {
  id: string
  aoMudar: () => void
  aoEditar: (e: Evento) => void
  /** O rascunho virou publicado: a lista passa para "Próximos", onde ele agora aparece */
  aoPublicar: () => void
}) {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const queryClient = useQueryClient()
  const podeGerir = pode('portal.agenda')
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [removendo, setRemovendo] = useState<ParticipanteDoEvento | null>(null)
  const [agora] = useState(() => Date.now())

  const detalhe = useQuery({
    queryKey: ['portal', 'evento', id],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.eventos.obter(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const participantes = useQuery({
    queryKey: ['portal', 'evento', id, 'participantes'],
    retry: false,
    enabled: detalhe.data?.situacao !== 'rascunho' && detalhe.data !== undefined,
    queryFn: async () => {
      const r = await servicos.portal.eventos.participantes(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ['portal', 'evento', id] })
    aoMudar()
  }

  const e = detalhe.data
  if (detalhe.isError) return <Alert tone="danger">{detalhe.error.message}</Alert>
  if (!e) {
    return (
      <div className="p-4">
        <Skeleton lines={5} />
      </div>
    )
  }
  const passado = new Date(e.fimEm).getTime() <= agora
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 flex flex-wrap items-center gap-2 text-lg leading-6 font-semibold">
              {e.titulo}
              <Badge tone={TOM[e.situacao]}>{ROTULO_DA_SITUACAO_DO_EVENTO[e.situacao]}</Badge>
            </h2>
            <p className="m-0 text-[13px] text-ink-muted">
              {dataHora(e.inicioEm)} até {dataHora(e.fimEm)}
              {e.local ? ` · ${e.local}` : ''} ·{' '}
              {e.alcance === 'todos'
                ? 'Todos os clientes'
                : e.alcance === 'tags'
                  ? `Tags: ${e.tags.map((t) => t.nome).join(', ')}`
                  : `${e.empresas.length} ${e.empresas.length === 1 ? 'empresa' : 'empresas'}`}
            </p>
          </div>
          {podeGerir ? (
            <div className="flex flex-wrap gap-2">
              {e.situacao === 'rascunho' ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={Megaphone}
                  onClick={() => {
                    void servicos.portal.eventos.publicar(e.id).then((r) => {
                      if (!r.ok) toast.error(r.erro.mensagem)
                      else {
                        toast.success('Evento publicado')
                        aoPublicar()
                        recarregar()
                      }
                    })
                  }}
                >
                  Publicar
                </Button>
              ) : null}
              {e.situacao !== 'cancelado' ? (
                <Button size="sm" icon={Pencil} onClick={() => aoEditar(e)}>
                  Editar
                </Button>
              ) : null}
              {e.situacao === 'publicado' && !passado ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={XCircle}
                  onClick={() => setCancelando(true)}
                >
                  Cancelar evento
                </Button>
              ) : null}
              {e.situacao !== 'publicado' ? (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setExcluindo(true)}>
                  Excluir
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {e.situacao === 'cancelado' ? (
          <Alert tone="danger" title="Evento cancelado">
            {e.canceladoMotivo}
          </Alert>
        ) : null}
        {e.descricao ? (
          <div className="rounded-sm bg-surface-sunken p-3">
            <Markdown texto={e.descricao} />
          </div>
        ) : null}
        {e.linkOnline ? (
          <p className="m-0 text-sm text-ink-muted">Link online: {e.linkOnline}</p>
        ) : null}
        <p className="m-0 text-[13px] text-ink-muted">
          {e.vagasTotais === null ? 'Sem limite de vagas' : `${e.vagasTotais} vagas`}
          {e.vagasPorEmpresa !== null ? ` · até ${e.vagasPorEmpresa} por empresa` : ''}
          {e.prazoConfirmacao ? ` · confirmar até ${dataHora(e.prazoConfirmacao)}` : ''}
        </p>
        {e.alcance === 'empresas' && e.empresas.length > 0 ? (
          <p className="m-0 text-[13px] text-ink-muted">
            Empresas: {e.empresas.map((x) => x.nome).join(', ')}
          </p>
        ) : null}
      </div>

      {e.situacao !== 'rascunho' ? (
        <section aria-label="Participantes" className="flex flex-col">
          {!participantes.data ? (
            <div className="p-4">
              <Skeleton lines={2} />
            </div>
          ) : (
            <>
              <h3 className="m-0 px-4 pt-3 pb-2 text-[15px] leading-5 font-semibold">
                Confirmados ({participantes.data.confirmados.length})
              </h3>
              {participantes.data.confirmados.length === 0 ? (
                <p className="m-0 px-4 pb-3 text-sm text-ink-muted">Ninguém confirmou ainda.</p>
              ) : (
                <ul aria-label="Confirmados" className="m-0 list-none border-t border-border p-0">
                  {participantes.data.confirmados.map((p) => (
                    <Pessoa
                      key={p.id}
                      p={p}
                      podeGerir={podeGerir && e.situacao === 'publicado' && !passado}
                      aoRemover={() => setRemovendo(p)}
                    />
                  ))}
                </ul>
              )}
              <h3 className="m-0 border-t border-border px-4 pt-3 pb-2 text-[15px] leading-5 font-semibold">
                Lista de espera ({participantes.data.listaDeEspera.length})
              </h3>
              {participantes.data.listaDeEspera.length === 0 ? (
                <p className="m-0 px-4 pb-3 text-sm text-ink-muted">Ninguém esperando.</p>
              ) : (
                <ul
                  aria-label="Lista de espera"
                  className="m-0 list-none border-t border-border p-0"
                >
                  {participantes.data.listaDeEspera.map((p) => (
                    <Pessoa
                      key={p.id}
                      p={p}
                      podeGerir={podeGerir && e.situacao === 'publicado' && !passado}
                      aoRemover={() => setRemovendo(p)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      ) : null}

      {cancelando ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setCancelando(false)
          }}
          title="Cancelar evento"
          description="Quem está confirmado ou na lista de espera recebe um aviso com o motivo. O cliente continua vendo o evento como cancelado."
          footer={
            <>
              <Button onClick={() => setCancelando(false)}>Voltar</Button>
              <Button
                variant="danger"
                disabled={motivo.trim() === ''}
                onClick={() => {
                  void servicos.portal.eventos
                    .cancelar(e.id, { motivo: motivo.trim() })
                    .then((r) => {
                      if (!r.ok) {
                        toast.error(r.erro.mensagem)
                        return
                      }
                      toast.success('Evento cancelado')
                      setCancelando(false)
                      recarregar()
                    })
                }}
              >
                Cancelar evento
              </Button>
            </>
          }
        >
          <TextField
            label="Motivo"
            required
            maxLength={300}
            value={motivo}
            onChange={(x) => setMotivo(x.target.value)}
          />
        </Dialog>
      ) : null}

      {excluindo ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setExcluindo(false)
          }}
          title="Excluir evento"
          description="Ele some da lista. Os dados ficam guardados."
          footer={
            <>
              <Button onClick={() => setExcluindo(false)}>Voltar</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void servicos.portal.eventos.excluir(e.id).then((r) => {
                    if (!r.ok) {
                      toast.error(r.erro.mensagem)
                      return
                    }
                    toast.success('Evento excluído')
                    setExcluindo(false)
                    aoMudar()
                  })
                }}
              >
                Excluir
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm">Excluir “{e.titulo}”?</p>
        </Dialog>
      ) : null}

      {removendo ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setRemovendo(null)
          }}
          title="Tirar do evento"
          description={
            removendo.situacao === 'confirmado'
              ? 'A vaga é liberada e o primeiro da lista de espera que couber é promovido e avisado.'
              : 'A pessoa sai da lista de espera.'
          }
          footer={
            <>
              <Button onClick={() => setRemovendo(null)}>Voltar</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const alvo = removendo
                  void servicos.portal.eventos.removerParticipante(e.id, alvo.id).then((r) => {
                    if (!r.ok) {
                      toast.error(r.erro.mensagem)
                      return
                    }
                    toast.success('Participante retirado')
                    setRemovendo(null)
                    void participantes.refetch()
                    recarregar()
                  })
                }}
              >
                Tirar
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm">
            Tirar {removendo.pessoa} ({removendo.empresa}) de “{e.titulo}”?
          </p>
        </Dialog>
      ) : null}
    </div>
  )
}

/** Aba Agenda do hub: os eventos, as vagas e a lista de espera; criar, publicar, editar e cancelar. */
export function AgendaDoPortal() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('proximos')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [editando, setEditando] = useState<Evento | 'novo' | null>(null)
  const paginacao = usePaginaDeCartoes('portal_agenda')
  const lista = useQuery({
    queryKey: ['portal', 'eventos', aba, paginacao.pagina, paginacao.porPagina],
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.eventos.listar({
        aba,
        pagina: paginacao.pagina,
        porPagina: paginacao.porPagina,
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () => void queryClient.invalidateQueries({ queryKey: ['portal', 'eventos'] })
  const itens = lista.data?.itens ?? []
  const idAtivo =
    escolhido && itens.some((i) => i.id === escolhido) ? escolhido : (itens[0]?.id ?? null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Situação"
          className="inline-flex gap-0.5 rounded-sm border border-border bg-surface-sunken p-0.5"
        >
          {ABAS.map((a) => (
            <button
              key={a.valor}
              type="button"
              aria-pressed={aba === a.valor}
              onClick={() => {
                setAba(a.valor)
                paginacao.voltarAoInicio()
              }}
              className={cn(
                'cursor-pointer rounded-sm border-0 px-3 py-1 text-[13px] font-semibold',
                aba === a.valor ? 'bg-surface text-ink shadow-sm' : 'bg-transparent text-ink-muted',
              )}
            >
              {a.rotulo}
              {lista.data ? ` (${lista.data.abas[a.valor]})` : ''}
            </button>
          ))}
        </div>
        {pode('portal.agenda') ? (
          <Button variant="primary" icon={Plus} onClick={() => setEditando('novo')}>
            Novo evento
          </Button>
        ) : null}
      </div>
      {lista.isError ? (
        <Alert tone="danger">Não consegui carregar a agenda. {lista.error.message}</Alert>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          {!lista.data ? (
            <div className="p-4">
              <Skeleton lines={4} />
            </div>
          ) : itens.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nenhum evento"
              description="Crie um evento, publique, e os clientes confirmam a presença pelo portal."
            />
          ) : (
            <>
              <ul aria-label="Eventos" className="m-0 list-none p-0">
                {itens.map((e) => (
                  <LinhaDaLista
                    key={e.id}
                    e={e}
                    ativa={e.id === idAtivo}
                    aoEscolher={() => setEscolhido(e.id)}
                  />
                ))}
              </ul>
              <Paginacao
                pagina={paginacao.pagina}
                porPagina={paginacao.porPagina}
                total={lista.data.total}
                tamanhos={TAMANHOS_DE_PAGINA_DE_CARTOES}
                rotuloDoTamanho="Por página"
                aoMudarPagina={paginacao.irPara}
                aoMudarPorPagina={paginacao.mudarTamanho}
              />
            </>
          )}
        </div>
        {idAtivo ? (
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <Detalhe
              key={idAtivo}
              id={idAtivo}
              aoMudar={recarregar}
              aoEditar={(e) => setEditando(e)}
              aoPublicar={() => setAba('proximos')}
            />
          </div>
        ) : null}
      </div>
      {editando ? (
        <EditorDeEvento
          inicial={editando === 'novo' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(e) => {
            setEditando(null)
            setEscolhido(e.id)
            // o rascunho não está em "Próximos": leva a pessoa para onde o evento aparece
            if (e.situacao === 'rascunho') setAba('rascunhos')
            recarregar()
            void queryClient.invalidateQueries({ queryKey: ['portal', 'evento', e.id] })
          }}
        />
      ) : null}
    </div>
  )
}
