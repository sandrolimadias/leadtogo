import {
  PERIODOS_DO_DASHBOARD,
  type PeriodoDoDashboard,
  VISOES_DO_DASHBOARD,
  type VisaoDoDashboard,
} from '@leadtogo/shared'

export const ABAS_DO_DASHBOARD = ['atividades', 'resultados'] as const
export type AbaDoDashboard = (typeof ABAS_DO_DASHBOARD)[number]

/** O que fica na URL do Dashboard (só o que não é o padrão). */
export interface BuscaDoDashboard {
  /** Padrão: Minhas atividades */
  aba?: Exclude<AbaDoDashboard, 'atividades'>
  periodo?: Exclude<PeriodoDoDashboard, 'mes'>
  /** O ano do período "Ano anterior" */
  ano?: number
  /** Início e fim do período personalizado (AAAA-MM-DD) */
  de?: string
  ate?: string
  visao?: Exclude<VisaoDoDashboard, 'minha'>
  /** Id do funil do gráfico do funil */
  funil?: string
}

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
const DIA = /^\d{4}-\d{2}-\d{2}$/

/** `validateSearch` da rota: devolve só valores válidos (e só o que o período escolhido usa). */
export function lerBusca(entrada: Record<string, unknown>): BuscaDoDashboard {
  const aba = ABAS_DO_DASHBOARD.find((a) => a === entrada['aba'])
  let periodo = PERIODOS_DO_DASHBOARD.find((p) => p === entrada['periodo'])
  const visao = VISOES_DO_DASHBOARD.find((v) => v === entrada['visao'])
  const funil = texto(entrada['funil'])
  const ano = Number(entrada['ano'])
  const de = texto(entrada['de'])
  const ate = texto(entrada['ate'])
  const anoValido = Number.isInteger(ano) && ano >= 2000 && ano <= 2100
  const datasValidas = !!de && !!ate && DIA.test(de) && DIA.test(ate) && de <= ate
  // período incompleto volta ao padrão
  if (periodo === 'ano_anterior' && !anoValido) periodo = undefined
  if (periodo === 'personalizado' && !datasValidas) periodo = undefined
  return {
    ...(aba && aba !== 'atividades' ? { aba } : {}),
    ...(periodo && periodo !== 'mes' ? { periodo } : {}),
    ...(periodo === 'ano_anterior' ? { ano } : {}),
    ...(periodo === 'personalizado' ? { de, ate } : {}),
    ...(visao && visao !== 'minha' ? { visao } : {}),
    ...(funil ? { funil } : {}),
  }
}

/** A consulta da API a partir da URL (período e visão). */
export function consultaDoPeriodo(b: BuscaDoDashboard): {
  periodo: PeriodoDoDashboard
  visao: VisaoDoDashboard
  ano?: number
  de?: string
  ate?: string
} {
  return {
    periodo: b.periodo ?? 'mes',
    visao: b.visao ?? 'minha',
    ...(b.ano !== undefined ? { ano: b.ano } : {}),
    ...(b.de ? { de: b.de } : {}),
    ...(b.ate ? { ate: b.ate } : {}),
  }
}
