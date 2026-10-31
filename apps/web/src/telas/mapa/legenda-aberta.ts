import { useState } from 'react'

/** Onde fica, no aparelho, se a pessoa deixou a legenda aberta ou fechada */
export const CHAVE_DA_LEGENDA = 'leadtogo:mapa:legenda'

/** A legenda começa aberta; a escolha de abrir ou fechar fica guardada no aparelho (não vai para o servidor). */
export function useLegendaAberta(): [boolean, (aberta: boolean) => void] {
  const [aberta, setAberta] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_DA_LEGENDA) !== 'fechada'
    } catch {
      return true // armazenamento bloqueado: aberta, como no padrão
    }
  })
  const mudar = (nova: boolean) => {
    setAberta(nova)
    try {
      localStorage.setItem(CHAVE_DA_LEGENDA, nova ? 'aberta' : 'fechada')
    } catch {
      // armazenamento bloqueado: vale só nesta visita
    }
  }
  return [aberta, mudar]
}
