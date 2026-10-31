import { Tabs as AbasDoRadix } from 'radix-ui'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from './cn'

export interface ItemDeAba {
  value: string
  label: string
  icon?: LucideIcon
  count?: number
}

/**
 * Abas das fichas e das telas de configuração (setas movem o foco, como no padrão WAI-ARIA).
 * O conteúdo de cada aba é de quem usa: `children` aparece dentro do `Tabs.Content` com o valor atual.
 */
export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  label,
  className,
  quebrar = false,
  children,
}: {
  items: ItemDeAba[]
  value?: string
  defaultValue?: string
  onChange?: (valor: string) => void
  label: string
  className?: string
  /**
   * Na tela estreita, as abas que não cabem descem para a linha de baixo em vez de rolar na horizontal:
   * nunca aparece barra de rolagem, em nenhum navegador (o portal do cliente usa assim).
   */
  quebrar?: boolean
  children?: ReactNode
}) {
  return (
    <AbasDoRadix.Root
      {...(value !== undefined
        ? { value }
        : { defaultValue: defaultValue ?? items[0]?.value ?? '' })}
      {...(onChange ? { onValueChange: onChange } : {})}
      className={className}
    >
      <AbasDoRadix.List
        aria-label={label}
        // A linha de baixo é uma sombra interna (não borda) e o sublinhado da aba ativa fica dentro da lista:
        // nada passa da altura, então não aparece barra de rolagem. Com muitas abas na tela estreita, rola
        // na horizontal com o dedo, sem a barra.
        className={cn(
          'flex gap-1 shadow-[inset_0_-1px_0_var(--border)]',
          quebrar
            ? 'flex-wrap overflow-hidden'
            : 'overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {items.map((item) => (
          <AbasDoRadix.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              'relative inline-flex cursor-pointer items-center gap-1.5 rounded-t-sm border-0 bg-transparent px-3 pt-2 pb-[10px] text-sm font-semibold whitespace-nowrap text-ink-muted hover:bg-surface-hover hover:text-ink data-[state=active]:text-ink',
              "data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-t-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:content-['']",
            )}
          >
            {item.icon ? <item.icon size={15} strokeWidth={1.75} aria-hidden="true" /> : null}
            {item.label}
            {item.count !== undefined ? (
              <span className="rounded-full bg-surface-sunken px-1.5 text-[11px] leading-[18px] font-semibold text-ink-muted tabular-nums">
                {item.count}
              </span>
            ) : null}
          </AbasDoRadix.Trigger>
        ))}
      </AbasDoRadix.List>
      {children}
    </AbasDoRadix.Root>
  )
}

export const ConteudoDaAba = AbasDoRadix.Content
