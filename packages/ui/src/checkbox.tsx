import { Check } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'

import { cn } from './cn'

type EntradaNativa = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'>

/** Opção independente (formulários e seleção de linhas). Para efeito imediato, use `Switch`. */
export function Checkbox({
  label,
  description,
  className,
  ...resto
}: EntradaNativa & { label?: ReactNode; description?: string }) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-start gap-2 text-sm leading-5 text-ink',
        className,
      )}
    >
      <input type="checkbox" {...resto} className="peer absolute size-px opacity-0" />
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-4 flex-none items-center justify-center rounded-xs border-[1.5px] border-border-strong bg-surface text-transparent peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring peer-disabled:opacity-45"
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span>
        {label}
        {description ? (
          <span className="block text-xs leading-4 text-ink-muted">{description}</span>
        ) : null}
      </span>
    </label>
  )
}

/** Liga e desliga uma configuração com efeito imediato. O rótulo descreve o estado ligado. */
export function Switch({ label, className, ...resto }: EntradaNativa & { label?: ReactNode }) {
  return (
    <label
      className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink', className)}
    >
      <input type="checkbox" role="switch" {...resto} className="peer absolute size-px opacity-0" />
      <span
        aria-hidden="true"
        className="relative box-border h-5 w-[34px] flex-none rounded-full border-[1.5px] border-border-strong bg-surface-sunken transition-colors peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring peer-disabled:opacity-45 after:absolute after:top-0.5 after:left-0.5 after:size-[13px] after:rounded-full after:bg-ink-muted after:transition-transform after:content-[''] peer-checked:after:translate-x-3.5 peer-checked:after:bg-on-brand"
      />
      {label}
    </label>
  )
}
