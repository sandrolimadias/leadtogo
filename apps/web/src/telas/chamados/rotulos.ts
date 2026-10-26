import type { EventoDoChamado, PrazoDoChamado } from '@leadtogo/api-client'
import {
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_STATUS_DO_CHAMADO,
  type PrioridadeDoChamado,
  type StatusDoChamado,
} from '@leadtogo/shared'

import type { TomDoBadge } from '@leadtogo/ui/exibicao'

export const TOM_DO_STATUS: Record<StatusDoChamado, TomDoBadge> = {
  aguardando_triagem: 'warning',
  pendente: 'info',
  em_atendimento: 'accent',
  aguardando_cliente: 'neutral',
  resolvido: 'success',
  fechado: 'outline',
}

export const TOM_DA_PRIORIDADE: Record<PrioridadeDoChamado, TomDoBadge> = {
  baixa: 'outline',
  normal: 'neutral',
  alta: 'warning',
  urgente: 'danger',
}

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export const dataCurta = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** O prazo em uma palavra para o selo da lista: ausente sem meta (nada a alertar). */
export function selosDoPrazo(
  p: PrazoDoChamado | null,
  nome: 'Resposta' | 'Resolução',
): { texto: string; tom: TomDoBadge } | null {
  if (!p) return null
  if (p.cumpridoEm) {
    return p.atrasado
      ? { texto: `${nome} fora do prazo`, tom: 'danger' }
      : { texto: `${nome} no prazo`, tom: 'success' }
  }
  if (p.pausado) return { texto: `${nome} pausada`, tom: 'neutral' }
  if (p.atrasado) return { texto: `${nome} atrasada`, tom: 'danger' }
  if (p.venceEm) return { texto: `${nome} até ${dataCurta(p.venceEm)}`, tom: 'info' }
  return null
}

/** A frase da linha do tempo (sem nome de quem fez: ele vem à parte). */
export function descreverEvento(e: EventoDoChamado): string {
  const status = (s: StatusDoChamado | null) => (s ? ROTULO_DO_STATUS_DO_CHAMADO[s] : '')
  switch (e.tipo) {
    case 'aberto':
      return `abriu o chamado (${status(e.statusPara)})`
    case 'triado':
      return `fez a triagem: área ${e.areaPara ?? '—'}${e.responsavelPara ? `, responsável ${e.responsavelPara}` : ''}`
    case 'atribuido':
      return e.responsavelPara
        ? `atribuiu o chamado a ${e.responsavelPara}`
        : 'tirou o responsável do chamado'
    case 'assumido':
      return 'assumiu o chamado'
    case 'status_alterado':
      return `mudou o estado para ${status(e.statusPara)}`
    case 'prioridade_alterada':
      return `mudou a prioridade para ${e.prioridadePara ? ROTULO_DA_PRIORIDADE[e.prioridadePara] : '—'}`
    case 'area_alterada':
      return `passou o chamado para a área ${e.areaPara ?? '—'}`
    case 'primeira_resposta':
      return 'deu a primeira resposta'
    case 'mensagem':
      return 'escreveu na conversa'
    case 'nota_interna':
      return 'fez uma nota interna'
    case 'anexo':
      return 'anexou um arquivo'
    case 'resolvido':
      return 'resolveu o chamado'
    case 'reaberto':
      return 'reabriu o chamado'
    case 'fechado':
      return 'fechou o chamado'
  }
}

export const tamanhoLegivel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
