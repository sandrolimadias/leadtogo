import type { CSSProperties } from 'react'
import { Toaster as Sonner } from 'sonner'

/**
 * Pilha de avisos temporários (Sonner). O visual de cada aviso é o `Toast` do design system (360 px).
 * Desktop: canto inferior direito; celular: acima da barra inferior, largura total − 24 px (a casca
 * passa `celular`).
 */
export function Toaster({ celular = false }: { celular?: boolean }) {
  return (
    <Sonner
      position={celular ? 'bottom-center' : 'bottom-right'}
      duration={4500}
      visibleToasts={3}
      offset={16}
      mobileOffset={{ bottom: celular ? 84 : 16, left: 12, right: 12 }}
      style={{ '--width': '360px' } as CSSProperties}
    />
  )
}
