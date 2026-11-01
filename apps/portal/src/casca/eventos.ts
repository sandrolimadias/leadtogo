import type { EventoDoPortal } from '@leadtogo/api-client'

/** O que o cliente lê do estado dele no evento ("Você vai", "Confirme presença", "Lotado · lista de espera"). */
export function resumoDoEvento(e: EventoDoPortal): string {
  if (e.cancelado) return 'Cancelado'
  if (e.presente) return 'Você esteve lá'
  if (e.minhaSituacao === 'confirmado') return 'Você vai'
  if (e.minhaSituacao === 'lista_espera') return 'Na lista de espera'
  if (e.minhaSituacao === 'cancelado' && !e.podeConfirmar) return 'Presença cancelada'
  if (e.motivoDoBloqueio === 'prazo_encerrado') return 'Prazo encerrado'
  if (e.motivoDoBloqueio === 'evento_encerrado') return 'Encerrado'
  if (e.lotado) return 'Lotado · lista de espera'
  if (e.vagasDaEmpresa.limite !== null && e.vagasDaEmpresa.confirmados >= e.vagasDaEmpresa.limite) {
    return 'Vagas da sua empresa esgotadas · lista de espera'
  }
  return 'Confirme presença'
}
