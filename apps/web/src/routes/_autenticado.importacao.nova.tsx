import { TIPOS_DE_IMPORTACAO, type TipoDeImportacao } from '@leadtogo/shared'
import { createFileRoute } from '@tanstack/react-router'

import { EnviarPlanilha } from '@/telas/importacao/enviar'

/** `?tipo=contatos` abre o envio já no tipo escolhido (os botões das listas de Contatos e de Atividades). */
export const Route = createFileRoute('/_autenticado/importacao/nova')({
  validateSearch: (s: Record<string, unknown>): { tipo?: TipoDeImportacao } =>
    (TIPOS_DE_IMPORTACAO as readonly unknown[]).includes(s['tipo'])
      ? { tipo: s['tipo'] as TipoDeImportacao }
      : {},
  component: EnviarPlanilha,
})
