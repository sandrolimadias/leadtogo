import type { OpcoesDoMapa } from '@leadtogo/shared'
import { tokenDaCorDoMapa } from '@leadtogo/shared'
import { Search, SlidersHorizontal, TriangleAlert } from 'lucide-react'

import { Select, TextField } from '@/components/ui/campos'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/cn'

import { type FiltrosDaTela } from './estado'

/** Os chips de Status (gerados das tags, com a cor da legenda e o total) e o atalho dos clientes sem visita. */
export function ChipsDoMapa({
  opcoes,
  filtros,
  aoMudar,
  className,
}: {
  opcoes: OpcoesDoMapa
  filtros: FiltrosDaTela
  aoMudar: (f: FiltrosDaTela) => void
  className?: string
}) {
  const alternar = (tagId: string) =>
    aoMudar({
      ...filtros,
      statusTagIds: filtros.statusTagIds.includes(tagId)
        ? filtros.statusTagIds.filter((i) => i !== tagId)
        : [...filtros.statusTagIds, tagId],
    })
  return (
    <div
      role="group"
      aria-label="Status das empresas"
      className={cn('flex flex-wrap gap-2', className)}
    >
      {opcoes.chips.map((c) => {
        const ligado = filtros.statusTagIds.includes(c.tagId)
        return (
          <button
            key={c.tagId}
            type="button"
            aria-pressed={ligado}
            onClick={() => alternar(c.tagId)}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap shadow-sm',
              ligado
                ? 'border-border-strong bg-surface text-ink'
                : 'border-border bg-surface/80 text-ink-muted',
            )}
          >
            <span
              aria-hidden="true"
              className="size-2.5 flex-none rounded-full"
              style={{
                background: ligado ? `var(${tokenDaCorDoMapa(c.cor)})` : 'transparent',
                boxShadow: `inset 0 0 0 2px var(${tokenDaCorDoMapa(c.cor)})`,
              }}
            />
            {c.nome}
            <span className="font-normal tabular-nums text-ink-muted">{c.total}</span>
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={filtros.semVisita60}
        onClick={() => aoMudar({ ...filtros, semVisita60: !filtros.semVisita60 })}
        className={cn(
          'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap shadow-sm',
          filtros.semVisita60
            ? 'border-danger bg-danger-soft text-danger'
            : 'border-border bg-surface/80 text-ink-muted',
        )}
      >
        <TriangleAlert size={14} aria-hidden="true" />
        Clientes sem visita 60+ dias
      </button>
    </div>
  )
}

/** A busca da barra do mapa (empresa, bairro ou cidade). */
export function BuscaDoMapa({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <label className="relative flex h-9 w-full min-w-[220px] items-center">
      <span className="sr-only">Buscar empresa, bairro ou cidade</span>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 text-ink-subtle"
      />
      <input
        type="search"
        value={valor}
        placeholder="Buscar empresa, bairro ou cidade"
        onChange={(e) => aoMudar(e.target.value)}
        className="h-9 w-full rounded-full border border-border-strong bg-surface pr-3 pl-9 text-[13px] text-ink shadow-sm placeholder:text-ink-subtle"
      />
    </label>
  )
}

const VISITADA = [
  { value: 'alguma_vez', label: 'Visitadas alguma vez' },
  { value: '90_dias', label: 'Visitadas em 90 dias' },
  { value: 'periodo', label: 'Visitadas no período' },
  { value: 'nunca', label: 'Nunca visitadas' },
]

/** Os demais filtros (visitada, vendedor, cidade, região, precisão e o lote dos leads). */
export function CamposDeFiltro({
  opcoes,
  filtros,
  aoMudar,
}: {
  opcoes: OpcoesDoMapa
  filtros: FiltrosDaTela
  aoMudar: (f: FiltrosDaTela) => void
}) {
  const alterar = <K extends keyof FiltrosDaTela>(k: K, v: FiltrosDaTela[K]) =>
    aoMudar({ ...filtros, [k]: v })
  const leadLigado = opcoes.chips.some((c) => c.porLote && filtros.statusTagIds.includes(c.tagId))
  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Visitada"
        value={filtros.visitada}
        placeholder="Todas"
        options={VISITADA}
        onChange={(e) => alterar('visitada', e.target.value as FiltrosDaTela['visitada'])}
      />
      {filtros.visitada === 'periodo' ? (
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="De"
            type="date"
            value={filtros.visitaDe}
            onChange={(e) => alterar('visitaDe', e.target.value)}
          />
          <TextField
            label="Até"
            type="date"
            value={filtros.visitaAte}
            onChange={(e) => alterar('visitaAte', e.target.value)}
          />
        </div>
      ) : null}
      {opcoes.vendedores.length > 0 ? (
        <Select
          label="Vendedor"
          value={filtros.vendedorId}
          placeholder="Todos os vendedores"
          options={opcoes.vendedores.map((v) => ({ value: v.id, label: v.nome }))}
          onChange={(e) => alterar('vendedorId', e.target.value)}
        />
      ) : null}
      <Select
        label="Cidade"
        value={filtros.municipioCodigo}
        placeholder="Todas as cidades"
        options={opcoes.cidades.map((c) => ({ value: String(c.codigoIbge), label: c.nome }))}
        onChange={(e) => alterar('municipioCodigo', e.target.value)}
      />
      <Select
        label="Região"
        value={filtros.regiaoId}
        placeholder="Todas as regiões"
        options={opcoes.regioes.map((r) => ({ value: r.id, label: r.nome }))}
        onChange={(e) => alterar('regiaoId', e.target.value)}
      />
      <Select
        label="Precisão da posição"
        value={filtros.precisao}
        placeholder="Qualquer"
        options={[
          { value: 'exata', label: 'Exata' },
          { value: 'aproximada', label: 'Aproximada' },
        ]}
        onChange={(e) => alterar('precisao', e.target.value as FiltrosDaTela['precisao'])}
      />
      {leadLigado ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
          <legend className="px-1 text-[13px] font-semibold">Leads por lote de importação</legend>
          {opcoes.lotesDeLeads.length === 0 ? (
            <p className="m-0 text-[13px] text-ink-muted">Nenhum lote de leads com coordenada.</p>
          ) : (
            opcoes.lotesDeLeads.map((l) => (
              <Checkbox
                key={l.id}
                label={`${l.nome} (${l.comCoordenada})`}
                checked={filtros.lotes.includes(l.id)}
                onChange={() =>
                  alterar(
                    'lotes',
                    filtros.lotes.includes(l.id)
                      ? filtros.lotes.filter((i) => i !== l.id)
                      : [...filtros.lotes, l.id],
                  )
                }
              />
            ))
          )}
          <p className="m-0 text-xs text-ink-muted">
            Os leads só aparecem por lote, até {opcoes.limiteDeLeads} por vez.
          </p>
        </fieldset>
      ) : null}
    </div>
  )
}

/** O botão "Filtros" (com o número de filtros ligados). */
export function BotaoDeFiltros({ ativos, aoClicar }: { ativos: number; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border-strong bg-surface px-3 text-[13px] font-semibold text-ink shadow-sm"
    >
      <SlidersHorizontal size={15} aria-hidden="true" />
      Filtros
      {ativos > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs text-on-brand">
          {ativos}
        </span>
      ) : null}
    </button>
  )
}
