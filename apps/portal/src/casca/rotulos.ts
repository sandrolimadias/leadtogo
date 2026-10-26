import type { EstadoDoChamadoNoPortal } from '@leadtogo/shared'

/** Tom do selo do estado do chamado, do ponto de vista do cliente. */
export const TOM_DO_ESTADO: Record<
  EstadoDoChamadoNoPortal,
  'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
> = {
  aberto: 'info',
  em_atendimento: 'accent',
  aguardando_voce: 'warning',
  resolvido: 'success',
  fechado: 'neutral',
}

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})
const FORMATO_HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

export const dataCurta = (iso: string): string => FORMATO_DATA.format(new Date(iso))
export const dataEHora = (iso: string): string =>
  `${FORMATO_DATA.format(new Date(iso))} às ${FORMATO_HORA.format(new Date(iso))}`

/** "agora", "há 5 min", "há 3 h", "ontem" ou a data. */
export function tempoRelativo(iso: string, agora = new Date()): string {
  const minutos = Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  return dataCurta(iso)
}

export function saudacao(agora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }).format(agora),
  )
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

const FORMATO_MES = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  timeZone: 'America/Sao_Paulo',
})
const FORMATO_DIA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const FORMATO_DIA_LONGO = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  timeZone: 'America/Sao_Paulo',
})

/** O selo do calendário: "NOV" e "12". */
export const diaEMes = (iso: string): { mes: string; dia: string } => ({
  mes: FORMATO_MES.format(new Date(iso)).replace('.', '').toUpperCase(),
  dia: FORMATO_DIA.format(new Date(iso)),
})

/** "quinta-feira, 12 de novembro" */
export const diaPorExtenso = (iso: string): string => FORMATO_DIA_LONGO.format(new Date(iso))

/** "18:30 às 22:00" (ou "18:30 às 22:00 de 13/11" se termina em outro dia) */
export function periodoDoEvento(inicio: string, fim: string): string {
  const h = (d: string) => FORMATO_HORA.format(new Date(d))
  const mesmoDia = FORMATO_DIA.format(new Date(inicio)) === FORMATO_DIA.format(new Date(fim))
  return mesmoDia
    ? `${h(inicio)} às ${h(fim)}`
    : `${h(inicio)} às ${h(fim)} de ${dataCurta(fim).slice(0, 5)}`
}
