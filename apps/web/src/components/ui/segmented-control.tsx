import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/cn'

export interface OpcaoSegmentada {
  value: string
  label: string
  icon?: LucideIcon
}

interface Props {
  options: OpcaoSegmentada[]
  value?: string
  defaultValue?: string
  onChange?: (valor: string) => void
  /** Nome do grupo para leitor de tela */
  label: string
  className?: string
}

/** Alterna entre 2–4 visões da mesma informação (Kanban ↔ Lista, período). */
export function SegmentedControl({
  options,
  value,
  defaultValue,
  onChange,
  label,
  className,
}: Props) {
  const [interno, setInterno] = useState(defaultValue ?? options[0]?.value ?? '')
  const atual = value ?? interno
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex gap-0.5 rounded-sm border border-border bg-surface-sunken p-0.5',
        className,
      )}
    >
      {options.map(({ value: v, label: rotulo, icon: Icone }) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === atual}
          onClick={() => {
            setInterno(v)
            onChange?.(v)
          }}
          className={cn(
            'inline-flex h-[calc(var(--ctl)-6px)] cursor-pointer items-center gap-1.5 rounded-xs border-0 px-3 text-[13px] font-semibold',
            v === atual ? 'bg-surface text-ink shadow-sm' : 'bg-transparent text-ink-muted',
          )}
        >
          {Icone ? <Icone size={15} strokeWidth={1.75} aria-hidden="true" /> : null}
          {rotulo}
        </button>
      ))}
    </div>
  )
}
