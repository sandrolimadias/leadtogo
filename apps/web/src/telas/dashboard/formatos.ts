/** "+18% sobre o período anterior" (ou "sem base no período anterior"). */
export function variacao(v: number | null): string {
  if (v === null) return 'sem base no período anterior'
  return `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR')}% sobre o período anterior`
}
