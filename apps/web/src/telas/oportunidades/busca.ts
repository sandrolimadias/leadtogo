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
  pagina?: number
}

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
const inteiro = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** `validateSearch` da rota: devolve só valores válidos. */
export function lerBusca(entrada: Record<string, unknown>): BuscaDeOportunidades {
  const funil = texto(entrada['funil'])
  const responsavel = texto(entrada['responsavel'])
  const status = statusDaOportunidadeSchema.safeParse(entrada['status'])
  const pagina = inteiro(entrada['pagina'])
  return {
    ...(entrada['visao'] === 'lista' ? { visao: 'lista' as const } : {}),
    ...(funil ? { funil } : {}),
    ...(responsavel ? { responsavel } : {}),
    ...(status.success ? { status: status.data } : {}),
    ...(pagina && pagina > 1 ? { pagina } : {}),
  }
}
