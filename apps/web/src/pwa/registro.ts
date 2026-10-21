import { registerSW } from 'virtual:pwa-register'

import { avisarNovaVersao, vigiarAtualizacao } from './atualizacao'

/**
 * Registra o service worker (só no build: no dev e nos testes `virtual:pwa-register` é um módulo vazio, ver
 * vite.config.ts). A versão nova fica esperando; o app NUNCA recarrega sozinho: o aviso "Nova versão
 * disponível · Atualizar" chama `atualizar`, que ativa o worker novo e recarrega.
 */
export function registrarServiceWorker(): void {
  const atualizar = registerSW({
    onNeedRefresh: () => avisarNovaVersao(() => void atualizar(true)),
    onRegisteredSW: (_url, registro) => {
      if (registro) vigiarAtualizacao(registro)
    },
  })
}
