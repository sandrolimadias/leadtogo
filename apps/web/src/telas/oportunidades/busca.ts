import { statusDaOportunidadeSchema, type StatusDaOportunidade } from '@leadtogo/shared'

/** O que fica na URL de Oportunidades (só o que não é o padrão). */
export interface BuscaDeOportunidades {
  visao?: 'lista'
  /** Id do funil (sem ele, o padrão) */
  funil?: string
  /** Id do responsável */
  responsavel?: string
  /** Só na lista: filtra por status */
  status?: StatusDaOportunidade
  /** Id da fase (na lista) */
  fase?: string
  /** Id do motivo de fechamento (na lista) */
  motivo?: string
  /** `perdas` = perdidas e canceladas (na lista) */
  grupo?: 'perdas'
  /** Fechadas de (AAAA-MM-DD) até (AAAA-MM-DD, o dia todo), na lista */
  de?: string
  ate?: string
  pagina?: number
}

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
const inteiro = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

const dia = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined

/** `validateSearch` da rota: devolve só valores válidos. */
export function lerBusca(entrada: Record<string, unknown>): BuscaDeOportunidades {
  const funil = texto(entrada['funil'])
  const responsavel = texto(entrada['responsavel'])
  const status = statusDaOportunidadeSchema.safeParse(entrada['status'])
  const pagina = inteiro(entrada['pagina'])
  const fase = texto(entrada['fase'])
  const motivo = texto(entrada['motivo'])
  const de = dia(entrada['de'])
  const ate = dia(entrada['ate'])
  return {
    ...(entrada['visao'] === 'lista' ? { visao: 'lista' as const } : {}),
    ...(funil ? { funil } : {}),
    ...(responsavel ? { responsavel } : {}),
    ...(status.success ? { status: status.data } : {}),
    ...(fase ? { fase } : {}),
    ...(motivo ? { motivo } : {}),
    ...(entrada['grupo'] === 'perdas' ? { grupo: 'perdas' as const } : {}),
    ...(de ? { de } : {}),
    ...(ate ? { ate } : {}),
    ...(pagina && pagina > 1 ? { pagina } : {}),
  }
}
