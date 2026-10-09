import { limparBreadcrumb, limparEvento } from '@leadtogo/shared'
import * as Sentry from '@sentry/node'

import type { Configuracao } from '../configuracao/configuracao.js'
import { contextoAtual, type ContextoLog } from '../log/contexto-log.js'

export type PapelDoProcesso = 'api' | 'worker'

const INTEGRACOES_DESLIGADAS = new Set([
  'OnUnhandledRejection',
  'ContextLines',
  'LocalVariablesAsync',
])

let ligado = false

/** Tags que identificam o contexto sem dado pessoal: só uuids e o id da requisição. */
export function tagsDoContexto(contexto: ContextoLog | undefined): Record<string, string> {
  if (!contexto) return {}
  return {
    request_id: contexto.requestId,
    ...(contexto.tenantId ? { tenant_id: contexto.tenantId } : {}),
    ...(contexto.userId ? { user_id: contexto.userId } : {}),
  }
}

/**
 * Liga o envio de erros ao GlitchTip (SDK do Sentry). Sem `SENTRY_DSN` não faz nada: dev e testes
 * não enviam nada. Sem tracing, sem PII e com todo evento passando por `limparEvento`.
 * Devolve se o SDK ficou ligado.
 */
export function iniciarObservabilidade(
  config: Pick<Configuracao, 'SENTRY_DSN' | 'APP_VERSION' | 'NODE_ENV'>,
  papel: PapelDoProcesso,
  opcoes: { transport?: Sentry.NodeOptions['transport'] } = {},
): boolean {
  if (!config.SENTRY_DSN) return false
  Sentry.init({
    dsn: config.SENTRY_DSN,
    release: config.APP_VERSION,
    environment: config.NODE_ENV,
    tracesSampleRate: 0,
    // No SDK 11 o `sendDefaultPii` foi substituído por `dataCollection` (cujo padrão coleta tudo):
    // aqui nada de usuário, cookies, cabeçalhos, corpos, query string, variáveis locais ou trechos de código.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    initialScope: { tags: { papel } },
    // Rejeição sem tratamento: registra e deixa o Node encerrar o processo, como sem o SDK
    // (o modo padrão "warn" engoliria a falha).
    // Sem trechos do código-fonte nem variáveis locais no evento (podem conter dados); os mapas de
    // origem resolvem a pilha.
    integrations: (padrao) => [
      ...padrao.filter((i) => !INTEGRACOES_DESLIGADAS.has(i.name)),
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
    ],
    beforeSend: (evento) => limparEvento(evento),
    beforeBreadcrumb: (breadcrumb) => limparBreadcrumb(breadcrumb),
    ...(opcoes.transport ? { transport: opcoes.transport } : {}),
  })
  ligado = true
  return true
}

/** Envia um erro inesperado, com o contexto da requisição (se houver) e tags extras. No-op sem SDK. */
export function reportarErro(erro: unknown, tags: Record<string, string> = {}): void {
  if (!ligado) return
  Sentry.withScope((escopo) => {
    escopo.setTags({ ...tagsDoContexto(contextoAtual()), ...tags })
    Sentry.captureException(erro)
  })
}

/** Espera o envio pendente (antes de sair do processo). */
export async function esvaziarErros(timeoutMs = 5000): Promise<boolean> {
  return ligado ? Sentry.flush(timeoutMs) : true
}

/** Para os testes: desliga e limpa o cliente. */
export async function desligarObservabilidade(): Promise<void> {
  if (!ligado) return
  ligado = false
  await Sentry.close(1000)
}
