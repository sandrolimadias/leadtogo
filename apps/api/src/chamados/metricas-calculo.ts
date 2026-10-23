import {
  calcularPrazo,
  type CalendarioUtil,
  type IndicadoresDeChamados,
  minutosConsumidos,
  type MudancaDeEstado,
  type StatusDoChamado,
} from '@leadtogo/shared'

/** O que cada chamado entrega às métricas (calculado uma vez, agregado por área e por responsável). */
export interface Medida {
  areaId: string | null
  areaNome: string | null
  responsavelId: string | null
  responsavelNome: string | null
  status: StatusDoChamado
  aberto: boolean
  /** Dias corridos desde a abertura (só dos abertos) */
  diasEmAberto: number | null
  /** Minutos úteis até a primeira resposta da equipe */
  respostaMin: number | null
  /** Minutos úteis até a resolução (sem a pausa de Aguardando cliente) */
  resolucaoMin: number | null
  /** Dentro da meta de resposta; nulo sem meta ou enquanto ainda corre dentro do prazo */
  respostaNoPrazo: boolean | null
  resolucaoNoPrazo: boolean | null
}

export interface LinhaParaMedir {
  status: StatusDoChamado
  area_id: string | null
  area_nome: string | null
  meta_resposta_min: number | null
  meta_resolucao_min: number | null
  responsavel_id: string | null
  responsavel_nome: string | null
  criado_em: string | Date
  primeira_resposta_em: string | Date | null
  resolvido_em: string | Date | null
}

const encerrado = (s: StatusDoChamado) => s === 'resolvido' || s === 'fechado'
const data = (v: string | Date | null) => (v === null ? null : new Date(v))

export function medir(
  l: LinhaParaMedir,
  mudancas: readonly MudancaDeEstado[],
  calendario: CalendarioUtil,
  agora: Date,
): Medida {
  const respondeuEm = data(l.primeira_resposta_em)
  const resolvidoEm = encerrado(l.status) ? data(l.resolvido_em) : null
  const noPrazo = (metaMin: number | null, cumpridoEm: Date | null): boolean | null => {
    const r = calcularPrazo({
      metaMin,
      mudancas,
      statusAtual: l.status,
      cumpridoEm,
      agora,
      calendario,
    })
    if (!r) return null
    // Cumprido: vale o consumo até lá. Em andamento: só conta quando já estourou (dentro do prazo ainda não é resultado)
    if (cumpridoEm) return r.consumidoMin <= r.metaMin
    return r.atrasado ? false : null
  }
  return {
    areaId: l.area_id,
    areaNome: l.area_nome,
    responsavelId: l.responsavel_id,
    responsavelNome: l.responsavel_nome,
    status: l.status,
    aberto: !encerrado(l.status),
    diasEmAberto: encerrado(l.status)
      ? null
      : (agora.getTime() - new Date(l.criado_em).getTime()) / 86_400_000,
    respostaMin: respondeuEm ? minutosConsumidos({ mudancas, ate: respondeuEm, calendario }) : null,
    resolucaoMin: resolvidoEm
      ? minutosConsumidos({ mudancas, ate: resolvidoEm, calendario })
      : null,
    respostaNoPrazo: noPrazo(l.meta_resposta_min, respondeuEm),
    resolucaoNoPrazo: noPrazo(l.meta_resolucao_min, resolvidoEm),
  }
}

const media = (valores: (number | null)[], casas = 1): number | null => {
  const v = valores.filter((x): x is number => x !== null)
  if (v.length === 0) return null
  const m = v.reduce((a, b) => a + b, 0) / v.length
  return Math.round(m * 10 ** casas) / 10 ** casas
}

const percentual = (valores: (boolean | null)[]): number | null => {
  const v = valores.filter((x): x is boolean => x !== null)
  if (v.length === 0) return null
  return Math.round((v.filter(Boolean).length / v.length) * 1000) / 10
}

export function agregar(medidas: readonly Medida[]): IndicadoresDeChamados {
  return {
    total: medidas.length,
    abertos: medidas.filter((m) => m.aberto).length,
    resolvidos: medidas.filter((m) => !m.aberto).length,
    tempoPrimeiraRespostaMin: media(medidas.map((m) => m.respostaMin)),
    tempoResolucaoMin: media(medidas.map((m) => m.resolucaoMin)),
    diasEmAberto: media(medidas.map((m) => m.diasEmAberto)),
    respostaNoPrazoPct: percentual(medidas.map((m) => m.respostaNoPrazo)),
    resolucaoNoPrazoPct: percentual(medidas.map((m) => m.resolucaoNoPrazo)),
  }
}
