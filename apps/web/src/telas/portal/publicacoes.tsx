import type { ComentarioParaModeracao, ItemDePublicacao, Publicacao } from '@leadtogo/api-client'
import {
  ROTULO_DA_SITUACAO_DA_PUBLICACAO,
  ROTULO_DO_MOTIVO_DE_DENUNCIA,
  TAMANHOS_DE_PAGINA_DE_CARTOES,
  type SituacaoDaPublicacao,
} from '@leadtogo/shared'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Flag, Megaphone, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { usePermissoes } from '@/auth/permissoes'
import { useServicos } from '@/auth/contexto'
import { usePaginaDeCartoes } from '@/lib/por-pagina-local'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { cn } from '@leadtogo/ui/cn'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge, type TomDoBadge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Markdown } from '@leadtogo/ui/markdown'
import { Paginacao } from '@leadtogo/ui/paginacao'
import { toast } from '@leadtogo/ui/toast'

import { dataCurta, dataHora } from '../chamados/rotulos'

import { EditorDePublicacao } from './editor-de-publicacao'

const TOM: Record<SituacaoDaPublicacao, TomDoBadge> = {
  rascunho: 'neutral',
  agendada: 'info',
  publicada: 'success',
}
type Aba = 'todas' | 'publicadas' | 'agendadas' | 'rascunhos'
const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'publicadas', rotulo: 'Publicadas' },
  { valor: 'agendadas', rotulo: 'Agendadas' },
  { valor: 'rascunhos', rotulo: 'Rascunhos' },
]

const alcancePct = (leitores: number, alvo: number) =>
  alvo > 0 ? Math.min(100, Math.round((leitores / alvo) * 100)) : 0
const totalDeReacoes = (r: { curtir: number; parabens: number }) => r.curtir + r.parabens

function quando(p: ItemDePublicacao): string {
  if (p.situacao === 'agendada' && p.agendadaPara)
    return `Agendada para ${dataHora(p.agendadaPara)}`
  if (p.situacao === 'publicada' && p.publicadaEm) return dataCurta(p.publicadaEm)
  return `Editado em ${dataCurta(p.atualizadoEm)}`
}

function LinhaDaLista({
  p,
  ativa,
  aoEscolher,
}: {
  p: ItemDePublicacao
  ativa: boolean
  aoEscolher: () => void
}) {
  const m = p.metricas
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
          <Badge tone={TOM[p.situacao]}>{ROTULO_DA_SITUACAO_DA_PUBLICACAO[p.situacao]}</Badge>
          {p.fixada ? (
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <Pin size={12} aria-hidden="true" /> Fixada
            </span>
          ) : null}
          {m.denunciasAbertas > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-danger">
              <Flag size={12} aria-hidden="true" /> {m.denunciasAbertas}{' '}
              {m.denunciasAbertas === 1 ? 'denúncia' : 'denúncias'}
            </span>
          ) : null}
          <span className="ml-auto text-ink-muted">{quando(p)}</span>
        </span>
        <span className="font-semibold">{p.titulo}</span>
        {p.situacao === 'publicada' ? (
          <span className="text-xs text-ink-muted">
            {alcancePct(m.leitores, m.alvo)}% de alcance · {totalDeReacoes(m.reacoes)} reações ·{' '}
            {m.comentarios} comentários
          </span>
        ) : null}
      </button>
    </li>
  )
}

function Metrica({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface p-3">
      <span className="text-xs text-ink-muted">{rotulo}</span>
      <span className="text-xl leading-7 font-semibold tabular-nums">{valor}</span>
      <span className="text-xs text-ink-muted">{nota}</span>
    </div>
  )
}

