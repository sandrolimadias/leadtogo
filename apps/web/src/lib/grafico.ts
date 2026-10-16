import { useEffect, useState } from 'react'

// Apoio dos gráficos (docs/design_system.md, seção "Gráficos"); o componente fica em components/ui/grafico.tsx.

/** A cor de uma tag (`teal`, `blue`...) como variável CSS dos tokens. */
export const corDaTag = (cor: string): string => `var(--tag-${cor}-fg)`

/** O usuário pediu menos movimento: os gráficos não animam. */
export function useReduzirMovimento(): boolean {
  const [reduzir, setReduzir] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const aoMudar = () => setReduzir(m.matches)
    m.addEventListener('change', aoMudar)
    return () => m.removeEventListener('change', aoMudar)
  }, [])
  return reduzir
}
