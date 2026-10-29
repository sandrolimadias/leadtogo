import type { ChipDaLista, ConsultaDaListaEntrada, RegimeTributario } from '@leadtogo/shared'
import { CHIPS_DA_LISTA, regimeTributarioSchema } from '@leadtogo/shared'

/** Chips que a tela mostra (o "Sem visita há 90 dias" saiu da tela; a API ainda o aceita). */
export const CHIPS_DA_TELA = CHIPS_DA_LISTA.filter((c) => c !== 'sem_visita_90')

/** Portes da Receita, na ordem do filtro */
export const PORTES_DO_FILTRO = [1, 3, 5, 0] as const

/** O que fica na URL da lista (compartilhável e sobrevive a recarregar). Só o que não é o padrão. */
export interface BuscaDaLista {
  busca?: string
  chip?: ChipDaLista
  incluirLeads?: boolean
  /** Id da tag do grupo Status */
  status?: string
  /** Id da tag do grupo Visitação */
  visitacao?: string
  /** Id do membro (vendedor) */
  vendedor?: string
  /** Código IBGE da cidade */
  cidade?: number
  /** Código do porte da Receita (0 = não informado) */
  porte?: number
  regime?: RegimeTributario
  /** Sem contato há N dias, quem nunca teve contato incluído (o botão "Ver as N" do Dashboard) */
  semContato?: number
  pagina?: number
}

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
const inteiro = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** `validateSearch` da rota: aceita qualquer coisa que venha da URL e devolve só valores válidos. */
export function lerBusca(entrada: Record<string, unknown>): BuscaDaLista {
  const chip = CHIPS_DA_TELA.find((c) => c === entrada['chip'])
  const porte = PORTES_DO_FILTRO.find((p) => String(p) === String(entrada['porte']))
  const regime = regimeTributarioSchema.safeParse(entrada['regime']).data
  const pagina = inteiro(entrada['pagina'])
  const busca = texto(entrada['busca'])
  const status = texto(entrada['status'])
  const visitacao = texto(entrada['visitacao'])
  const vendedor = texto(entrada['vendedor'])
  const cidade = inteiro(entrada['cidade'])
  const semContato = inteiro(entrada['semContato'])
  return {
    ...(busca ? { busca } : {}),
    ...(chip && chip !== 'todas' ? { chip } : {}),
    ...(entrada['incluirLeads'] === true || entrada['incluirLeads'] === 'true'
      ? { incluirLeads: true }
      : {}),
    ...(status ? { status } : {}),
    ...(visitacao ? { visitacao } : {}),
    ...(vendedor ? { vendedor } : {}),
    ...(cidade ? { cidade } : {}),
    ...(porte !== undefined ? { porte } : {}),
    ...(regime ? { regime } : {}),
    ...(semContato ? { semContato } : {}),
    ...(pagina && pagina > 1 ? { pagina } : {}),
  }
}

/** Há algum filtro da barra ativo (o chip não conta: ele tem o próprio estado)? */
export const temFiltroAtivo = (b: BuscaDaLista): boolean =>
  [b.busca, b.status, b.visitacao, b.vendedor, b.cidade, b.porte, b.regime, b.semContato].some(
    (v) => v !== undefined,
  )

/** O que o servidor recebe. */
export function consultaDaLista(b: BuscaDaLista, porPagina = 25): ConsultaDaListaEntrada {
  const tags = [b.status, b.visitacao].filter(Boolean).join(',')
  return {
    ...(b.busca ? { busca: b.busca } : {}),
    chip: b.chip ?? 'todas',
    incluirLeads: b.incluirLeads ? 'true' : 'false',
    ...(tags ? { tags } : {}),
    ...(b.vendedor ? { vendedorId: b.vendedor } : {}),
    ...(b.cidade ? { municipio: b.cidade } : {}),
    ...(b.porte !== undefined ? { porte: b.porte } : {}),
    ...(b.regime ? { regimeTributario: b.regime } : {}),
    ...(b.semContato ? { semContato: b.semContato } : {}),
    pagina: b.pagina ?? 1,
    porPagina,
  }
}
