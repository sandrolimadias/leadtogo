// Horário de silêncio do cliente (America/Sao_Paulo): o push dos avisos normais espera o fim dele.

const FORMATO = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Sao_Paulo',
})

const minutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** Minutos desde a meia-noite, em Brasília */
export function minutoDoDiaEmBrasilia(agora: Date): number {
  const partes = FORMATO.formatToParts(agora)
  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/**
 * Quando o push de um aviso NORMAL pode sair: agora, se a pessoa não está no horário de silêncio; senão, no fim
 * dele. O intervalo pode virar a noite (22:00 a 07:00). Aceita `HH:MM` ou `HH:MM:SS` (como o Postgres devolve).
 */
export function quandoPodeSair(agora: Date, inicio: string | null, fim: string | null): Date {
  if (!inicio || !fim) return agora
  const i = minutos(inicio)
  const f = minutos(fim)
  if (i === f) return agora
  const atual = minutoDoDiaEmBrasilia(agora)
  const noSilencio = i < f ? atual >= i && atual < f : atual >= i || atual < f
  if (!noSilencio) return agora
  const faltam = (f - atual + 1440) % 1440
  const arredondado = agora.getTime() - (agora.getTime() % 60_000)
  return new Date(arredondado + faltam * 60_000)
}
