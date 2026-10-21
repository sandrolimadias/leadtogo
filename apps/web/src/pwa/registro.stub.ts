// Substitui `virtual:pwa-register` fora do build (alias em vite.config.ts): sem service worker no dev nem nos testes.
export function registerSW(_opcoes?: unknown): (recarregar?: boolean) => Promise<void> {
  return () => Promise.resolve()
}
