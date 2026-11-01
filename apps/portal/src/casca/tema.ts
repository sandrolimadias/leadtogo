import type { PreferenciasDoPortal } from '@leadtogo/api-client'

export type Tema = PreferenciasDoPortal['tema']

const CHAVE = 'leadtogo-portal:tema'

/** Aplica o tema no <html>: "sistema" tira o atributo e vale a preferência do aparelho (tokens.css). */
export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement
  if (tema === 'sistema') raiz.removeAttribute('data-theme')
  else raiz.setAttribute('data-theme', tema === 'claro' ? 'light' : 'dark')
}

export function temaGuardado(): Tema {
  try {
    const t = localStorage.getItem(CHAVE)
    return t === 'claro' || t === 'escuro' || t === 'sistema' ? t : 'sistema'
  } catch {
    return 'sistema'
  }
}

/** Guarda no aparelho (para não piscar na próxima abertura) e aplica. */
export function guardarTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    // sem localStorage (modo privado): vale só nesta aba
  }
  aplicarTema(tema)
}
