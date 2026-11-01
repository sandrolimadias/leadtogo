import type { ReactNode } from 'react'

import { cn } from '@leadtogo/ui/cn'

/** Um indicador do topo: título, valor grande, dica e (opcional) um mini-gráfico. */
export function Indicador({
  titulo,
  valor,
  dica,
  extra,
  className,
}: {
  titulo: string
  valor: ReactNode
  dica?: ReactNode
  extra?: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <h2 className="m-0 text-[13px] leading-[18px] font-medium text-ink-muted">{titulo}</h2>
      <p className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.01em] tabular-nums [overflow-wrap:anywhere] max-md:text-[20px] max-md:leading-7">
        {valor}
      </p>
      {dica ? <p className="m-0 text-[13px] text-ink-muted">{dica}</p> : null}
      {extra}
    </section>
  )
}

/** Um bloco do Dashboard: título, ação à direita e o conteúdo. */
export function Cartao({
  titulo,
  acao,
  className,
  children,
}: {
  titulo: string
  acao?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base leading-6 font-semibold">{titulo}</h2>
        {acao}
      </header>
      {children}
    </section>
  )
}