function ComentarioParaModerar({
  c,
  podeModerar,
  aoModerar,
}: {
  c: ComentarioParaModeracao
  podeModerar: boolean
  aoModerar: (acao: 'manter' | 'ocultar' | 'reexibir') => void
}) {
  const denunciado = c.denunciasAbertas > 0
  return (
    <li
      className={cn(
        'flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0',
        denunciado && 'bg-danger-soft',
      )}
    >
      <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px]">
        <span className="font-semibold">{c.autorNome}</span>
        <span className="text-ink-muted">
          {c.empresaNome} · {dataHora(c.criadoEm)}
        </span>
        {denunciado ? (
          <span className="inline-flex items-center gap-1 font-semibold text-danger">
            <Flag size={12} aria-hidden="true" />
            {c.motivoDaDenuncia
              ? ROTULO_DO_MOTIVO_DE_DENUNCIA[c.motivoDaDenuncia]
              : 'Denunciado'} · {c.denunciasAbertas}{' '}
            {c.denunciasAbertas === 1 ? 'denúncia' : 'denúncias'}
          </span>
        ) : null}
        {c.oculto ? <Badge tone="warning">Oculto</Badge> : null}
      </p>
      <p className="m-0 text-sm leading-5 break-words whitespace-pre-wrap">{c.corpo}</p>
      {c.oculto ? (
        <p className="m-0 text-xs text-ink-muted">
          Ocultado{c.ocultoPorNome ? ` por ${c.ocultoPorNome}` : ''}
          {c.ocultoMotivo ? `: ${c.ocultoMotivo}` : ''}. O autor continua vendo o comentário e o
          motivo.
        </p>
      ) : null}
      {podeModerar ? (
        <div className="flex flex-wrap gap-2">
          {denunciado ? (
            <Button size="sm" variant="ghost" onClick={() => aoModerar('manter')}>
              Manter
            </Button>
          ) : null}
          {c.oculto ? (
            <Button size="sm" variant="ghost" onClick={() => aoModerar('reexibir')}>
              Reexibir
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => aoModerar('ocultar')}>
              Ocultar
            </Button>
          )}
        </div>
      ) : null}
    </li>
  )
}

