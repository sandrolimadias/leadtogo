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
            'z-[1000] flex max-w-80 min-w-55 flex-col rounded-md border border-border bg-surface p-1 text-ink shadow-md',
            className,
          )}
        >
          {items.map((item, i) => {
            if ('separator' in item) {
              return <DropdownMenu.Separator key={`s${i}`} className="my-1 h-px bg-border" />
            }
            if ('heading' in item) {
              return (
                <DropdownMenu.Label
                  key={`h${i}`}
                  className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-subtle uppercase"
                >
                  {item.heading}
                </DropdownMenu.Label>
              )
            }
            const Icone = item.icon
            return (
              <DropdownMenu.Item
                key={item.label}
                onSelect={() => item.onSelect?.()}
                aria-checked={item.checked}
                className={cn(
                  'flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm outline-none data-[highlighted]:bg-surface-hover',
                  item.danger && 'text-danger data-[highlighted]:bg-danger-soft',
                  item.checked && 'font-semibold',
                )}
              >
                {Icone ? (
                  <Icone
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className={item.danger ? 'text-danger' : 'text-ink-muted'}
                  />
                ) : null}
                {item.label}
                {item.shortcut ? (
                  <span className="ml-auto font-mono text-xs text-ink-subtle">{item.shortcut}</span>
                ) : null}
                {item.checked ? (
                  <Check
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="ml-auto text-brand"
                  />
                ) : null}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
