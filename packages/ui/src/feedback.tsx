import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from './cn'

import { IconButton } from './button'

export type TomDoAlerta = 'info' | 'success' | 'warning' | 'danger'

const tonsDoAlerta: Record<TomDoAlerta, { classe: string; icone: LucideIcon }> = {
  info: { classe: 'bg-info-soft text-info', icone: Info },
  success: { classe: 'bg-success-soft text-success', icone: CircleCheck },
  warning: { classe: 'bg-warning-soft text-warning', icone: TriangleAlert },
  danger: { classe: 'bg-danger-soft text-danger', icone: CircleAlert },
}

/** Aviso dentro da página (erro de login, sucesso da Receita). `danger` e `warning` anunciam como alerta. */
export function Alert({
  tone = 'info',
  title,
  actions,
  className,
  children,
}: {
  tone?: TomDoAlerta
  title?: string
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const { classe, icone: Icone } = tonsDoAlerta[tone]
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'grid grid-cols-[20px_1fr_auto] items-start gap-x-3 gap-y-1 rounded-md border border-transparent px-4 py-3',
        classe,
        className,
      )}
    >
      <Icone size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5" />
      {title ? <span className="font-semibold">{title}</span> : null}
      {children ? (
        <span className={cn('text-[13px] leading-[18px] text-ink', title && 'col-start-2')}>
          {children}
        </span>
      ) : null}
      {actions ? (
        <div className="col-start-3 row-span-2 row-start-1 flex gap-2 self-center">{actions}</div>
      ) : null}
    </div>
  )
}

export type TomDoToast = 'success' | 'danger' | 'info' | 'warning'

const iconesDoToast: Record<TomDoToast, { icone: LucideIcon; classe: string }> = {
  success: { icone: CircleCheck, classe: 'text-success' },
  danger: { icone: CircleAlert, classe: 'text-danger' },
  info: { icone: Info, classe: 'text-info' },
  warning: { icone: TriangleAlert, classe: 'text-warning' },
}

/** Aviso temporário (a forma visual). Para disparar um, use `toast.success(...)` de `toast.tsx`. */
export function Toast({
  tone = 'success',
  title,
  description,
  action,
  onClose,
  className,
}: {
  tone?: TomDoToast
  title: string
  description?: string
  action?: ReactNode
  onClose?: () => void
  className?: string
}) {
  const { icone: Icone, classe } = iconesDoToast[tone]
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'box-border grid w-[360px] max-w-full grid-cols-[20px_1fr_auto] items-start gap-x-3 gap-y-1 rounded-md border border-border bg-surface py-3 pr-3 pl-4 shadow-lg',
        className,
      )}
    >
      <Icone size={18} strokeWidth={1.75} aria-hidden="true" className={cn('mt-0.5', classe)} />
      <span className="font-semibold text-ink">{title}</span>
      <IconButton icon={X} label="Fechar" size="sm" onClick={onClose} />
      {description ? (
        <span className="col-start-2 text-[13px] leading-[18px] text-ink-muted">{description}</span>
      ) : null}
      {action ? <div className="col-start-2 mt-1 flex gap-1">{action}</div> : null}
    </div>
  )
}

/** Estado vazio: ícone, título, uma frase que diz o que fazer e, se couber, a ação. */
export function EmptyState({
  icon: Icone,
  title,
  description,
  actions,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      {Icone ? (
        <span className="mb-2 inline-flex size-12 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
          <Icone size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
      ) : null}
      <h2 className="m-0 text-[15px] leading-5 font-semibold text-ink">{title}</h2>
      {description ? (
        <p className="m-0 max-w-[44ch] text-sm leading-5 text-ink-muted">{description}</p>
      ) : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Carregando: o formato do conteúdo que vem, em vez de um spinner solto. */
export function Skeleton({
  width,
  height = 12,
  circle,
  lines,
  className,
}: {
  width?: number | string
  height?: number | string
  circle?: boolean
  lines?: number
  className?: string
}) {
  const um = (chave: number, larguraDaLinha?: number | string) => (
    <span
      key={chave}
      aria-hidden="true"
      style={{ width: larguraDaLinha ?? width ?? '100%', height }}
      className={cn(
        'block animate-[lt-pulse_1.4s_ease-in-out_infinite] bg-surface-sunken',
        circle ? 'rounded-full' : 'rounded-xs',
        className,
      )}
    />
  )
  if (lines) {
    return (
      <span role="status" aria-label="Carregando" className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, i) => um(i, i === lines - 1 ? '60%' : undefined))}
      </span>
    )
  }
  return (
    <span role="status" aria-label="Carregando" className="contents">
      {um(0)}
    </span>
  )
}
