const PERIODOS_DO_DASHBOARD = ['mes', 'mes_anterior', 'trimestre'] as const
type PeriodoDoDashboard = (typeof PERIODOS_DO_DASHBOARD)[number]

/** O que fica na URL do Dashboard (só o que não é o padrão). */
export interface BuscaDoDashboard {
  periodo?: Exclude<PeriodoDoDashboard, 'mes'>
  /** Id do funil do bloco "Funil e previsão" */
  funil?: string
}

/** `validateSearch` da rota: devolve só valores válidos. */
export function lerBusca(entrada: Record<string, unknown>): BuscaDoDashboard {
  const periodo = PERIODOS_DO_DASHBOARD.find((p) => p === entrada['periodo'])
  const funil =
    typeof entrada['funil'] === 'string' && entrada['funil'].trim() !== ''
      ? entrada['funil'].trim()
      : undefined
  return {
    ...(periodo && periodo !== 'mes' ? { periodo } : {}),
    ...(funil ? { funil } : {}),
  }
}
