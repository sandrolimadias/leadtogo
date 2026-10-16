import { Check, type LucideIcon } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type ItemDeMenu =
  | {
      icon?: LucideIcon
      label: string
      shortcut?: string
      danger?: boolean
      /** Marca o item ativo (ex.: a empresa atual); vira um item de rádio/checagem acessível */
      checked?: boolean
      onSelect?: () => void
    }
  | { separator: true }
  | { heading: string }

const classeDoPainel =
  'flex max-w-80 min-w-55 flex-col rounded-md border border-border bg-surface p-1 text-ink shadow-md'
const classeDoRotulo =
  'px-2 pt-2 pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-subtle uppercase'
const classeDoItem =
  'flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-sm text-ink outline-none hover:bg-surface-hover data-[highlighted]:bg-surface-hover'
const classeDoPerigo = 'text-danger hover:bg-danger-soft data-[highlighted]:bg-danger-soft'

type ItemComRotulo = Exclude<ItemDeMenu, { separator: true } | { heading: string }>

function ConteudoDoItem({ item }: { item: ItemComRotulo }) {
  const Icone = item.icon
  return (
    <>
      {Icone ? (
        <Icone
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className={item.danger ? 'text-danger' : 'text-ink-muted'}
        />
      ) : null}
      <span>{item.label}</span>
      {item.shortcut ? (
        <span className="ml-auto font-mono text-xs text-ink-subtle">{item.shortcut}</span>
      ) : null}
      {item.checked ? (
        <Check size={16} strokeWidth={1.75} aria-hidden="true" className="text-brand" />
      ) : null}
    </>
  )
}

/**
 * O painel do menu aberto, estático (sem Radix): é o que o catálogo mostra e o que o `Menu` desenha ao
 * abrir. Para um menu que abre e fecha, use `Menu`.
 */
export function MenuList({
  items,
  label,
  className,
}: {
  items: ItemDeMenu[]
  label?: string
  className?: string
}) {
  return (
    <div role="menu" aria-label={label} className={cn(classeDoPainel, className)}>
      {items.map((item, i) => {
        if ('separator' in item) {
          return <div key={`s${i}`} role="separator" className="my-1 h-px bg-border" />
        }
        if ('heading' in item) {
          return (
            <div key={`h${i}`} className={classeDoRotulo}>
              {item.heading}
            </div>
          )
        }
        return (
          <button
            key={item.label}
            type="button"
            role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
            aria-checked={item.checked}
            onClick={item.onSelect}
            className={cn(
              classeDoItem,
              item.danger && classeDoPerigo,
              item.checked && 'font-semibold',
            )}
          >
            <ConteudoDoItem item={item} />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Menu suspenso (DropdownMenu). `trigger` é o botão que abre (precisa aceitar foco e `ref`) e dá o nome
 * ao menu para o leitor de tela;
 * setas navegam, Enter seleciona e Esc fecha, com o foco devolvido ao botão.
 */
export function Menu({
  trigger,
  items,
  align = 'start',
  side = 'bottom',
  className,
}: {
  trigger: ReactNode
  items: ItemDeMenu[]
  align?: 'start' | 'end' | 'center'
  side?: 'bottom' | 'top' | 'right' | 'left'
  className?: string
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          side={side}
          sideOffset={6}
          className={cn(
            'z-[1000] max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto',
            classeDoPainel,
            className,
          )}
        >
          {items.map((item, i) => {
            if ('separator' in item) {
              return <DropdownMenu.Separator key={`s${i}`} className="my-1 h-px bg-border" />
            }
            if ('heading' in item) {
              return (
                <DropdownMenu.Label key={`h${i}`} className={classeDoRotulo}>
                  {item.heading}
                </DropdownMenu.Label>
              )
            }
            return (
              <DropdownMenu.Item
                key={item.label}
                onSelect={() => item.onSelect?.()}
                aria-checked={item.checked}
                className={cn(
                  classeDoItem,
                  item.danger && classeDoPerigo,
                  item.checked && 'font-semibold',
                )}
              >
                <ConteudoDoItem item={item} />
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
