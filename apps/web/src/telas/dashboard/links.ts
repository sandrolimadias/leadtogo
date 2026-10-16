import type { Dashboard } from '@leadtogo/api-client'

// Para onde cada clique do Dashboard leva: a lista de destino, já filtrada. Funções puras, testadas à parte.
// As datas (AAAA-MM-DD) são as do fuso da empresa, as mesmas dos números do Dashboard.

type Periodo = Pick<Dashboard['periodo'], 'inicio' | 'fim'>

/** Fase do funil → Oportunidades daquele funil, na fase (as ativas). */
export const linkDaFase = (funilId: string, faseId: string) =>
  ({
    to: '/oportunidades',
    search: { visao: 'lista', funil: funilId, fase: faseId, status: 'ativo' },
  }) as const

/** Status da carteira → Empresas com o status (só as da carteira do usuário). */
export const linkDoStatus = (tagId: string, membroId: string) =>
  ({ to: '/empresas', search: { status: tagId, vendedor: membroId } }) as const

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

/** "Ver as N" sem contato → Empresas da carteira do usuário sem contato há N dias. */
export const linkSemContato = (dias: number, membroId: string) =>
  ({ to: '/empresas', search: { semContato: dias, vendedor: membroId } }) as const

/** O dia anterior a AAAA-MM-DD (o último dia de um mês a partir do primeiro do seguinte). */
export function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
