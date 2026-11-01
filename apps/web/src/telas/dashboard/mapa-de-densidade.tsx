import type { ContornosDaUf } from '@leadtogo/api-client'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { cn } from '@leadtogo/ui/cn'
import {
  classeDe,
  corDaClasse,
  desenharMapa,
  faixasDeDensidade,
  type Poligonos,
  type TomDaDensidade,
} from '@/lib/densidade'

/** Quantas cidades a legenda mostra antes de "Ver todas" */
const NA_LEGENDA = 10

type LinkDaCidade = { to: string; search: Record<string, unknown> }

/** Aparelho só de toque (sem mouse): o primeiro toque num município mostra o número, o segundo abre a lista */
const soToque = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches

const percentual = (parte: number, total: number) =>
  total === 0 ? '0%' : `${(Math.round((parte / total) * 1000) / 10).toLocaleString('pt-BR')}%`

/**
 * Mapa de densidade (coroplético) de um estado: cada município na cor da sua classe (5 classes por quantis,
 * cores dos tokens) e, ao lado, a legenda com as faixas e a lista de cidades (nome, quantidade e a cor do
 * mapa). Passar o mouse, tocar ou focar uma cidade destaca o município nos dois. A legenda é a forma
 * acessível do mapa: cada cidade é um link para a lista de Empresas filtrada.
 */
export function MapaDeDensidade({
  titulo,
  uf,
  contornos,
  valores,
  tom,
  singular,
  plural,
  total,
  linkDaCidade,
  rodape,
}: {
  titulo: string
  uf: string
  contornos: ContornosDaUf['municipios']
  /** O valor de cada município (código IBGE); os ausentes valem zero */
  valores: Map<number, number>
  tom: TomDaDensidade
  singular: string
  plural: string
  /** O total (inclusive de outras UFs e sem cidade), para o percentual */
  total: number
  linkDaCidade: (codigo: number) => LinkDaCidade
  rodape?: string[]
}) {
  const navegar = useNavigate()
  const [destaque, setDestaque] = useState<number | null>(null)
  const [todas, setTodas] = useState(false)
  const desenho = useMemo(
    () =>
      desenharMapa(
        contornos.map((m) => ({ codigo: m.codigo, poligonos: m.poligonos as Poligonos })),
      ),
    [contornos],
  )
  const faixas = useMemo(() => faixasDeDensidade([...valores.values()]), [valores])
  const nomes = useMemo(() => new Map(contornos.map((m) => [m.codigo, m.nome])), [contornos])
  const cidades = useMemo(
    () =>
      [...valores.entries()]
        .filter(([, v]) => v > 0)
        .map(([codigo, v]) => ({ codigo, valor: v, nome: nomes.get(codigo) ?? String(codigo) }))
        .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR')),
    [valores, nomes],
  )
  const cor = (codigo: number) =>
    corDaClasse(classeDe(valores.get(codigo) ?? 0, faixas), faixas.length, tom)
  const qtd = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : plural}`
  const maior = cidades[0]
  const resumo =
    cidades.length === 0
      ? `${titulo}: nenhum município com ${plural} no ${uf}.`
      : `${titulo}: ${cidades.length} de ${contornos.length} municípios do ${uf}; mais em ${maior?.nome}, ${qtd(maior?.valor ?? 0)}.`
  const emDestaque =
    destaque === null ? null : { nome: nomes.get(destaque), valor: valores.get(destaque) ?? 0 }
  const visiveis = todas ? cidades : cidades.slice(0, NA_LEGENDA)

  return (
    <section aria-label={titulo} className="flex min-w-0 flex-col gap-3">
      <h3 className="m-0 text-sm leading-5 font-semibold">{titulo}</h3>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-4 max-md:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1">
          <p aria-live="polite" className="m-0 min-h-5 text-[13px] text-ink-muted tabular-nums">
            {emDestaque
              ? `${emDestaque.nome}: ${qtd(emDestaque.valor)} (${percentual(emDestaque.valor, total)} do total)`
              : 'Passe o mouse ou toque num município.'}
          </p>
          {desenho.altura === 0 ? (
            <p className="m-0 rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-ink-muted">
              Os contornos dos municípios do {uf} ainda não foram carregados.
            </p>
          ) : (
            <svg
              role="img"
              aria-label={resumo}
              viewBox={`0 0 ${desenho.largura} ${desenho.altura}`}
              className="h-auto w-full"
              onMouseLeave={() => setDestaque(null)}
            >
              {contornos.map((m) => (
                <path
                  key={m.codigo}
                  data-municipio={m.codigo}
                  d={desenho.caminhos.get(m.codigo)}
                  fill={cor(m.codigo)}
                  stroke={destaque === m.codigo ? 'var(--accent)' : 'var(--border-strong)'}
                  strokeWidth={destaque === m.codigo ? 3 : 0.8}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer"
                  onMouseEnter={() => setDestaque(m.codigo)}
                  onClick={() => {
                    if (destaque === m.codigo || !soToque()) {
                      void navegar(linkDaCidade(m.codigo) as never)
                    } else setDestaque(m.codigo) // no toque, o primeiro toque só mostra o número
                  }}
                />
              ))}
              {destaque !== null ? (
                // o contorno em destaque por cima dos vizinhos
                <path
                  d={desenho.caminhos.get(destaque)}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ) : null}
            </svg>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {faixas.length > 0 ? (
            <ul aria-label="Faixas" className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
              {faixas.map((f) => (
                <li key={f.classe} className="flex items-center gap-1.5 text-[13px] tabular-nums">
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-[3px] border border-border"
                    style={{ background: corDaClasse(f.classe, faixas.length, tom) }}
                  />
                  {f.de === f.ate ? f.de : `${f.de}–${f.ate}`}
                </li>
              ))}
            </ul>
          ) : null}
          {cidades.length === 0 ? (
            <p className="m-0 text-[13px] text-ink-muted">Nenhuma cidade com {plural}.</p>
          ) : (
            <ul
              aria-label={`Cidades: ${titulo}`}
              className={cn('m-0 flex list-none flex-col p-0', todas && 'max-h-80 overflow-y-auto')}
            >
              {visiveis.map((c) => (
                <li key={c.codigo} className="border-b border-border last:border-b-0">
                  <Link
                    {...(linkDaCidade(c.codigo) as { to: '/empresas' })}
                    onMouseEnter={() => setDestaque(c.codigo)}
                    onMouseLeave={() => setDestaque(null)}
                    onFocus={() => setDestaque(c.codigo)}
                    onBlur={() => setDestaque(null)}
                    className={cn(
                      'flex items-center gap-2 px-1 py-1.5 text-sm text-ink no-underline hover:bg-surface-hover',
                      destaque === c.codigo && 'bg-surface-hover',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="size-3 flex-none rounded-[3px] border border-border"
                      style={{ background: cor(c.codigo) }}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                    <span className="font-semibold tabular-nums">
                      {c.valor.toLocaleString('pt-BR')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {cidades.length > NA_LEGENDA ? (
            <button
              type="button"
              onClick={() => setTodas((v) => !v)}
              className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-brand"
            >
              {todas ? 'Ver menos' : `Ver todas (${cidades.length})`}
            </button>
          ) : null}
          {rodape && rodape.length > 0 ? (
            <p className="m-0 text-xs text-ink-muted">{rodape.join(' · ')}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
