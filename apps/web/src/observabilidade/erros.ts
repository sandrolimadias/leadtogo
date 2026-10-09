import { limparBreadcrumb, limparEvento } from '@leadtogo/shared'
import * as Sentry from '@sentry/react'

let ligado = false

/**
 * Liga o envio de erros do navegador ao GlitchTip (SDK do Sentry). Sem DSN não faz nada (dev e
 * testes). Sem tracing, replay nem dados do usuário; todo evento passa por `limparEvento`.
 * O DSN do navegador é público por desenho (só permite enviar eventos): entra no build
 * (`VITE_SENTRY_DSN`, Variable do GitHub) e o `release` é o commit do build.
 */
export function iniciarObservabilidade(opcoes: {
  dsn: string | undefined
  release: string
  environment: string
  transport?: Sentry.BrowserOptions['transport']
}): boolean {
  if (!opcoes.dsn) return false
  Sentry.init({
    dsn: opcoes.dsn,
    release: opcoes.release,
    environment: opcoes.environment,
    tracesSampleRate: 0,
    // No SDK 11 o `sendDefaultPii` foi substituído por `dataCollection` (cujo padrão coleta tudo)
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    beforeSend: (evento) => limparEvento(evento),
    beforeBreadcrumb: (breadcrumb) => limparBreadcrumb(breadcrumb),
    ...(opcoes.transport ? { transport: opcoes.transport } : {}),
  })
  ligado = true
  return true
}

/** Marca os eventos seguintes com a pessoa e a empresa (só uuids, nunca nome nem e-mail). */
export function identificarSessao(ids: { usuarioId?: string; empresaId?: string | null }): void {
  if (!ligado) return
  Sentry.setTag('user_id', ids.usuarioId ?? null)
  Sentry.setTag('tenant_id', ids.empresaId ?? null)
}
