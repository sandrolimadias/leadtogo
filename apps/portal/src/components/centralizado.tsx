import { Avatar } from '@leadtogo/ui/exibicao'
import type { ReactNode } from 'react'

/** Moldura das telas sem login (entrar, confirmar link, verificação): um cartão no centro. */
export function Centralizado({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-bg px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Avatar name="Portal do Cliente" size="lg" />
          <div className="min-w-0">
            <p className="m-0 text-xs leading-4 text-ink-muted">Portal do Cliente</p>
            <h1 className="m-0 text-xl leading-7 font-semibold">{titulo}</h1>
          </div>
        </div>
        {descricao ? (
          <p className="mt-0 mb-4 text-sm leading-5 text-ink-muted">{descricao}</p>
        ) : null}
        {children}
      </div>
    </main>
  )
}
