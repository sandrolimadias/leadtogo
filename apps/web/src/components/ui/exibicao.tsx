import { X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { classeDaCor, corDoNome, iniciais, type CorDeTag } from './cores'

export type TomDoBadge =
  'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline'

const tons: Record<TomDoBadge, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  accent: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  outline: 'border border-border-strong bg-transparent text-ink-muted',
}

/** Estado definido pelo sistema, em uma ou duas palavras. Cor de estado sempre com palavra. */
export function Badge({
  tone = 'neutral',
  icon: Icone,
  className,
  children,
}: {
  tone?: TomDoBadge
  icon?: LucideIcon
  className?: string
  children?: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-xs leading-4 font-semibold whitespace-nowrap',
        tons[tone],
        className,
      )}
    >
      {Icone ? <Icone size={13} strokeWidth={1.75} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/** Etiqueta criada pelo cliente, com a cor escolhida no cadastro de tags. */
export function Tag({
  color = 'gray',
  dot = true,
  variant,
  onRemove,
  className,
  children,
}: {
  color?: CorDeTag
  dot?: boolean
  variant?: 'outline'
  onRemove?: () => void
  className?: string
  children: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-xs leading-4 font-semibold whitespace-nowrap',
        classeDaCor[color],
        variant === 'outline' && 'bg-transparent shadow-[inset_0_0_0_1px_var(--border-strong)]',
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-current" />
      ) : null}
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${children}`}
          className="-mr-0.5 inline-flex cursor-pointer rounded-full border-0 bg-transparent p-0 text-inherit opacity-75 hover:opacity-100"
        >
          <X size={12} strokeWidth={2.5} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}

const tamanhosDeAvatar = {
  sm: 'size-[22px] text-[10px]',
  md: 'size-7 text-[11px]',
  lg: 'size-10 text-sm',
}

/** Iniciais (ou foto) de um membro ou contato. O nome vira o texto alternativo. */
export function Avatar({
  name,
  src,
  size = 'md',
  color,
  className,
}: {
  name: string
  src?: string
  size?: keyof typeof tamanhosDeAvatar
  color?: CorDeTag
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        'inline-flex flex-none items-center justify-center overflow-hidden rounded-full font-semibold tracking-[.02em]',
        tamanhosDeAvatar[size],
        !src && classeDaCor[color ?? corDoNome(name)],
        className,
      )}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : iniciais(name)}
    </span>
  )
}
