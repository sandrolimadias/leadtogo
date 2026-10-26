import { useSyncExternalStore } from 'react'

export type Dispositivo = 'desktop' | 'tablet' | 'celular'

/** Pontos de corte do design system: `bp-lg` 1024 px e `bp-md` 768 px. */
export function dispositivoDe(largura: number): Dispositivo {
  if (largura >= 1024) return 'desktop'
  if (largura >= 768) return 'tablet'
  return 'celular'
}

function assinar(aviso: () => void) {
  window.addEventListener('resize', aviso)
  return () => window.removeEventListener('resize', aviso)
}

/** Desktop (menu lateral), tablet (trilho de ícones) ou celular (cabeçalho, barra inferior e folha). */
export function useDispositivo(): Dispositivo {
  const largura = useSyncExternalStore(
    assinar,
    () => window.innerWidth,
    () => 1280,
  )
  return dispositivoDe(largura)
}
