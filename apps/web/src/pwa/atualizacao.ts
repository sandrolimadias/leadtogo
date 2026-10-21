import { useSyncExternalStore } from 'react'

/** De quanto em quanto tempo o app aberto pergunta ao servidor se há versão nova do service worker. */
export const INTERVALO_DA_CHECAGEM_MS = 60 * 60 * 1000

/**
 * Procura versão nova do service worker ao voltar ao primeiro plano (`visibilitychange`) e a cada hora com o
 * app aberto. Falha de rede é ignorada (a próxima checagem tenta de novo). Devolve a função que desfaz tudo.
 */
export function vigiarAtualizacao(
  registro: { update: () => Promise<unknown> },
  {
    documento = document,
    intervaloMs = INTERVALO_DA_CHECAGEM_MS,
  }: {
    documento?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
    intervaloMs?: number
  } = {},
): () => void {
  const checar = () => {
    void registro.update().catch(() => undefined)
  }
  const aoMudarVisibilidade = () => {
    if (documento.visibilityState === 'visible') checar()
  }
  documento.addEventListener('visibilitychange', aoMudarVisibilidade)
  const relogio = setInterval(checar, intervaloMs)
  return () => {
    documento.removeEventListener('visibilitychange', aoMudarVisibilidade)
    clearInterval(relogio)
  }
}

// ---------- Estado do aviso "Nova versão disponível" ----------
let novaVersao = false
let aplicar: (() => void) | null = null
const ouvintes = new Set<() => void>()

/** Chamado pelo registro do service worker quando há versão nova esperando. `atualizar` ativa e recarrega. */
export function avisarNovaVersao(atualizar: () => void): void {
  novaVersao = true
  aplicar = atualizar
  ouvintes.forEach((o) => o())
}

/** Só para os testes. */
export function zerarNovaVersao(): void {
  novaVersao = false
  aplicar = null
  ouvintes.forEach((o) => o())
}

export function atualizarAgora(): void {
  aplicar?.()
}

export function useNovaVersao(): boolean {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => novaVersao,
    () => false,
  )
}