function Detalhe({
  id,
  aoMudar,
  aoEditar,
  aoDuplicar,
}: {
  id: string
  aoMudar: () => void
  aoEditar: (p: Publicacao) => void
  /** A cópia criada: a lista abre nela */
  aoDuplicar: (copia: Publicacao) => void
}) {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const queryClient = useQueryClient()
  const podePublicar = pode('portal.publicar')
  const podeModerar = pode('portal.moderar')
  const [ocultando, setOcultando] = useState<ComentarioParaModeracao | null>(null)
  const [motivo, setMotivo] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  const detalhe = useQuery({
    queryKey: ['portal', 'publicacao', id],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.publicacoes.obter(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const comentarios = useQuery({
    queryKey: ['portal', 'publicacao', id, 'comentarios'],
    retry: false,
    enabled: podeModerar,
    queryFn: async () => {
      const r = await servicos.portal.publicacoes.comentarios(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ['portal', 'publicacao', id] })
    aoMudar()
  }

  async function agir<T>(
    chamada: Promise<{ ok: true; dados: T } | { ok: false; erro: { mensagem: string } }>,
    sucesso?: string,
  ) {
    const r = await chamada
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return false
    }
    if (sucesso) toast.success(sucesso)
    recarregar()
    return true
  }

  const p = detalhe.data
  if (detalhe.isError) return <Alert tone="danger">{detalhe.error.message}</Alert>
  if (!p) {
    return (
      <div className="p-4">
        <Skeleton lines={5} />
      </div>
    )
  }
  const m = p.metricas
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg leading-6 font-semibold">{p.titulo}</h2>
            <p className="m-0 text-[13px] text-ink-muted">
              {p.autorNome ?? 'Equipe'} · {quando(p)} ·{' '}
              {p.alcance === 'todos'
                ? 'Todos os clientes'
                : `${p.empresas.length} ${p.empresas.length === 1 ? 'empresa' : 'empresas'}`}
            </p>
          </div>
          {podePublicar ? (
            <div className="flex flex-wrap gap-2">
              {p.situacao === 'publicada' ? (
                <Button
                  size="sm"
                  icon={p.fixada ? PinOff : Pin}
                  onClick={() =>
                    void agir(
                      servicos.portal.publicacoes.fixar(p.id, !p.fixada),
                      p.fixada ? 'Publicação desafixada' : 'Publicação fixada no topo',
                    )
                  }
                >
                  {p.fixada ? 'Desafixar' : 'Fixar'}
                </Button>
              ) : null}
              <Button size="sm" icon={Pencil} onClick={() => aoEditar(p)}>
                Editar
              </Button>
              <Button
                size="sm"
                icon={Copy}
                onClick={() =>
                  void (async () => {
                    const r = await servicos.portal.publicacoes.duplicar(p.id)
                    if (!r.ok) {
                      toast.error(r.erro.mensagem)
                      return
                    }
                    toast.success('Cópia criada como rascunho')
                    aoDuplicar(r.dados)
                  })()
                }
              >
                Duplicar
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setExcluindo(true)}>
                Excluir
              </Button>
            </div>
          ) : null}
        </div>
        <div className="rounded-sm bg-surface-sunken p-3">
          <Markdown texto={p.corpo} />
        </div>
        {p.alcance === 'empresas' && p.empresas.length > 0 ? (
          <p className="m-0 text-[13px] text-ink-muted">
            Empresas: {p.empresas.map((e) => e.nome).join(', ')}
          </p>
        ) : null}
        {p.situacao === 'publicada' ? (
          <div
            role="region"
            aria-label="Métricas da publicação"
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            <Metrica
              rotulo="Alcance"
              valor={`${alcancePct(m.leitores, m.alvo)}%`}
              nota={`${m.leitores} de ${m.alvo} clientes`}
            />
            <Metrica
              rotulo="Reações"
              valor={String(totalDeReacoes(m.reacoes))}
              nota="curtir e parabéns"
            />
            <Metrica
              rotulo="Comentários"
              valor={String(m.comentarios)}
              nota={`${m.comentariosOcultos} ocultos`}
            />
            <Metrica
              rotulo="Empresas"
              valor={String(m.empresasAlcancadas)}
              nota="com ao menos 1 leitura"
            />
          </div>
        ) : null}
      </div>

      {p.situacao === 'publicada' && podeModerar ? (
        <section aria-labelledby="moderacao" className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <h3 id="moderacao" className="m-0 text-[15px] leading-5 font-semibold">
              Comentários e moderação
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void agir(
                  servicos.portal.publicacoes.bloquearComentarios(p.id, !p.comentariosBloqueados),
                  p.comentariosBloqueados ? 'Comentários liberados' : 'Comentários bloqueados',
                )
              }
            >
              {p.comentariosBloqueados ? 'Liberar comentários' : 'Bloquear comentários'}
            </Button>
          </div>
          <p className="m-0 px-4 pb-2 text-xs text-ink-muted">
            Ocultar não apaga: o autor e a equipe continuam vendo o motivo.
          </p>
          {!comentarios.data ? (
            <div className="p-4">
              <Skeleton lines={2} />
            </div>
          ) : comentarios.data.length === 0 ? (
            <p className="m-0 px-4 pb-4 text-sm text-ink-muted">Nenhum comentário ainda.</p>
          ) : (
            <ul
              aria-label="Comentários da publicação"
              className="m-0 list-none border-t border-border p-0"
            >
              {comentarios.data.map((c) => (
                <ComentarioParaModerar
                  key={c.id}
                  c={c}
                  podeModerar={podeModerar}
                  aoModerar={(acao) => {
                    if (acao === 'ocultar') {
                      setMotivo('')
                      setOcultando(c)
                      return
                    }
                    void servicos.portal.publicacoes.moderar(p.id, c.id, { acao }).then((r) => {
                      if (!r.ok) toast.error(r.erro.mensagem)
                      else {
                        toast.success(
                          acao === 'manter' ? 'Comentário mantido' : 'Comentário reexibido',
                        )
                        void comentarios.refetch()
                        recarregar()
                      }
                    })
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {ocultando ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setOcultando(null)
          }}
          title="Ocultar comentário"
          description="O comentário some para os outros clientes, mas não é apagado: o autor continua vendo, com o motivo."
          footer={
            <>
              <Button onClick={() => setOcultando(null)}>Cancelar</Button>
              <Button
                variant="primary"
                disabled={motivo.trim() === ''}
                onClick={() => {
                  const alvo = ocultando
                  void servicos.portal.publicacoes
                    .moderar(p.id, alvo.id, { acao: 'ocultar', motivo: motivo.trim() })
                    .then((r) => {
                      if (!r.ok) {
                        toast.error(r.erro.mensagem)
                        return
                      }
                      toast.success('Comentário ocultado')
                      setOcultando(null)
                      void comentarios.refetch()
                      recarregar()
                    })
                }}
              >
                Ocultar
              </Button>
            </>
          }
        >
          <TextField
            label="Motivo"
            required
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Dialog>
      ) : null}

      {excluindo ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setExcluindo(false)
          }}
          title="Excluir publicação"
          description="Ela some do portal e da lista. Os dados ficam guardados."
          footer={
            <>
              <Button onClick={() => setExcluindo(false)}>Cancelar</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void servicos.portal.publicacoes.excluir(p.id).then((r) => {
                    if (!r.ok) {
                      toast.error(r.erro.mensagem)
                      return
                    }
                    toast.success('Publicação excluída')
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
          <p className="m-0 text-sm">
            Excluir “{p.titulo}”? {p.situacao === 'publicada' ? 'Os clientes deixam de vê-la.' : ''}
          </p>
        </Dialog>
      ) : null}
    </div>
  )
}

/**
 * Aba Publicações do hub: lista (com o aviso das denúncias abertas) e o detalhe com as métricas, a edição e a
 * moderação dos comentários.
 */
export function PublicacoesDoPortal() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('todas')
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [editando, setEditando] = useState<Publicacao | 'nova' | null>(null)
  const paginacao = usePaginaDeCartoes('portal_publicacoes')
  const lista = useQuery({
    queryKey: ['portal', 'publicacoes', aba, paginacao.pagina, paginacao.porPagina],
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.publicacoes.listar({
        aba,
        pagina: paginacao.pagina,
        porPagina: paginacao.porPagina,
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ['portal', 'publicacoes'] })
  }
  const itens = lista.data?.itens ?? []
  const idAtivo =
    escolhida && itens.some((i) => i.id === escolhida) ? escolhida : (itens[0]?.id ?? null)
  const denuncias = lista.data?.denunciasAbertas ?? 0

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
        {pode('portal.publicar') ? (
          <Button variant="primary" icon={Plus} onClick={() => setEditando('nova')}>
            Nova publicação
          </Button>
        ) : null}
      </div>

      {denuncias > 0 && pode('portal.moderar') ? (
        <Alert
          tone="danger"
          title={`${denuncias} ${denuncias === 1 ? 'comentário denunciado aguarda' : 'comentários denunciados aguardam'} análise`}
        >
          Abra a publicação marcada com a bandeira vermelha e escolha Manter ou Ocultar.
        </Alert>
      ) : null}
      {lista.isError ? (
        <Alert tone="danger">Não consegui carregar as publicações. {lista.error.message}</Alert>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          {!lista.data ? (
            <div className="p-4">
              <Skeleton lines={4} />
            </div>
          ) : itens.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="Nenhuma publicação"
              description="Escreva um comunicado e ele aparece no Início do portal dos clientes."
            />
          ) : (
            <>
              <ul aria-label="Publicações" className="m-0 list-none p-0">
                {itens.map((p) => (
                  <LinhaDaLista
                    key={p.id}
                    p={p}
                    ativa={p.id === idAtivo}
                    aoEscolher={() => setEscolhida(p.id)}
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
              aoEditar={(p) => setEditando(p)}
              aoDuplicar={(copia) => {
                setAba('rascunhos')
                paginacao.voltarAoInicio()
                setEscolhida(copia.id)
                recarregar()
              }}
            />
          </div>
        ) : null}
      </div>

      {editando ? (
        <EditorDePublicacao
          inicial={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(p) => {
            setEditando(null)
            setEscolhida(p.id)
            recarregar()
            void queryClient.invalidateQueries({ queryKey: ['portal', 'publicacao', p.id] })
          }}
        />
      ) : null}
    </div>
  )
}
