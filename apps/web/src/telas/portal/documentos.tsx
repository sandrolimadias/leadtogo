import type { ItemDeDocumento } from '@leadtogo/api-client'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, EyeOff, FileText, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Badge, type TomDoBadge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Paginacao } from '@leadtogo/ui/paginacao'
import { toast } from '@leadtogo/ui/toast'

import { dataCurta, dataHora, tamanhoLegivel } from '../chamados/rotulos'

import { EditorDeDocumento } from './editor-de-documento'

function situacaoDoArquivo(a: ItemDeDocumento['arquivo']): { rotulo: string; tom: TomDoBadge } {
  if (!a.enviado) return { rotulo: 'Aguardando envio', tom: 'neutral' }
  if (a.estado === 'limpo') return { rotulo: 'Disponível', tom: 'success' }
  if (a.estado === 'infectado') return { rotulo: 'Bloqueado pelo antivírus', tom: 'danger' }
  return { rotulo: 'Em verificação', tom: 'info' }
}

function QuemBaixou({ doc, aoFechar }: { doc: ItemDeDocumento; aoFechar: () => void }) {
  const servicos = useServicos()
  const baixas = useQuery({
    queryKey: ['portal', 'documentos', doc.id, 'baixas'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.documentos.baixas(doc.id)
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
      title="Quem baixou"
      description={doc.titulo}
      width={560}
      footer={<Button onClick={aoFechar}>Fechar</Button>}
    >
      {baixas.isError ? <Alert tone="danger">{baixas.error.message}</Alert> : null}
      {!baixas.data ? (
        <Skeleton lines={3} />
      ) : baixas.data.itens.length === 0 ? (
        <p className="m-0 text-sm text-ink-muted">Ninguém baixou este documento ainda.</p>
      ) : (
        <>
          <ul aria-label="Downloads" className="m-0 flex list-none flex-col gap-2 p-0">
            {baixas.data.itens.map((b, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{b.pessoa}</span>
                <span className="text-ink-muted">{b.empresa}</span>
                <span className="ml-auto text-xs text-ink-muted tabular-nums">
                  {dataHora(b.baixadoEm)}
                </span>
              </li>
            ))}
          </ul>
          {baixas.data.total > baixas.data.itens.length ? (
            <p className="mt-2 mb-0 text-xs text-ink-muted">
              Mostrando os {baixas.data.itens.length} mais recentes de {baixas.data.total}.
            </p>
          ) : null}
        </>
      )}
    </Dialog>
  )
}

function Linha({ d, aoMudar }: { d: ItemDeDocumento; aoMudar: () => void }) {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const podeEscrever = pode('portal.documentos')
  const [editando, setEditando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [verBaixas, setVerBaixas] = useState(false)
  const queryClient = useQueryClient()
  const situacao = situacaoDoArquivo(d.arquivo)

  async function baixar() {
    const r = await servicos.portal.documentos.baixar(d.id)
    if (!r.ok) toast.error(r.erro.mensagem)
    else window.location.assign(r.dados.url)
  }
  async function alternarVisibilidade() {
    const r = await servicos.portal.documentos.editar(d.id, { visivelNoPortal: !d.visivelNoPortal })
    if (!r.ok) toast.error(r.erro.mensagem)
    else {
      toast.success(
        r.dados.visivelNoPortal ? 'Documento visível no portal' : 'Documento tirado do portal',
      )
      aoMudar()
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 basis-64 flex-col">
        <span className="truncate font-semibold">{d.titulo}</span>
        <span className="truncate text-xs text-ink-muted">
          {d.arquivo.nome} · {tamanhoLegivel(d.arquivo.tamanho)} · {dataCurta(d.criadoEm)}
          {d.alcance === 'empresas'
            ? ' · empresas escolhidas'
            : d.alcance === 'tags'
              ? ' · contatos com tags'
              : ' · todos os clientes'}
        </span>
      </div>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={situacao.tom}>{situacao.rotulo}</Badge>
        {!d.visivelNoPortal ? <Badge tone="warning">Fora do portal</Badge> : null}
      </span>
      <button
        type="button"
        onClick={() => setVerBaixas(true)}
        className="min-w-[88px] cursor-pointer border-0 bg-transparent p-0 text-right text-[13px] text-ink-muted tabular-nums hover:text-ink"
        aria-label={`${d.totalDownloads} downloads de ${d.titulo}: ver quem baixou`}
      >
        <Users size={13} aria-hidden="true" className="mr-1 inline" />
        {d.totalDownloads} {d.totalDownloads === 1 ? 'download' : 'downloads'}
      </button>
      <span className="flex flex-wrap gap-1.5">
        {d.arquivo.estado === 'limpo' ? (
          <Button size="sm" variant="ghost" icon={Download} onClick={() => void baixar()}>
            Baixar
          </Button>
        ) : null}
        {podeEscrever ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={d.visivelNoPortal ? EyeOff : Eye}
              onClick={() => void alternarVisibilidade()}
            >
              {d.visivelNoPortal ? 'Tirar do portal' : 'Mostrar no portal'}
            </Button>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setExcluindo(true)}>
              Excluir
            </Button>
          </>
        ) : null}
      </span>

      {verBaixas ? <QuemBaixou doc={d} aoFechar={() => setVerBaixas(false)} /> : null}
      {editando ? (
        <EditorDeDocumentoCarregado
          id={d.id}
          aoFechar={() => setEditando(false)}
          aoSalvar={() => {
            setEditando(false)
            aoMudar()
            void queryClient.invalidateQueries({ queryKey: ['portal', 'documentos'] })
          }}
        />
      ) : null}
      {excluindo ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setExcluindo(false)
          }}
          title="Excluir documento"
          description="Ele some do portal e da lista. Os dados ficam guardados."
          footer={
            <>
              <Button onClick={() => setExcluindo(false)}>Cancelar</Button>
              <Button
                variant="danger"
                onClick={() => {
                  void servicos.portal.documentos.excluir(d.id).then((r) => {
                    if (!r.ok) {
                      toast.error(r.erro.mensagem)
                      return
                    }
                    toast.success('Documento excluído')
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
          <p className="m-0 text-sm">Excluir “{d.titulo}”?</p>
        </Dialog>
      ) : null}
    </li>
  )
}

/** Busca o detalhe (com as empresas do alcance) antes de abrir a edição. */
function EditorDeDocumentoCarregado({
  id,
  aoFechar,
  aoSalvar,
}: {
  id: string
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const servicos = useServicos()
  const detalhe = useQuery({
    queryKey: ['portal', 'documentos', id],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.documentos.obter(id)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (!detalhe.data) return null
  return <EditorDeDocumento inicial={detalhe.data} aoFechar={aoFechar} aoSalvar={aoSalvar} />
}

/** Aba Documentos do hub: o que a equipe compartilha com os clientes, o estado do antivírus e quem baixou. */
export function DocumentosDoPortal() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca.trim())
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(25)
  const [novo, setNovo] = useState(false)
  const lista = useQuery({
    queryKey: ['portal', 'documentos', 'lista', buscaAdiada, pagina, porPagina],
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.documentos.listar({
        pagina,
        porPagina,
        ...(buscaAdiada ? { busca: buscaAdiada } : {}),
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const recarregar = () =>
    void queryClient.invalidateQueries({ queryKey: ['portal', 'documentos'] })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Buscar"
          icon={Search}
          className="min-w-64 flex-1"
          placeholder="Título ou nome do arquivo"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
        />
        {pode('portal.documentos') ? (
          <Button variant="primary" icon={Plus} onClick={() => setNovo(true)}>
            Novo documento
          </Button>
        ) : null}
      </div>
      {lista.isError ? (
        <Alert tone="danger">Não consegui carregar os documentos. {lista.error.message}</Alert>
      ) : null}
      <div className="rounded-md border border-border bg-surface">
        {!lista.data ? (
          <div className="p-4">
            <Skeleton lines={4} />
          </div>
        ) : lista.data.itens.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum documento"
            description="Publique um arquivo e ele aparece na área Documentos do portal dos clientes."
          />
        ) : (
          <ul aria-label="Documentos" className="m-0 list-none p-0">
            {lista.data.itens.map((d) => (
              <Linha key={d.id} d={d} aoMudar={recarregar} />
            ))}
          </ul>
        )}
      </div>
      {lista.data && lista.data.total > 0 ? (
        <Paginacao
          pagina={pagina}
          porPagina={porPagina}
          total={lista.data.total}
          aoMudarPagina={setPagina}
          aoMudarPorPagina={(n) => {
            setPorPagina(n)
            setPagina(1)
          }}
        />
      ) : null}
      {novo ? (
        <EditorDeDocumento
          inicial={null}
          aoFechar={() => setNovo(false)}
          aoSalvar={() => {
            setNovo(false)
            recarregar()
          }}
        />
      ) : null}
    </div>
  )
}
