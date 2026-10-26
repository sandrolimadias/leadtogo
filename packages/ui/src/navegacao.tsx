import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './cn'

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
  recolhido,
  className,
  ...resto
}: {
  current: EmpresaAtiva
  /** Menu recolhido: só o quadrado de 40 px com as iniciais */
  recolhido?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  if (recolhido) {
    return (
      <button
        type="button"
        aria-haspopup="menu"
        aria-label={`Empresa ativa: ${current.name}. Trocar de empresa`}
        title={current.name}
        {...resto}
        className={cn(
          'inline-flex size-10 cursor-pointer items-center justify-center self-center rounded-md border border-border bg-surface p-0 hover:bg-surface-hover',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-sm text-[11px] font-bold',
            classeDaCor[current.color ?? 'teal'],
          )}
        >
          {iniciais(current.name)}
        </span>
      </button>
    )
  }
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
  /** Item secundário: texto em tom mais suave (grupo Carteira) */
  suave?: boolean
  count?: number
  /** Selo no lugar do contador (ex.: "Fase 3") */
  selo?: string
  onClick?: () => void
}

export interface GrupoDaNavegacao {
  label?: string
  items: ItemDaNavegacao[]
}

/** O que o app passa para desenhar o item como link do roteador (em vez de um `<a>` que recarrega). */
export interface LinkDoItem {
  item: ItemDaNavegacao
  className: string
  'aria-current': 'page' | undefined
  title: string | undefined
  children: ReactNode
}

const classeDoItem =
  'group flex h-[34px] w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left font-medium text-ink-muted no-underline hover:bg-surface-hover hover:text-ink aria-[current=page]:bg-surface-selected aria-[current=page]:font-semibold aria-[current=page]:text-brand'

/**
 * Navegação lateral do desktop (248 px; recolhida, 64 px só com ícones). `tenantSlot` troca o seletor de
 * empresa por outro elemento (a casca o põe dentro de um `Menu`); `renderLink` desenha os itens como
 * links do roteador; `rodape` troca o rodapé (usuário) quando a casca precisa de menu próprio.
 */
export function AppNav({
  productName = 'Leadtogo',
  tenant,
  tenantSlot,
  user,
  onSettings,
  groups,
  recolhido,
  aoAlternarRecolhimento,
  renderLink,
  rodape,
  marca: marcaPropria,
  espacoso,
  className,
}: {
  productName?: string
  tenant?: EmpresaAtiva
  tenantSlot?: ReactNode
  user?: { name: string; role: string }
  onSettings?: () => void
  groups: GrupoDaNavegacao[]
  recolhido?: boolean
  /** Mostra o botão de recolher/expandir (a casca guarda a preferência) */
  aoAlternarRecolhimento?: () => void
  renderLink?: (link: LinkDoItem) => ReactNode
  rodape?: ReactNode
  /** Marca gráfica no lugar da seta do catálogo (a casca usa o logotipo) */
  marca?: ReactNode
  /** Itens de 36 px com 4 px entre eles (a casca, README do protótipo); o padrão do catálogo é 34 px e 2 px */
  espacoso?: boolean
  className?: string
}) {
  const marca = marcaPropria ?? (
    <span className="inline-flex size-6 flex-none items-center justify-center rounded-sm bg-brand text-on-brand">
      <ArrowRight size={15} strokeWidth={2.5} aria-hidden="true" />
    </span>
  )
  return (
    <nav
      aria-label="Principal"
      className={cn(
        'box-border flex max-w-full flex-col border-r border-border bg-surface px-3 transition-[width] duration-150',
        espacoso ? 'gap-1 py-4' : 'gap-4 py-3',
        recolhido ? 'w-16 items-stretch' : 'w-(--sidebar-width)',
        className,
      )}
    >
      {recolhido ? (
        <div className={cn('flex flex-col items-center gap-2 py-1', espacoso && 'pb-3')}>
          {marca}
          {aoAlternarRecolhimento ? (
            <IconButton
              icon={ChevronRight}
              label="Expandir menu"
              size="sm"
              onClick={aoAlternarRecolhimento}
            />
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1 text-base leading-5 font-bold tracking-[-.01em] text-ink',
            espacoso && 'pb-3 text-[17px]',
          )}
        >
          {marca}
          {productName}
          {aoAlternarRecolhimento ? (
            <IconButton
              icon={ChevronLeft}
              label="Recolher menu"
              size="sm"
              className="ml-auto"
              onClick={aoAlternarRecolhimento}
            />
          ) : null}
        </div>
      )}
      <div className={cn(espacoso && 'mb-3')}>
        {tenantSlot ?? (tenant ? <TenantSwitcher current={tenant} recolhido={recolhido} /> : null)}
      </div>
      {groups.map((grupo, i) => (
        <div key={grupo.label ?? i} className={cn('flex flex-col', espacoso ? 'gap-1' : 'gap-0.5')}>
          {grupo.label ? (
            recolhido ? (
              <hr className={cn('mx-2 h-px border-0 bg-border', espacoso ? 'my-3' : 'my-1')} />
            ) : (
              <span
                className={cn(
                  'px-2 pt-2 pb-1 text-[11px] leading-4 font-semibold tracking-[.06em] text-ink-subtle uppercase',
                  espacoso && 'px-2.5 pt-4',
                )}
              >
                {grupo.label}
              </span>
            )
          ) : null}
          {grupo.items.map((item) => {
            const { icon: Icone, label, href, active, suave, count, selo, onClick } = item
            const conteudo = (
              <>
                <Icone size={17} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
                {recolhido ? <span className="sr-only">{label}</span> : label}
                {!recolhido && selo ? (
                  <span className="ml-auto rounded-xs bg-surface-sunken px-1.5 text-[11px] leading-4 font-semibold text-ink-muted">
                    {selo}
                  </span>
                ) : null}
                {!recolhido && count !== undefined ? (
                  <span className="ml-auto text-[12px] font-semibold tabular-nums text-ink-muted group-aria-[current=page]:text-brand">
                    {count}
                  </span>
                ) : null}
              </>
            )
            const classe = cn(
              classeDoItem,
              espacoso && 'h-9 gap-2.5 px-2.5',
              espacoso && !suave && 'text-ink',
              recolhido && 'justify-center px-0',
            )
            const atual = active ? ('page' as const) : undefined
            if (renderLink) {
              return (
                <span key={label} className="contents">
                  {renderLink({
                    item,
                    className: classe,
                    'aria-current': atual,
                    title: recolhido ? label : undefined,
                    children: conteudo,
                  })}
                </span>
              )
            }
            return (
              <a
                key={label}
                href={href ?? '#'}
                aria-current={atual}
                title={recolhido ? label : undefined}
                onClick={(e) => {
                  if (!href) e.preventDefault()
                  onClick?.()
                }}
                className={classe}
              >
                {conteudo}
              </a>
            )
          })}
        </div>
      ))}
      {rodape ??
        (user ? (
          <div
            className={cn(
              'mt-auto flex items-center gap-2 border-t border-border pt-3',
              recolhido && 'justify-center',
            )}
          >
            <Avatar name={user.name} />
            {recolhido ? null : (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-[13px]">{user.name}</b>
                  <span className="text-[12px] text-ink-muted">{user.role}</span>
                </span>
                <IconButton icon={Settings} label="Configurações" size="sm" onClick={onSettings} />
              </>
            )}
          </div>
        ) : null)}
    </nav>
  )
}
