import { describe, expect, it } from 'vitest'

import {
  consultaDeAssociadosSchema,
  consultaDeResultadosSchema,
  consultaDeContornosSchema,
  diasNoIntervalo,
  instantesDoIntervalo,
  mesesDoPeriodo,
  somarDias,
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

describe('períodos do Dashboard v2', () => {
  const quinze = new Date('2026-10-15T15:00:00Z')

  it('semestre do calendário (o 2º em outubro) e o anterior', () => {
    expect(periodoDoDashboard('semestre', quinze)).toMatchObject({
      inicio: '2026-07-01',
      fim: '2026-12-31',
      fimExclusivo: '2027-01-01',
      rotulo: '2º semestre de 2026',
      anterior: { inicio: '2026-01-01', fim: '2026-06-30' },
    })
    expect(periodoDoDashboard('semestre', new Date('2026-03-10T12:00:00Z'))).toMatchObject({
      inicio: '2026-01-01',
      fim: '2026-06-30',
      rotulo: '1º semestre de 2026',
      anterior: { inicio: '2025-07-01', fim: '2025-12-31' },
    })
  })

  it('ano atual e ano anterior escolhido', () => {
    expect(periodoDoDashboard('ano', quinze)).toMatchObject({
      inicio: '2026-01-01',
      fim: '2026-12-31',
      rotulo: '2026',
      anterior: { inicio: '2025-01-01', fim: '2025-12-31' },
    })
    expect(periodoDoDashboard('ano_anterior', quinze, undefined, { ano: 2024 })).toMatchObject({
      inicio: '2024-01-01',
      fim: '2024-12-31',
      fimExclusivo: '2025-01-01',
      rotulo: '2024',
      anterior: { inicio: '2023-01-01', fim: '2023-12-31' },
    })
  })

  it('a virada do ano vale no fuso da empresa', () => {
    // 31/12/2026 às 23h de Brasília = 01/01/2027 02h UTC: ainda é 2026
    expect(periodoDoDashboard('ano', new Date('2027-01-01T02:00:00Z')).rotulo).toBe('2026')
    // em Manaus (UTC−4), 01/01 03h30 UTC ainda é 31/12
    expect(
      periodoDoDashboard('semestre', new Date('2027-01-01T03:30:00Z'), 'America/Manaus').rotulo,
    ).toBe('2º semestre de 2026')
  })

  it('personalizado: os dois dias inclusive e o anterior com o mesmo número de dias', () => {
    const p = periodoDoDashboard('personalizado', quinze, undefined, {
      de: '2026-03-01',
      ate: '2026-03-10',
    })
    expect(p).toMatchObject({
      inicio: '2026-03-01',
      fim: '2026-03-10',
      fimExclusivo: '2026-03-11',
      rotulo: '01/03/2026 a 10/03/2026',
      anterior: { inicio: '2026-02-19', fim: '2026-02-28', fimExclusivo: '2026-03-01' },
    })
    // ano bissexto
    expect(
      periodoDoDashboard('personalizado', quinze, undefined, {
        de: '2028-03-01',
        ate: '2028-03-01',
      }).anterior,
    ).toMatchObject({ inicio: '2028-02-29', fim: '2028-02-29' })
  })

  it('contas de dias', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2028-03-01', -1)).toBe('2028-02-29')
    expect(diasNoIntervalo('2026-01-01', '2026-12-31')).toBe(365)
    expect(diasNoIntervalo('2026-05-05', '2026-05-05')).toBe(1)
  })

  it('série do MRR: 6 meses nos períodos curtos e os meses do período nos longos', () => {
    const hoje = '2026-10-15'
    expect(mesesDoPeriodo(periodoDoDashboard('mes', quinze), hoje).map((m) => m.mes)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ])
    expect(mesesDoPeriodo(periodoDoDashboard('ano', quinze), hoje)).toHaveLength(12)
    expect(mesesDoPeriodo(periodoDoDashboard('semestre', quinze), hoje)[0]?.mes).toBe('2026-07')
    const p = periodoDoDashboard('personalizado', quinze, undefined, {
      de: '2026-03-10',
      ate: '2026-05-02',
    })
    expect(mesesDoPeriodo(p, hoje).map((m) => m.mes)).toEqual(['2026-03', '2026-04', '2026-05'])
  })
})

describe('consultas da aba Resultados', () => {
  it('padrões: mês atual e visão Minha', () => {
    expect(consultaDeResultadosSchema.parse({})).toEqual({ periodo: 'mes', visao: 'minha' })
  })

  it('ano anterior exige o ano; personalizado exige as datas em ordem e até 3 anos', () => {
    expect(consultaDeResultadosSchema.safeParse({ periodo: 'ano_anterior' }).success).toBe(false)
    expect(consultaDeResultadosSchema.parse({ periodo: 'ano_anterior', ano: '2024' }).ano).toBe(
      2024,
    )
    expect(consultaDeResultadosSchema.safeParse({ periodo: 'personalizado' }).success).toBe(false)
    expect(
      consultaDeResultadosSchema.safeParse({
        periodo: 'personalizado',
        de: '2026-05-10',
        ate: '2026-05-01',
      }).success,
    ).toBe(false)
    expect(
      consultaDeResultadosSchema.safeParse({
        periodo: 'personalizado',
        de: '2022-01-01',
        ate: '2026-01-01',
      }).success,
    ).toBe(false)
    expect(
      consultaDeResultadosSchema.safeParse({
        periodo: 'personalizado',
        de: '2026-01-01',
        ate: '2026-03-31',
      }).success,
    ).toBe(true)
  })

  it('lista de associados: tipo obrigatório e paginação', () => {
    expect(consultaDeAssociadosSchema.safeParse({}).success).toBe(false)
    expect(consultaDeAssociadosSchema.parse({ tipo: 'novos', pagina: '2' })).toMatchObject({
      tipo: 'novos',
      pagina: 2,
      porPagina: 8,
    })
  })

  it('contornos: UF de duas letras, em maiúsculas', () => {
    expect(consultaDeContornosSchema.parse({ uf: 'es' })).toEqual({ uf: 'ES' })
    expect(consultaDeContornosSchema.safeParse({ uf: 'ESP' }).success).toBe(false)
  })
})
