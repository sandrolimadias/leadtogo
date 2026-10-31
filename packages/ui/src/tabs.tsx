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
  preencher = false,
  className,
  children,
}: {
  items: ItemDeAba[]
  value?: string
  defaultValue?: string
  onChange?: (valor: string) => void
  label: string
  /**
   * No celular (abaixo de `md`), as abas dividem a largura toda e ficam mais justas, para caberem sem rolar
   * (Atividades: três abas com contador passavam da tela e a última ficava cortada). Use com poucas abas.
   */
  preencher?: boolean
  className?: string
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
        // na horizontal com o dedo, sem a barra. `flex-none`: numa coluna de altura fixa (painel da empresa no
        // mapa, Atividades), uma caixa com overflow tem altura mínima 0 e encolhia até sumir com as abas.
        className={cn(
          'flex min-w-0 flex-none gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          preencher && 'max-md:gap-0',
        )}
      >
        {items.map((item) => (
          <AbasDoRadix.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              'relative inline-flex cursor-pointer items-center gap-1.5 rounded-t-sm border-0 bg-transparent px-3 pt-2 pb-[10px] text-sm font-semibold whitespace-nowrap text-ink-muted hover:bg-surface-hover hover:text-ink data-[state=active]:text-ink',
              "data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-t-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:content-['']",
              preencher &&
                'max-md:flex-1 max-md:justify-center max-md:gap-1 max-md:px-1.5 max-md:text-[13px] max-md:leading-5',
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
