import {
  type EntradaDaLegenda,
  type FiltrosDoMapa,
  type OpcoesDoMapa,
  tokenDaCorDoMapa,
} from '@leadtogo/shared'

/** Os filtros da tela (o que o usuário escolheu), antes de virarem a consulta da API. */
export interface FiltrosDaTela {
  busca: string
  /** Chips de Status ligados */
  statusTagIds: string[]
  visitada: '' | 'alguma_vez' | '90_dias' | 'periodo' | 'nunca'
  visitaDe: string
  visitaAte: string
  vendedorId: string
  municipioCodigo: string
  regiaoId: string
  precisao: '' | 'exata' | 'aproximada'
  lotes: string[]
}

/** Ao abrir: os chips que a tag diz "visível ao abrir" (Prospect, por padrão, só liga quem quiser). */
export function filtrosIniciais(o: OpcoesDoMapa): FiltrosDaTela {
  return {
    busca: '',
    statusTagIds: o.chips.filter((c) => c.ligadoAoAbrir).map((c) => c.tagId),
    visitada: '',
    visitaDe: '',
    visitaAte: '',
    vendedorId: '',
    municipioCodigo: '',
    regiaoId: '',
    precisao: '',
    lotes: [],
  }
}

/** Os filtros da tela como filtros da API (sem a área visível). */
export function filtrosDaApi(f: FiltrosDaTela): Omit<FiltrosDoMapa, 'busca'> & { busca?: string } {
  return {
    ...(f.busca.trim() ? { busca: f.busca.trim() } : {}),
    statusTagIds: f.statusTagIds,
    ...(f.visitada ? { visitada: f.visitada } : {}),
    ...(f.visitada === 'periodo' && f.visitaDe ? { visitaDe: f.visitaDe } : {}),
    ...(f.visitada === 'periodo' && f.visitaAte ? { visitaAte: f.visitaAte } : {}),
    ...(f.vendedorId ? { vendedorId: f.vendedorId } : {}),
    ...(f.municipioCodigo ? { municipioCodigo: Number(f.municipioCodigo) } : {}),
    ...(f.regiaoId ? { regiaoId: f.regiaoId } : {}),
    ...(f.precisao ? { precisao: f.precisao } : {}),
    lotes: f.lotes,
  }
}

/** Quantos filtros além dos chips estão ligados (o botão "Filtros" mostra o número). */
export function filtrosAtivos(f: FiltrosDaTela): number {
  return [
    f.visitada !== '',
    f.vendedorId !== '',
    f.municipioCodigo !== '',
    f.regiaoId !== '',
    f.precisao !== '',
  ].filter(Boolean).length
}

/** O token da cor (`--tag-green-fg`) do estado de um pin, pela legenda. */
export function tokenDoEstado(legenda: EntradaDaLegenda[], estado: string): string {
  const e = legenda.find((x) => x.chave === estado)
  return tokenDaCorDoMapa(e?.cor ?? 'cinza')
}
