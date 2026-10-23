import type { ItemDeChamado } from '@leadtogo/api-client'
import {
  type AbaDeChamados,
  PRIORIDADES_DO_CHAMADO,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_STATUS_DO_CHAMADO,
  STATUS_DO_CHAMADO,
  type PrioridadeDoChamado,
  type StatusDoChamado,
} from '@leadtogo/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChartColumn, LifeBuoy, Plus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@/components/ui/button'
import { Select, TextField } from '@/components/ui/campos'
import { Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { PaginaDeTabela } from '@/components/ui/pagina'
import { Paginacao } from '@/components/ui/paginacao'
import { Tabs } from '@/components/ui/tabs'

import { AbrirChamado } from './abrir'
import { useAreasDeAtendimento } from './areas'
import { dataCurta, selosDoPrazo, TOM_DA_PRIORIDADE, TOM_DO_STATUS } from './rotulos'

const ROTULO_DAS_ABAS: Record<AbaDeChamados, string> = {
  triagem: 'Triagem',
  pendentes: 'Pendentes',
  meus: 'Meus',
  todos: 'Todos',
}

function Linha({ c }: { c: ItemDeChamado }) {
  const prazos = [
    selosDoPrazo(c.prazoResposta, 'Resposta'),
    selosDoPrazo(c.prazoResolucao, 'Resolução'),
  ]
    .filter((p) => p !== null)
    // só o que pede atenção na lista: o que já foi cumprido no prazo fica para o detalhe
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
          {c.area?.nome ?? 'Sem área'} · {c.solicitante.nome}
          {c.empresaCliente ? ` · ${c.empresaCliente.nome}` : ''}
        </span>
      </Link>
      <span className="flex min-w-[140px] flex-col text-[13px]">
        <span className="text-ink-muted">Responsável</span>
        <span>{c.responsavel?.nome ?? 'Ninguém ainda'}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={TOM_DO_STATUS[c.status]}>{ROTULO_DO_STATUS_DO_CHAMADO[c.status]}</Badge>
        {c.prioridade !== 'normal' ? (
          <Badge tone={TOM_DA_PRIORIDADE[c.prioridade]}>{ROTULO_DA_PRIORIDADE[c.prioridade]}</Badge>
        ) : null}
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
 * A central de chamados (Fase 2): abas Triagem (só aparece para quem tria e quando há fila), Pendentes, Meus e
 * Todos, com as contagens; busca por número ou assunto; filtros de área, prioridade e estado.
 */
export function TelaDeChamados() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const [aba, setAba] = useState<AbaDeChamados>('pendentes')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(25)
  const [busca, setBusca] = useState('')
  const [areaId, setAreaId] = useState('')
  const [prioridade, setPrioridade] = useState('')
  const [status, setStatus] = useState('')
  const [abrindo, setAbrindo] = useState(false)
  const buscaAdiada = useDeferredValue(busca.trim())
  const areas = useAreasDeAtendimento()

  const consulta = {
    aba,
    pagina,
    porPagina,
    ...(buscaAdiada ? { busca: buscaAdiada } : {}),
    ...(areaId ? { areaId } : {}),
    ...(prioridade ? { prioridade: prioridade as PrioridadeDoChamado } : {}),
    ...(status && aba === 'todos' ? { status: status as StatusDoChamado } : {}),
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
  const abas = lista.data?.abas
  const itensDasAbas = [
    ...(abas && abas.triagem > 0
      ? [{ value: 'triagem', label: ROTULO_DAS_ABAS.triagem, count: abas.triagem }]
      : []),
    {
      value: 'pendentes',
      label: ROTULO_DAS_ABAS.pendentes,
      ...(abas ? { count: abas.pendentes } : {}),
    },
    { value: 'meus', label: ROTULO_DAS_ABAS.meus, ...(abas ? { count: abas.meus } : {}) },
    { value: 'todos', label: ROTULO_DAS_ABAS.todos, ...(abas ? { count: abas.todos } : {}) },
  ]
  // a aba da Triagem some quando a fila esvazia: volta para as pendentes
  if (aba === 'triagem' && abas && abas.triagem === 0) setAba('pendentes')

  return (
    <PaginaDeTabela>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-[26px] leading-8 font-semibold max-md:text-[22px]">
          Chamados
        </h1>
        {pode('chamados.ver_metricas') ? (
          <Link
            to="/chamados/metricas"
            className="inline-flex h-(--ctl) items-center gap-2 rounded-sm border border-border-strong px-3 text-sm font-semibold text-ink no-underline hover:bg-surface-hover"
          >
            <ChartColumn size={16} aria-hidden="true" /> Métricas
          </Link>
        ) : null}
        {pode('chamados.criar') ? (
          <Button variant="primary" icon={Plus} onClick={() => setAbrindo(true)}>
            Abrir chamado
          </Button>
        ) : null}
      </div>
      <Tabs
        label="Filas de chamados"
        items={itensDasAbas}
        value={aba}
        onChange={(v) => (setAba(v as AbaDeChamados), setPagina(1))}
      />
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Buscar"
          icon={Search}
          placeholder="Número (CH-0042) ou assunto"
          value={busca}
          onChange={(e) => (setBusca(e.target.value), setPagina(1))}
          className="min-w-[240px] flex-1"
        />
        <Select
          label="Área"
          value={areaId}
          placeholder="Todas"
          options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.nome }))}
          onChange={(e) => (setAreaId(e.target.value), setPagina(1))}
        />
        <Select
          label="Prioridade"
          value={prioridade}
          placeholder="Todas"
          options={PRIORIDADES_DO_CHAMADO.map((p) => ({
            value: p,
            label: ROTULO_DA_PRIORIDADE[p],
          }))}
          onChange={(e) => (setPrioridade(e.target.value), setPagina(1))}
        />
        {aba === 'todos' ? (
          <Select
            label="Estado"
            value={status}
            placeholder="Todos"
            options={STATUS_DO_CHAMADO.map((s) => ({
              value: s,
              label: ROTULO_DO_STATUS_DO_CHAMADO[s],
            }))}
            onChange={(e) => (setStatus(e.target.value), setPagina(1))}
          />
        ) : null}
      </div>
      {lista.isPending ? (
        <Skeleton lines={5} />
      ) : lista.isError ? (
        <Alert tone="danger">Não consegui carregar os chamados. {lista.error.message}</Alert>
      ) : lista.data.itens.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={LifeBuoy}
            title={aba === 'todos' && !buscaAdiada ? 'Nenhum chamado ainda' : 'Nenhum chamado aqui'}
            description={
              pode('chamados.criar')
                ? 'Abra um chamado para pedir ajuda de outra área.'
                : 'Quando houver chamados nesta fila, eles aparecem aqui.'
            }
          />
        </div>
      ) : (
        <>
          <ul
            aria-label="Chamados"
            className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0"
          >
            {lista.data.itens.map((c) => (
              <Linha key={c.id} c={c} />
            ))}
          </ul>
          <Paginacao
            pagina={pagina}
            porPagina={porPagina}
            total={lista.data.total}
            aoMudarPagina={setPagina}
            aoMudarPorPagina={(n) => (setPorPagina(n), setPagina(1))}
          />
        </>
      )}
      <AbrirChamado aberto={abrindo} aoFechar={() => setAbrindo(false)} />
    </PaginaDeTabela>
  )
}
