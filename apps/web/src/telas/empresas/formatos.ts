import { formatarCnpj, formatarCpf } from '@leadtogo/shared'

const MS_POR_DIA = 86_400_000

/** Quantos dias inteiros se passaram desde a data (nulo se nunca aconteceu). */
export function diasDesde(iso: string | null, agora: Date = new Date()): number | null {
  if (!iso) return null
  const dias = Math.floor((agora.getTime() - new Date(iso).getTime()) / MS_POR_DIA)
  return Math.max(0, dias)
}

/** "Hoje", "há 1 dia", "há 40 dias" ou "Nunca". */
export function tempoRelativo(dias: number | null): string {
  if (dias === null) return 'Nunca'
  if (dias === 0) return 'Hoje'
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

/** 05/10/2026 */
export function dataCurta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

/** 05/10/2026 14:30 */
export function dataEHora(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** CNPJ ou CPF com máscara; "Sem documento" quando não há. */
export function documentoFormatado(
  tipo: 'cnpj' | 'cpf' | 'nenhum',
  documento: string | null,
): string {
  if (!documento || tipo === 'nenhum') return 'Sem documento'
  return tipo === 'cpf' ? formatarCpf(documento) : formatarCnpj(documento)
}

/** "1 empresa" / "12 empresas" */
export const contagemDeEmpresas = (n: number): string => `${n} ${n === 1 ? 'empresa' : 'empresas'}`

/** Link do Google Maps com a rota até o endereço. */
export const linkDeRota = (endereco: string): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}`
