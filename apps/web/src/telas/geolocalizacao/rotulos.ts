import type { PosicaoDaEmpresa, ResultadoGeoEmpresa } from '@leadtogo/shared'

import type { TomDoBadge } from '@/components/ui/exibicao'

export const ROTULO_DO_ESTADO: Record<PosicaoDaEmpresa['estado'], string> = {
  exata: 'Posição exata',
  aproximada: 'Posição aproximada',
  sem_coordenada: 'Sem coordenada',
  a_confirmar: 'Endereço a confirmar',
}

export const TOM_DO_ESTADO: Record<PosicaoDaEmpresa['estado'], TomDoBadge> = {
  exata: 'success',
  aproximada: 'warning',
  sem_coordenada: 'neutral',
  a_confirmar: 'danger',
}

const ORIGEM: Record<NonNullable<PosicaoDaEmpresa['origem']>, string> = {
  cnefe: 'Censo 2022 do IBGE (CNEFE)',
  nominatim: 'OpenStreetMap',
  cep: 'CEP ou cidade',
  manual: 'Ajustada à mão',
  checkin: 'Check-in da visita',
}

const APROXIMACAO: Record<NonNullable<PosicaoDaEmpresa['aproximacao']>, string> = {
  interpolada: 'entre dois números da rua',
  rua: 'na rua, sem o número',
  cep_cidade: 'só pelo CEP ou pela cidade',
}

export const rotuloDaOrigem = (o: PosicaoDaEmpresa['origem']): string => (o ? ORIGEM[o] : '')

/** "entre dois números da rua", "na rua, sem o número"...: por que a posição é aproximada. */
export const rotuloDaAproximacao = (a: PosicaoDaEmpresa['aproximacao']): string =>
  a ? APROXIMACAO[a] : ''

export const ROTULO_DA_FALTA: Record<PosicaoDaEmpresa['faltas'][number], string> = {
  logradouro: 'a rua',
  numero: 'o número',
  bairro: 'o bairro',
  cidade: 'a cidade',
}

/** "falta a rua e o número" a partir da lista de faltas. */
export function textoDasFaltas(faltas: PosicaoDaEmpresa['faltas']): string {
  const partes = faltas.map((f) => ROTULO_DA_FALTA[f])
  if (partes.length === 0) return ''
  if (partes.length === 1) return `Falta ${partes[0]}.`
  return `Faltam ${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}.`
}

export const ROTULO_DO_RESULTADO: Record<ResultadoGeoEmpresa, string> = {
  pendente: 'Pendente',
  exata: 'Posição exata',
  aproximada: 'Posição aproximada',
  a_confirmar: 'Endereço a confirmar',
  ja_tinha: 'Já tinha (ou ajustada à mão)',
  falhou: 'Não deu (serviço fora do ar)',
}

/** "850 m" ou "1,2 km". */
export function distanciaCurta(m: number): string {
  return m >= 1000
    ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
    : `${m} m`
}
