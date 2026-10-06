import { Tooltip as DicaDoRadix } from 'radix-ui'
import type { ReactElement } from 'react'

/** Provedor único, na raiz do app: o atraso de abertura é o mesmo em todas as dicas. */
export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <DicaDoRadix.Provider delayDuration={300}>{children}</DicaDoRadix.Provider>
)

/**
 * Dica curta ao passar o mouse ou focar: complementa, nunca guarda informação essencial (no celular
 * não há hover). `children` é o gatilho focável.
 */
export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <DicaDoRadix.Root>
      <DicaDoRadix.Trigger asChild>{children}</DicaDoRadix.Trigger>
      <DicaDoRadix.Portal>
        <DicaDoRadix.Content
          sideOffset={6}
          className="z-[1000] max-w-60 rounded-sm bg-ink px-2 py-1 text-xs leading-4 font-medium text-surface"
        >
          {label}
        </DicaDoRadix.Content>
      </DicaDoRadix.Portal>
    </DicaDoRadix.Root>
  )
}
