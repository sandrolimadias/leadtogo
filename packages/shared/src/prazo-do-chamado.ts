import type { StatusDoChamado } from './chamados.js'
import {
  adicionarMinutosUteis,
  type CalendarioUtil,
  minutosUteisEntre,
  temExpediente,
} from './chamados-prazo.js'

// Prazo de um chamado (meta de resposta ou de resolução) em horas úteis. O relógio corre só enquanto o
// chamado está "ativo" (aguardando triagem, pendente ou em atendimento): Aguardando cliente pausa, e
// Resolvido/Fechado param. Tudo sai da linha do tempo (`chamado_eventos`), a base única das métricas.

/** Uma mudança de estado do chamado (o evento de abertura conta: o estado inicial). */
export interface MudancaDeEstado {
  em: Date
  statusPara: StatusDoChamado
}

const ATIVOS: readonly StatusDoChamado[] = ['aguardando_triagem', 'pendente', 'em_atendimento']
export const relogioCorre = (s: StatusDoChamado): boolean => ATIVOS.includes(s)

export interface Intervalo {
  de: Date
  /** Nulo = ainda aberto (corre até agora) */
  ate: Date | null
}

/** Os trechos em que o relógio correu. */
export function intervalosAtivos(mudancas: readonly MudancaDeEstado[]): Intervalo[] {
  const ordenadas = [...mudancas].sort((a, b) => a.em.getTime() - b.em.getTime())
  const saida: Intervalo[] = []
  let inicio: Date | null = null
  for (const m of ordenadas) {
    if (relogioCorre(m.statusPara)) {
      inicio ??= m.em
    } else if (inicio) {
      saida.push({ de: inicio, ate: m.em })
      inicio = null
    }
  }
  if (inicio) saida.push({ de: inicio, ate: null })
  return saida
}

export interface ResultadoDoPrazo {
  metaMin: number
  consumidoMin: number
  venceEm: Date | null
  atrasado: boolean
  cumpridoEm: Date | null
  pausado: boolean
}

/**
 * Calcula o prazo. `cumpridoEm`: a primeira resposta (meta de resposta) ou a resolução (meta de resolução);
 * o relógio para aí. Meta nula = sem meta e sem alerta (devolve nulo). Sem expediente configurado não há
 * como contar horas úteis: devolve o prazo sem vencimento e sem atraso.
 */
export function calcularPrazo(p: {
  metaMin: number | null
  mudancas: readonly MudancaDeEstado[]
  statusAtual: StatusDoChamado
  cumpridoEm: Date | null
  agora: Date
  calendario: CalendarioUtil
}): ResultadoDoPrazo | null {
  if (p.metaMin === null) return null
  const fim = p.cumpridoEm ?? p.agora
  const intervalos = intervalosAtivos(p.mudancas)
    .map((i) => ({ de: i.de, ate: new Date(Math.min((i.ate ?? fim).getTime(), fim.getTime())) }))
    .filter((i) => i.ate.getTime() > i.de.getTime())
  const consumidoMin = intervalos.reduce(
    (soma, i) => soma + minutosUteisEntre(i.de, i.ate, p.calendario),
    0,
  )
  const pausado = p.cumpridoEm === null && p.statusAtual === 'aguardando_cliente'
  const base = {
    metaMin: p.metaMin,
    consumidoMin: Math.round(consumidoMin * 100) / 100,
    cumpridoEm: p.cumpridoEm,
    pausado,
  }
  if (!temExpediente(p.calendario)) return { ...base, venceEm: null, atrasado: false }

  // Quando o consumo chega à meta: percorre os trechos fechados e, no aberto, olha adiante
  let restante = p.metaMin
  let venceEm: Date | null = null
  const todos = intervalosAtivos(p.mudancas)
  for (const i of todos) {
    if (i.ate === null) {
      venceEm = adicionarMinutosUteis(i.de, restante, p.calendario)
      break
    }
    const m = minutosUteisEntre(i.de, i.ate, p.calendario)
    if (restante <= m) {
      venceEm = adicionarMinutosUteis(i.de, restante, p.calendario)
      break
    }
    restante -= m
  }
  const atrasado = p.cumpridoEm
    ? consumidoMin > p.metaMin
    : venceEm !== null
      ? p.agora.getTime() > venceEm.getTime() && !pausado
      : consumidoMin > p.metaMin
  return { ...base, venceEm: pausado ? null : venceEm, atrasado }
}

/**
 * Minutos úteis em que o relógio correu até `ate` (a resposta, a resolução ou agora), pela linha do tempo.
 * É o "tempo até a primeira resposta" e o "tempo de resolução" das métricas, com ou sem meta.
 */
export function minutosConsumidos(p: {
  mudancas: readonly MudancaDeEstado[]
  ate: Date
  calendario: CalendarioUtil
}): number {
  const intervalos = intervalosAtivos(p.mudancas)
    .map((i) => ({
      de: i.de,
      ate: new Date(Math.min((i.ate ?? p.ate).getTime(), p.ate.getTime())),
    }))
    .filter((i) => i.ate.getTime() > i.de.getTime())
  return intervalos.reduce((soma, i) => soma + minutosUteisEntre(i.de, i.ate, p.calendario), 0)
}
