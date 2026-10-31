import { Star } from 'lucide-react'

import { cn } from './cn'

/**
 * A nota de 1 a 5 em estrelas, só para leitura (avaliação do chamado e, depois, das pesquisas). O leitor de
 * tela ouve "Nota 4 de 5"; as estrelas são decorativas.
 */
export function Estrelas({
  nota,
  tamanho = 14,
  className,
}: {
  nota: number
  tamanho?: number
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={`Nota ${nota} de 5`}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={tamanho}
          strokeWidth={1.75}
          aria-hidden="true"
          className={n <= nota ? 'fill-warning text-warning' : 'text-ink-subtle'}
        />
      ))}
    </span>
  )
}
