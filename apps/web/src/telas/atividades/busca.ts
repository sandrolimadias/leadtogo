import type { AbaDeAtividades, ConsultaDeAtividadesEntrada } from '@leadtogo/shared'
import { ABAS_DE_ATIVIDADES } from '@leadtogo/shared'

/** O que fica na URL da lista de Atividades (só o que não é o padrão). */
export interface BuscaDeAtividades {
  aba?: AbaDeAtividades
  /** Id do tipo de atividade */
  tipo?: string
  /** Só as minhas */
  minhas?: boolean
  pagina?: number
}

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
const inteiro = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** `validateSearch` da rota: devolve só valores válidos. */
export function lerBusca(entrada: Record<string, unknown>): BuscaDeAtividades {
  const aba = ABAS_DE_ATIVIDADES.find((a) => a === entrada['aba'])
  const tipo = texto(entrada['tipo'])
  const pagina = inteiro(entrada['pagina'])
  const minhas = entrada['minhas'] === true || entrada['minhas'] === 'true'
  return {
    ...(aba && aba !== 'agendadas' ? { aba } : {}),
    ...(tipo ? { tipo } : {}),
    ...(minhas ? { minhas: true } : {}),
    ...(pagina && pagina > 1 ? { pagina } : {}),
  }
}

/** A aba aberta (Agendadas, se a URL não diz). */
export const abaDaBusca = (b: BuscaDeAtividades): AbaDeAtividades => b.aba ?? 'agendadas'

/** O que o servidor recebe. */
export function consultaDeAtividades(
  b: BuscaDeAtividades,
  texto: string,
  porPagina = 25,
): ConsultaDeAtividadesEntrada {
  return {
    aba: abaDaBusca(b),
    ...(texto ? { busca: texto } : {}),
    ...(b.tipo ? { tipoAtividadeId: b.tipo } : {}),
    ...(b.minhas ? { minhas: 'true' as const } : {}),
    pagina: b.pagina ?? 1,
    porPagina,
  }
}

/** Há filtro (além da aba)? */
export const temFiltro = (b: BuscaDeAtividades, texto: string): boolean =>
  Boolean(b.tipo ?? b.minhas ?? (texto || undefined))
