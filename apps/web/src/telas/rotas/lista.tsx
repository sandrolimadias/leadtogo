import type { ItemDeRota } from '@leadtogo/api-client'
import {
  codigoDaRota,
  duracaoTotalS,
  formatarDistancia,
  formatarDuracao,
  ROTULO_DA_SITUACAO_DE_ROTA,
  SITUACOES_DE_ROTA,
  type SituacaoDeRota,
} from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Map as MapaIcone, Plus, Route as RotaIcone } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Select, TextField } from '@/components/ui/campos'
import { Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { PaginaDeTabela } from '@/components/ui/pagina'
import { Paginacao } from '@/components/ui/paginacao'
import { cn } from '@/lib/cn'

import { TOM_DA_SITUACAO } from './situacao'

const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const classeDoBotao =
  'inline-flex h-(--ctl) items-center gap-2 rounded-sm px-3 text-sm font-semibold no-underline'

/** Planejado × realizado de uma rota: visitadas, puladas e pendentes. */
function Andamento({ r }: { r: ItemDeRota }) {
  if (r.paradas === 0) return <span className="text-ink-muted">Sem paradas</span>
  return (
    <span className="text-[13px] tabular-nums">
      <strong>{r.visitadas}</strong> de {r.paradas} visitadas
      {r.puladas ? ` · ${r.puladas} puladas` : ''}
      {r.pendentes && r.situacao !== 'planejada' ? ` · ${r.pendentes} pendentes` : ''}
    </span>
  )
}

/**
 * A tela Rotas (G4; menu Carteira): a lista com código, nome, data, responsável, paradas, distância e situação;
 * filtros por data, responsável (para quem vê as da equipe) e situação; "Nova rota" abre o editor no mapa.
 */
export function TelaDeRotas() {
  const servicos = useServicos()
  const { pode, alcanceDe } = usePermissoes()
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(25)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [situacao, setSituacao] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const veOutros = alcanceDe('rotas.ver') !== 'propria'

  const consulta = {
    pagina,
    porPagina,
    ...(de ? { de } : {}),
    ...(ate ? { ate } : {}),
    ...(situacao ? { situacao: situacao as SituacaoDeRota } : {}),
    ...(responsavelId ? { responsavelId } : {}),
  }
  const lista = useQuery({
    queryKey: ['rotas', 'lista', consulta],
    queryFn: async () => {
      const r = await servicos.rotas.listar(consulta)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const vendedores = useQuery({
    queryKey: ['mapa', 'opcoes'],
    enabled: veOutros,
    retry: false,
    queryFn: async () => {
      const r = await servicos.mapa.opcoes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const config = useQuery({
    queryKey: ['rotas', 'configuracao'],
    queryFn: async () => {
      const r = await servicos.rotas.configuracao()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  return (
    <PaginaDeTabela>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-[26px] leading-8 font-semibold max-md:text-[22px]">Rotas</h1>
        {pode('rotas.editar') ? (
          <Link
            to="/mapa"
            search={{ rota: 'nova' }}
            className={cn(classeDoBotao, 'bg-brand text-on-brand hover:bg-brand-hover')}
          >
            <Plus size={16} aria-hidden="true" /> Nova rota
          </Link>
        ) : null}
      </div>
      {config.data && !config.data.otimizacaoConfigurada ? (
        <Alert tone="info">
          Otimização de rotas ainda não configurada. As rotas se montam e se ordenam à mão, e as
          distâncias saem em linha reta.
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="De"
          type="date"
          value={de}
          onChange={(e) => (setDe(e.target.value), setPagina(1))}
        />
        <TextField
          label="Até"
          type="date"
          value={ate}
          onChange={(e) => (setAte(e.target.value), setPagina(1))}
        />
        <Select
          label="Situação"
          value={situacao}
          placeholder="Todas"
          options={SITUACOES_DE_ROTA.map((s) => ({
            value: s,
            label: ROTULO_DA_SITUACAO_DE_ROTA[s],
          }))}
          onChange={(e) => (setSituacao(e.target.value), setPagina(1))}
        />
        {veOutros && vendedores.data ? (
          <Select
            label="Vendedor"
            value={responsavelId}
            placeholder="Todos"
            options={vendedores.data.vendedores.map((v) => ({ value: v.id, label: v.nome }))}
            onChange={(e) => (setResponsavelId(e.target.value), setPagina(1))}
          />
        ) : null}
      </div>
      {lista.isPending ? (
        <Skeleton lines={5} />
      ) : lista.isError ? (
        <Alert tone="danger">Não consegui carregar as rotas. {lista.error.message}</Alert>
      ) : lista.data.itens.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={RotaIcone}
            title="Nenhuma rota"
            description="Monte uma rota no mapa: escolha as empresas, otimize a ordem e salve."
          />
        </div>
      ) : (
        <>
          <ul
            aria-label="Rotas"
            className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0"
          >
            {lista.data.itens.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
              >
                <Link
                  to="/rotas/$rotaId"
                  params={{ rotaId: r.id }}
                  className="flex min-w-0 flex-1 flex-col text-ink no-underline hover:underline"
                >
                  <span className="text-xs font-semibold text-ink-subtle">
                    {codigoDaRota(r.codigo)}
                  </span>
                  <span className="truncate font-semibold">{r.nome}</span>
                  <span className="text-xs text-ink-muted">
                    {dataCurta(r.data)} · {r.responsavel.nome}
                  </span>
                </Link>
                <span className="flex min-w-[180px] flex-col text-[13px]">
                  <Andamento r={r} />
                  <span className="text-ink-muted tabular-nums">
                    {formatarDistancia(r.distanciaM)} ·{' '}
                    {formatarDuracao(duracaoTotalS(r.duracaoS, r.paradas, r.minutosPorVisita))}
                    {r.estimativa === 'linha_reta' ? ' (linha reta)' : ''}
                  </span>
                </span>
                <Badge tone={TOM_DA_SITUACAO[r.situacao]}>
                  {ROTULO_DA_SITUACAO_DE_ROTA[r.situacao]}
                </Badge>
                <Link
                  to="/mapa"
                  search={{ rota: r.id }}
                  className={cn(
                    classeDoBotao,
                    'border border-border-strong text-ink hover:bg-surface-hover',
                  )}
                >
                  <MapaIcone size={16} aria-hidden="true" /> No mapa
                </Link>
              </li>
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
    </PaginaDeTabela>
  )
}
