/** Minutos úteis em "3 h 20 min" (ou "45 min"); nulo = sem dado. */
export function duracaoUtil(min: number | null): string {
  if (min === null) return '—'
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}
