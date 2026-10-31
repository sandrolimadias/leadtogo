import type { Oportunidade } from '@leadtogo/api-client'
import { ROTULO_DO_STATUS, type StatusDaOportunidade } from '@leadtogo/shared'

const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const realInteiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

/** R$ 1.234,50 (com centavos). */
export const reais = (n: number): string => real.format(n)

/** R$ 1.235: para somas de cabeçalho, sem centavos. */
export const reaisCurto = (n: number): string => realInteiro.format(n)

/** "2026-12-15" (data sem hora) → "15/12/2026", sem passar por fuso. */
export function diaDoBanco(dia: string | null): string {
  if (!dia) return '—'
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a}`
}

/** A data de hoje no aparelho, como AAAA-MM-DD (para comparar com a data prevista). */
export function hojeEmTexto(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`
}

/** O dia (AAAA-MM-DD, no fuso do aparelho) de um instante ISO, como os campos de data esperam. */
export const diaEmTexto = (iso: string): string => hojeEmTexto(new Date(iso))

/** A previsão em palavras, com o tom: vencida (vermelho), hoje (âmbar) ou normal; sem data = "Sem previsão". */
export function previsaoEmPalavras(
  o: Pick<Oportunidade, 'dataPrevistaFechamento' | 'status'>,
  hoje: string = hojeEmTexto(),
): { texto: string; tom: 'normal' | 'vencida' | 'hoje' | 'sem' } {
  if (!o.dataPrevistaFechamento) return { texto: 'Sem previsão', tom: 'sem' }
  const texto = `Previsão ${diaDoBanco(o.dataPrevistaFechamento)}`
  if (o.status !== 'ativo') return { texto, tom: 'normal' }
  if (o.dataPrevistaFechamento < hoje) return { texto: `${texto} (vencida)`, tom: 'vencida' }
  if (o.dataPrevistaFechamento === hoje) return { texto: `${texto} (hoje)`, tom: 'hoje' }
  return { texto, tom: 'normal' }
}

export const TOM_DO_STATUS: Record<
  StatusDaOportunidade,
  'accent' | 'success' | 'danger' | 'neutral' | 'warning'
> = {
  ativo: 'accent',
  conquistado: 'success',
  perdido: 'danger',
  cancelado: 'neutral',
  suspenso: 'warning',
}

export const rotuloDoStatus = (s: StatusDaOportunidade): string => ROTULO_DO_STATUS[s]

/** "Empresa – Solução": a sugestão do nome da oportunidade. */
export const sugestaoDeNome = (empresa: string, solucao: string | undefined): string =>
  solucao ? `${empresa} – ${solucao}` : ''
