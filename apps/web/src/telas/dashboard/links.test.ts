import { describe, expect, it } from 'vitest'

import {
  diaAnterior,
  linkDaFase,
  linkDeConquistadas,
  linkDePerdas,
  linkDoMes,
  linkDoMotivo,
  linkDoStatus,
  linkSemContato,
} from './links'

const periodo = { inicio: '2026-10-01', fim: '2026-10-31' }

describe('para onde cada clique do Dashboard leva', () => {
  it('fase do funil → Oportunidades daquele funil, na fase (as ativas)', () => {
    expect(linkDaFase('f1', 'p1')).toEqual({
      to: '/oportunidades',
      search: { visao: 'lista', funil: 'f1', fase: 'p1', status: 'ativo' },
    })
  })

  it('status da carteira → Empresas com o status, só as do usuário', () => {
    expect(linkDoStatus('t1', 'm1')).toEqual({
      to: '/empresas',
      search: { status: 't1', vendedor: 'm1' },
    })
  })

  it('motivo de perda → perdidas e canceladas com o motivo, no período', () => {
    expect(linkDoMotivo('mo1', periodo)).toEqual({
      to: '/oportunidades',
      search: {
        visao: 'lista',
        grupo: 'perdas',
        motivo: 'mo1',
        de: '2026-10-01',
        ate: '2026-10-31',
      },
    })
  })

  it('mês do MRR → conquistadas daquele mês (o último dia vem do mês seguinte)', () => {
    expect(linkDoMes({ inicio: '2026-09-01', fimExclusivo: '2026-10-01' })).toEqual({
      to: '/oportunidades',
      search: { visao: 'lista', status: 'conquistado', de: '2026-09-01', ate: '2026-09-30' },
    })
    expect(diaAnterior('2027-01-01')).toBe('2026-12-31')
    expect(diaAnterior('2028-03-01')).toBe('2028-02-29')
  })

  it('conquistadas e perdidas e canceladas do período; sem contato com o prazo e o vendedor', () => {
    expect(linkDeConquistadas(periodo).search).toMatchObject({
      status: 'conquistado',
      de: '2026-10-01',
    })
    expect(linkDePerdas(periodo).search).toMatchObject({ grupo: 'perdas', ate: '2026-10-31' })
    expect(linkSemContato(60, 'm1')).toEqual({
      to: '/empresas',
      search: { semContato: 60, vendedor: 'm1' },
    })
  })
})
