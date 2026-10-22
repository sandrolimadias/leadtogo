import type { ReactNode } from 'react'

import { usePermissoes } from './permissoes'

/** Mostra `children` só para quem tem a permissão (ao menos uma, se vierem várias). */
export function Pode({
  chave,
  children,
  senao = null,
}: {
  chave: string | readonly string[]
  children: ReactNode
  senao?: ReactNode
}) {
  const { pode } = usePermissoes()
  return <>{pode(chave) ? children : senao}</>
}
