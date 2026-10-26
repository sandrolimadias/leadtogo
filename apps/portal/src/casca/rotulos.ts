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
