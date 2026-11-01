import type { ResultadosDoDashboard } from '@leadtogo/api-client'

// Para onde cada clique do Dashboard leva: a lista de destino, já filtrada. Funções puras, testadas à parte.
// As datas (AAAA-MM-DD) são as do fuso da empresa, as mesmas dos números do Dashboard.

type Periodo = Pick<ResultadosDoDashboard['periodo'], 'inicio' | 'fim'>

/** Fase do funil → Oportunidades daquele funil, na fase (as ativas). */
export const linkDaFase = (funilId: string, faseId: string) =>
  ({
    to: '/oportunidades',
    search: { visao: 'lista', funil: funilId, fase: faseId, status: 'ativo' },
  }) as const

/**
 * Associados (Status Cliente) → Empresas com o status; com `cidade`, só as daquela cidade; na visão "Minha",
 * só as da carteira do usuário (`vendedor`).
 */
export const linkDeEmpresas = (filtro: {
  status?: string | undefined
  cidade?: number | undefined
  vendedor?: string | undefined
}) =>
  ({
    to: '/empresas',
    search: {
      ...(filtro.status ? { status: filtro.status } : {}),
      ...(filtro.cidade ? { cidade: filtro.cidade } : {}),
      ...(filtro.vendedor ? { vendedor: filtro.vendedor } : {}),
    },
  }) as const

/** Motivo de perda → Oportunidades perdidas e canceladas com o motivo, no período. */
export const linkDoMotivo = (motivoId: string, p: Periodo) =>
  ({
    to: '/oportunidades',
    search: { visao: 'lista', grupo: 'perdas', motivo: motivoId, de: p.inicio, ate: p.fim },
  }) as const

/** Mês do gráfico de MRR → Oportunidades conquistadas naquele mês. */
export const linkDoMes = (mes: { inicio: string; fimExclusivo: string }) =>
  ({
    to: '/oportunidades',
    search: {
      visao: 'lista',
      status: 'conquistado',
      de: mes.inicio,
      ate: diaAnterior(mes.fimExclusivo),
    },
  }) as const

/** "Conquistadas" do período → a lista de conquistadas. */
export const linkDeConquistadas = (p: Periodo) =>
  ({
    to: '/oportunidades',
    search: { visao: 'lista', status: 'conquistado', de: p.inicio, ate: p.fim },
  }) as const

/** "Perdidas e canceladas" do período → a lista dessas oportunidades. */
export const linkDePerdas = (p: Periodo) =>
  ({
    to: '/oportunidades',
    search: { visao: 'lista', grupo: 'perdas', de: p.inicio, ate: p.fim },
  }) as const

/** O dia anterior a AAAA-MM-DD (o último dia de um mês a partir do primeiro do seguinte). */
export function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
