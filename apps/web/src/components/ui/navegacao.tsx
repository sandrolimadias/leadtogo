import { ArrowRight, ChevronDown, Settings, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { IconButton } from './button'
import { classeDaCor, iniciais, type CorDeTag } from './cores'
import { Avatar } from './exibicao'

export interface EmpresaAtiva {
  name: string
  /** Papel da pessoa nesta empresa ("Administrador", "Vendedor") */
  role: string
  color?: CorDeTag
}

/** Botão do topo da navegação: logotipo com as iniciais, nome e papel na empresa ativa. */
export function TenantSwitcher({
  current,
  className,
  ...resto
}: { current: EmpresaAtiva } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      {...resto}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-2 py-1.5 text-left text-ink hover:bg-surface-hover',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-7 flex-none items-center justify-center rounded-sm text-[11px] font-bold',
          classeDaCor[current.color ?? 'teal'],
        )}
      >
        {iniciais(current.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-[13px] leading-[18px]">{current.name}</b>
        <span className="text-xs leading-4 text-ink-muted">{current.role}</span>
      </span>
      <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
    </button>
  )
}

export interface ItemDaNavegacao {
  icon: LucideIcon
  label: string
  href?: string
  active?: boolean
  count?: number
  onClick?: () => void
}

export interface GrupoDaNavegacao {
  label?: string
  items: ItemDaNavegacao[]
}

/**
 * Navegação lateral do desktop (248 px). `tenantSlot` troca o seletor de empresa por outro elemento
 * (a casca põe o `TenantSwitcher` dentro de um `Menu`); sem ele, mostra o seletor de `tenant`.
 */
export function AppNav({
  productName = 'Leadtogo',
  tenant,
  tenantSlot,
  user,
  onSettings,
  groups,
  className,
}: {
  productName?: string
  tenant?: EmpresaAtiva
  tenantSlot?: ReactNode
  user?: { name: string; role: string }
  onSettings?: () => void
  groups: GrupoDaNavegacao[]
  className?: string
}) {
  return (
    <nav
      aria-label="Principal"
      className={cn(
        'box-border flex w-(--sidebar-width) max-w-full flex-col gap-4 border-r border-border bg-surface p-3',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1 text-base leading-5 font-bold tracking-[-.01em] text-ink">
        <span className="inline-flex size-6 items-center justify-center rounded-sm bg-brand text-on-brand">
          <ArrowRight size={15} strokeWidth={2.5} aria-hidden="true" />
        </span>
        {productName}
      </div>
      {tenantSlot ?? (tenant ? <TenantSwitcher current={tenant} /> : null)}
      {groups.map((grupo, i) => (
        <div key={grupo.label ?? i} className="flex flex-col gap-0.5">
          {grupo.label ? (
            <span className="px-2 pt-2 pb-1 text-[11px] leading-4 font-semibold tracking-[.06em] text-ink-subtle uppercase">
              {grupo.label}
            </span>
          ) : null}
          {grupo.items.map(({ icon: Icone, label, href, active, count, onClick }) => (
            <a
              key={label}
              href={href ?? '#'}
              aria-current={active ? 'page' : undefined}
              onClick={(e) => {
                if (!href) e.preventDefault()
                onClick?.()
              }}
              className="group flex h-[34px] w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left font-medium text-ink-muted no-underline hover:bg-surface-hover hover:text-ink aria-[current=page]:bg-surface-selected aria-[current=page]:font-semibold aria-[current=page]:text-brand"
            >
              <Icone size={17} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
              {label}
              {count !== undefined ? (
                <span className="ml-auto text-[12px] font-semibold tabular-nums text-ink-muted group-aria-[current=page]:text-brand">
                  {count}
                </span>
              ) : null}
            </a>
          ))}
        </div>
      ))}
      {user ? (
        <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
          <Avatar name={user.name} />
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-[13px]">{user.name}</b>
            <span className="text-[12px] text-ink-muted">{user.role}</span>
          </span>
          <IconButton icon={Settings} label="Configurações" size="sm" onClick={onSettings} />
        </div>
      ) : null}
    </nav>
  )
}
