import { useSyncExternalStore } from 'react'

/** O tema que está valendo agora: o `data-theme` do <html> ou, sem ele, a preferência do sistema. */
export function temaAtual(): 'claro' | 'escuro' {
  const marcado = document.documentElement.getAttribute('data-theme')
  if (marcado === 'dark') return 'escuro'
  if (marcado === 'light') return 'claro'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'
}

function assinar(aoMudar: () => void): () => void {
  const observador = new MutationObserver(aoMudar)
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  const consulta = window.matchMedia?.('(prefers-color-scheme: dark)')
  consulta?.addEventListener('change', aoMudar)
  return () => {
    observador.disconnect()
    consulta?.removeEventListener('change', aoMudar)
  }
}

/** Re-renderiza quando o tema muda (o mapa troca o estilo e os pins relêem as cores dos tokens). */
export function useTema(): 'claro' | 'escuro' {
  return useSyncExternalStore(assinar, temaAtual, () => 'claro')
}

/** O valor de um token do design system (`--tag-red-fg`...) como cor, lido do CSS que está valendo. */
export function corDoToken(nome: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || '#0b5f70'
}
