import type { CSSProperties, ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

import { cn } from './cn'

/**
 * Peças comuns dos gráficos do app (docs/design_system.md, seção "Gráficos"), no padrão do shadcn/ui Charts
 * sobre Recharts: um contêiner que dá as cores de cada série como variáveis CSS e um tooltip no visual do
 * design system. As cores vêm só dos tokens (`--tag-<cor>-fg`, `--success`, `--danger`...): servem aos temas
 * claro e escuro sem nenhum valor fixo.
 */

export interface SerieDoGrafico {
  /** O nome que o tooltip e a legenda mostram */
  rotulo: string
  /** Uma cor do design system, como `var(--tag-teal-fg)` */
  cor: string
}
export type ConfigDoGrafico = Record<string, SerieDoGrafico>

/**
 * O quadro onde o gráfico é desenhado: largura toda, altura fixa. `config` vira `--cor-<série>` para o gráfico
 * usar `fill="var(--cor-total)"`. `rotulo` é o que o leitor de tela ouve (o resumo em palavras).
 */
export function ContainerDoGrafico({
  config,
  altura,
  rotulo,
  className,
  children,
}: {
  config: ConfigDoGrafico
  altura: number
  rotulo: string
  className?: string
  children: ReactNode
}) {
  const variaveis = Object.fromEntries(
    Object.entries(config).map(([chave, s]) => [`--cor-${chave}`, s.cor]),
  ) as CSSProperties
  return (
    <div
      role="group"
      aria-label={rotulo}
      style={{ ...variaveis, height: altura }}
      className={cn(
        'w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-ink-muted [&_.recharts-surface]:overflow-visible [&_.recharts-text]:fill-ink-muted [&_.recharts-tooltip-cursor]:fill-surface-hover',
        className,
      )}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 480, height: altura }}
      >
        {children as never}
      </ResponsiveContainer>
    </div>
  )
}

export interface LinhaDoTooltip {
  rotulo: string
  valor: string
  cor?: string
}

/**
 * O conteúdo do tooltip: título e linhas "rótulo: valor" (quantidade, R$, %...), no visual dos cartões do app.
 * Quem usa monta as linhas; o clique, quando existe, avisa "Clique para ver a lista".
 */
export function ConteudoDoTooltip({
  titulo,
  linhas,
  aviso,
}: {
  titulo: string
  linhas: LinhaDoTooltip[]
  aviso?: string
}) {
  return (
    <div
      role="status"
      className="pointer-events-none min-w-40 rounded-md border border-border bg-surface px-3 py-2 text-xs text-ink shadow-md"
    >
      <p className="m-0 mb-1 text-[13px] font-semibold">{titulo}</p>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {linhas.map((l) => (
          <li key={l.rotulo} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-muted">
              {l.cor ? (
                <span
                  aria-hidden="true"
                  className="size-2 flex-none rounded-full"
                  style={{ background: l.cor }}
                />
              ) : null}
              {l.rotulo}
            </span>
            <span className="font-semibold tabular-nums">{l.valor}</span>
          </li>
        ))}
      </ul>
      {aviso ? <p className="m-0 mt-1 text-[11px] text-ink-subtle">{aviso}</p> : null}
    </div>
  )
}

/** O que o gráfico diz quando não há nada a desenhar. */
export function GraficoVazio({ texto, altura = 96 }: { texto: string; altura?: number }) {
  return (
    <div
      role="status"
      style={{ minHeight: altura }}
      className="flex items-center justify-center rounded-md border border-dashed border-border-strong px-4 text-center text-[13px] text-ink-muted"
    >
      {texto}
    </div>
  )
}
