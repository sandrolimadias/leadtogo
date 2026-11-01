import {
  TAMANHO_DE_PAGINA_DE_CARTOES_PADRAO,
  TAMANHOS_DE_PAGINA_DE_CARTOES,
  type TamanhoDePaginaDeCartoes,
} from '@leadtogo/shared'
import { useState } from 'react'

const PREFIXO = 'leadtogo:por-pagina:'

function lerGuardado(lista: string): TamanhoDePaginaDeCartoes {
  try {
    const n = Number(globalThis.localStorage?.getItem(PREFIXO + lista))
    return (TAMANHOS_DE_PAGINA_DE_CARTOES as readonly number[]).includes(n)
      ? (n as TamanhoDePaginaDeCartoes)
      : TAMANHO_DE_PAGINA_DE_CARTOES_PADRAO
  } catch {
    return TAMANHO_DE_PAGINA_DE_CARTOES_PADRAO
  }
}

/**
 * Página e tamanho (5, 10 ou 20) das listas de cartões do hub do portal. O tamanho fica no aparelho
 * (localStorage, por lista); mudar o tamanho volta para a primeira página.
 */
export function usePaginaDeCartoes(lista: string) {
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState<TamanhoDePaginaDeCartoes>(() => lerGuardado(lista))
  return {
    pagina,
    porPagina,
    irPara: setPagina,
    mudarTamanho: (n: TamanhoDePaginaDeCartoes) => {
      setPorPagina(n)
      setPagina(1)
      try {
        globalThis.localStorage?.setItem(PREFIXO + lista, String(n))
      } catch {
        // sem localStorage (modo privado): vale só nesta tela
      }
    },
    voltarAoInicio: () => setPagina(1),
  }
}
