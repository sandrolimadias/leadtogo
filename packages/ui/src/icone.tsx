import type { LucideIcon } from 'lucide-react'

import { cn } from './cn'

/**
 * Ícone de traço (Lucide) no padrão do design system: `currentColor`, traço 1,75. Sem `label` fica
 * escondido do leitor de tela (decorativo); com `label`, vira uma imagem com nome.
 */
export function Icon({
  icon: Icone,
  size = 16,
  strokeWidth = 1.75,
  label,
  className,
}: {
  icon: LucideIcon
  size?: number
  strokeWidth?: number
  label?: string
  className?: string
}) {
  return (
    <Icone
      size={size}
      strokeWidth={strokeWidth}
      className={cn('flex-none', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  )
}
