import { useRef, useState } from 'react'

export const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Classe dos links das telas de acesso (acento, semibold; o sublinhado aparece no hover/foco). */
export const classeDoLink = 'font-semibold text-brand hover:underline'
export const classeDoLinkSuave = 'text-ink-muted hover:text-ink hover:underline'

/**
 * Trava o envio: enquanto uma chamada está em andamento, outra não começa (duplo clique, Enter
 * repetido). A trava é um ref, então vale já no mesmo instante, antes de o estado atualizar.
 */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false)
  const trava = useRef(false)
  const executar = async (acao: () => Promise<void>) => {
    if (trava.current) return
    trava.current = true
    setEnviando(true)
    try {
      await acao()
    } finally {
      trava.current = false
      setEnviando(false)
    }
  }
  return { enviando, executar }
}

/** Leva o foco ao primeiro campo com erro (o leitor de tela lê o erro ligado a ele). */
export function focarCampo(id: string) {
  document.getElementById(id)?.focus()
}
