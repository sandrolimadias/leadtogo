import type { ItemDeChamado } from '@leadtogo/api-client'
import {
  ROTULO_DO_STATUS_DO_CHAMADO,
  STATUS_DO_CHAMADO,
  type StatusDoChamado,
} from '@leadtogo/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LifeBuoy, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Select, TextField } from '@leadtogo/ui/campos'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { Paginacao } from '@leadtogo/ui/paginacao'

import { dataCurta, selosDoPrazo, TOM_DO_STATUS } from '../chamados/rotulos'

import { IndicadoresDoPortal } from './indicadores'

function Linha({ c }: { c: ItemDeChamado }) {
  const prazos = [
    selosDoPrazo(c.prazoResposta, 'Resposta'),
    selosDoPrazo(c.prazoResolucao, 'Resolução'),
  ]
    .filter((p) => p !== null)
    .filter((p) => p.tom === 'danger' || p.tom === 'info')
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0">
      <Link
        to="/chamados/$chamadoId"
        params={{ chamadoId: c.id }}
        className="flex min-w-0 flex-1 basis-64 flex-col text-ink no-underline hover:underline"
      >
        <span className="text-xs font-semibold text-ink-subtle">{c.codigo}</span>
        <span className="truncate font-semibold">{c.assunto}</span>
        <span className="truncate text-xs text-ink-muted">
          {c.empresaCliente?.nome ?? 'Sem empresa'} · {c.solicitante.nome} pelo portal
          {c.area ? ` · ${c.area.nome}` : ''}
        </span>
      </Link>
      <span className="flex min-w-[140px] flex-col text-[13px]">
        <span className="text-ink-muted">Responsável</span>
        <span>{c.responsavel?.nome ?? 'Ninguém ainda'}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={TOM_DO_STATUS[c.status]}>{ROTULO_DO_STATUS_DO_CHAMADO[c.status]}</Badge>
        {prazos.map((p) => (
          <Badge key={p.texto} tone={p.tom}>
            {p.texto}
          </Badge>
        ))}
      </span>
      <span className="min-w-[96px] text-right text-xs text-ink-muted tabular-nums">
        {dataCurta(c.atualizadoEm)}
      </span>
    </li>
  )
}

/**
 * Aba Chamados do hub: os indicadores e a lista dos chamados abertos pelos clientes (a mesma central, filtrada
 * por origem "portal"). Cada linha abre o chamado, onde a equipe responde, aguarda o cliente ou cria tarefa.
 */
export function ChamadosDoPortal() {
  const servicos = useServicos()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(25)
  const buscaAdiada = useDeferredValue(busca.trim())
  const consulta = {
    aba: 'todos' as const,
    origem: 'portal' as const,
    pagina,
    porPagina,
    ...(buscaAdiada ? { busca: buscaAdiada } : {}),
    ...(status ? { status: status as StatusDoChamado } : {}),
  }
  const lista = useQuery({
    queryKey: ['chamados', 'lista', consulta],
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.listar(consulta)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  return (
    <div className="flex flex-col gap-4">
      <IndicadoresDoPortal />
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Buscar"
          icon={Search}
          className="min-w-64 flex-1"
          placeholder="Número ou assunto"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
        />
        <Select
          label="Estado"
          value={status}
          placeholder="Todos"
          options={STATUS_DO_CHAMADO.map((s) => ({
            value: s,
            label: ROTULO_DO_STATUS_DO_CHAMADO[s],
          }))}
          onChange={(e) => {
            setStatus(e.target.value)
            setPagina(1)
          }}
        />
      </div>
      {lista.isError ? (
        <Alert tone="danger">Não consegui carregar os chamados. {lista.error.message}</Alert>
      ) : null}
      <div className="rounded-md border border-border bg-surface">
        {!lista.data ? (
          <div className="p-4">
            <Skeleton lines={4} />
          </div>
        ) : lista.data.itens.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Nenhum chamado de cliente"
            description="Quando um cliente abrir um chamado pelo portal, ele aparece aqui."
          />
        ) : (
          <ul aria-label="Chamados dos clientes" className="m-0 list-none p-0">
            {lista.data.itens.map((c) => (
              <Linha key={c.id} c={c} />
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
    </div>
  )
}
