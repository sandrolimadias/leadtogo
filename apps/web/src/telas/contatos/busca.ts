import type { ConsultaDeContatosEntrada } from '@leadtogo/shared'

/** O que fica na URL da lista de contatos (compartilhável e sobrevive a recarregar). Só o que não é o padrão. */
export interface BuscaDeContatos {
  busca?: string
  /** Id da empresa */
  empresa?: string
  cargo?: string
  /** Id do papel na decisão */
  papel?: string
  /** Id da tag da empresa */
  tag?: string
  /** Id da tag do contato */
  tagContato?: string
  pagina?: number
}

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
const inteiro = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** `validateSearch` da rota: aceita qualquer coisa que venha da URL e devolve só valores válidos. */
export function lerBusca(entrada: Record<string, unknown>): BuscaDeContatos {
  const busca = texto(entrada['busca'])
  const empresa = texto(entrada['empresa'])
  const cargo = texto(entrada['cargo'])
  const papel = texto(entrada['papel'])
  const tag = texto(entrada['tag'])
  const tagContato = texto(entrada['tagContato'])
  const pagina = inteiro(entrada['pagina'])
  return {
    ...(busca ? { busca } : {}),
    ...(empresa ? { empresa } : {}),
    ...(cargo ? { cargo } : {}),
    ...(papel ? { papel } : {}),
    ...(tag ? { tag } : {}),
    ...(tagContato ? { tagContato } : {}),
    ...(pagina && pagina > 1 ? { pagina } : {}),
  }
}

/** Há algum filtro ou busca ativo? */
export const temFiltroAtivo = (b: BuscaDeContatos): boolean =>
  Boolean(b.busca ?? b.empresa ?? b.cargo ?? b.papel ?? b.tag ?? b.tagContato)

/** Só os filtros (sem a busca): o número do botão "Filtros". */
export const quantosFiltros = (b: BuscaDeContatos): number =>
  [b.empresa, b.cargo, b.papel, b.tag, b.tagContato].filter(Boolean).length

/** O que o servidor recebe. */
export function consultaDeContatos(b: BuscaDeContatos, porPagina = 25): ConsultaDeContatosEntrada {
  return {
    ...(b.busca ? { busca: b.busca } : {}),
    ...(b.empresa ? { empresaId: b.empresa } : {}),
    ...(b.cargo ? { cargo: b.cargo } : {}),
    ...(b.papel ? { papelDecisaoId: b.papel } : {}),
    ...(b.tag ? { tagId: b.tag } : {}),
    ...(b.tagContato ? { tagContatoId: b.tagContato } : {}),
    pagina: b.pagina ?? 1,
    porPagina,
  }
}
