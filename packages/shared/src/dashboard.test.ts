import { describe, expect, it } from 'vitest'

import {
  instantesDoIntervalo,
  periodoDoDashboard,
  taxaDeConversao,
  ultimosMeses,
  variacaoPercentual,
} from './dashboard.js'

describe('período do Dashboard (calendário, no fuso da empresa)', () => {
  const quinze = new Date('2026-10-15T15:00:00Z') // 12h de Brasília

  it('mês atual, mês anterior e o anterior de cada um', () => {
    expect(periodoDoDashboard('mes', quinze)).toMatchObject({
      inicio: '2026-10-01',
      fim: '2026-10-31',
      fimExclusivo: '2026-11-01',
      rotulo: 'outubro de 2026',
      anterior: { inicio: '2026-09-01', fim: '2026-09-30', fimExclusivo: '2026-10-01' },
    })
    expect(periodoDoDashboard('mes_anterior', quinze)).toMatchObject({
      inicio: '2026-09-01',
      fim: '2026-09-30',
      anterior: { inicio: '2026-08-01', fim: '2026-08-31' },
    })
  })

  it('trimestre é o do calendário e o anterior é o trimestre anterior inteiro', () => {
    expect(periodoDoDashboard('trimestre', quinze)).toMatchObject({
      inicio: '2026-10-01',
      fim: '2026-12-31',
      fimExclusivo: '2027-01-01',
      rotulo: '4º trimestre de 2026',
      anterior: { inicio: '2026-07-01', fim: '2026-09-30' },
    })
    expect(periodoDoDashboard('trimestre', new Date('2026-02-10T12:00:00Z'))).toMatchObject({
      inicio: '2026-01-01',
      fim: '2026-03-31',
      rotulo: '1º trimestre de 2026',
      anterior: { inicio: '2025-10-01', fim: '2025-12-31' },
    })
    expect(periodoDoDashboard('trimestre', new Date('2026-05-20T12:00:00Z'))).toMatchObject({
      inicio: '2026-04-01',
      fim: '2026-06-30',
    })
  })

  it('vira o ano: janeiro olha dezembro; fevereiro bissexto tem 29 dias', () => {
    expect(periodoDoDashboard('mes', new Date('2027-01-10T12:00:00Z')).anterior).toMatchObject({
      inicio: '2026-12-01',
      fim: '2026-12-31',
    })
    expect(periodoDoDashboard('mes', new Date('2028-02-10T12:00:00Z'))).toMatchObject({
      inicio: '2028-02-01',
      fim: '2028-02-29',
    })
  })

  it('o mês vira no fuso da empresa, não em UTC: 22h do último dia e 00h30 do primeiro', () => {
    // 22h de 31/10 em Brasília = 01h de 01/11 em UTC: ainda é outubro para a empresa
    expect(periodoDoDashboard('mes', new Date('2026-11-01T01:00:00Z')).inicio).toBe('2026-10-01')
    // 00h30 de 01/11 em Brasília = 03h30 UTC: já é novembro
    expect(periodoDoDashboard('mes', new Date('2026-11-01T03:30:00Z')).inicio).toBe('2026-11-01')
  })

  it('os instantes do intervalo são a meia-noite de São Paulo (03h UTC)', () => {
    const p = periodoDoDashboard('mes', new Date('2026-10-15T15:00:00Z'))
    const { de, ate } = instantesDoIntervalo(p)
    expect(de.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(ate.toISOString()).toBe('2026-11-01T03:00:00.000Z')
  })
})

describe('série dos últimos 6 meses', () => {
  it('termina no mês do dia dado e cruza o ano', () => {
    const s = ultimosMeses('2026-02-14')
    expect(s.map((m) => m.mes)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
    expect(s[0]).toMatchObject({
      rotulo: 'set/25',
      inicio: '2025-09-01',
      fimExclusivo: '2025-10-01',
    })
    expect(s[5]).toMatchObject({ rotulo: 'fev/26', fimExclusivo: '2026-03-01' })
  })
})

describe('contas do Dashboard', () => {
  it('taxa de conversão: conquistadas ÷ (conquistadas + perdidas); sem fechamentos, nula', () => {
    expect(taxaDeConversao(4, 2)).toBe(66.7)
    expect(taxaDeConversao(0, 3)).toBe(0)
    expect(taxaDeConversao(5, 0)).toBe(100)
    expect(taxaDeConversao(0, 0)).toBeNull()
  })

  it('variação percentual sobre o período anterior; sem base, nula', () => {
    expect(variacaoPercentual(1180, 1000)).toBe(18)
    expect(variacaoPercentual(500, 1000)).toBe(-50)
    expect(variacaoPercentual(300, 0)).toBeNull()
  })
})
