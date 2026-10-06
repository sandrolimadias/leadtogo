import { createFileRoute, notFound } from '@tanstack/react-router'

import { Catalogo } from '@/dev/catalogo'

// Só em desenvolvimento. No build, '@/dev/catalogo' vira um módulo vazio (vite.config.ts) e a rota dá 404.
export const Route = createFileRoute('/dev/catalogo')({
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- é assim que o TanStack Router sinaliza 404
    if (!import.meta.env.DEV) throw notFound()
  },
  component: Catalogo,
})
