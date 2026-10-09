import * as Sentry from '@sentry/react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

/** Tela de último recurso: um erro de renderização que nenhuma tela tratou. */
function ErroGeral() {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p>O erro foi registrado. Recarregue a página para continuar.</p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        Recarregar
      </Button>
    </div>
  )
}

/** Envolve o app: captura erros de renderização, envia ao GlitchTip (se ligado) e mostra o aviso. */
export function LimiteDeErros({ children }: { children: ReactNode }) {
  return <Sentry.ErrorBoundary fallback={<ErroGeral />}>{children}</Sentry.ErrorBoundary>
}
