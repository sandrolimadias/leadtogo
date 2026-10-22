import { describe, expect, it } from 'vitest'

import { bolhasDeBairro, bolhasDeMunicipio, type LinhaAgregada } from './agrupar.js'

const linha = (o: Partial<LinhaAgregada>): LinhaAgregada => ({
  municipio: 3205309,
  nomeDoMunicipio: 'Vitória',
  total: 1,
  somaLat: -20,
  somaLon: -40,
  oeste: -40,
  sul: -20,
  leste: -40,
  norte: -20,
  ...o,
})

describe('bolhasDeBairro', () => {
  it('junta as grafias do mesmo bairro e do mesmo município: média ponderada e união das caixas', () => {
    const r = bolhasDeBairro([
      linha({
        bairro: 'Jd. Camburi',
        total: 1,
        somaLat: -20.26,
        somaLon: -40.27,
        oeste: -40.27,
        sul: -20.26,
        leste: -40.27,
        norte: -20.26,
      }),
      linha({
        bairro: 'JARDIM CAMBURÍ',
        total: 3,
        somaLat: -61.2,
        somaLon: -120.6,
        oeste: -40.4,
        sul: -20.5,
        leste: -40.1,
        norte: -20.1,
      }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: '3205309:JARDIM CAMBURI', rotulo: 'Jardim Camburi', total: 4 })
    expect(r[0]?.latitude).toBeCloseTo((-20.26 - 61.2) / 4, 5)
    expect(r[0]?.longitude).toBeCloseTo((-40.27 - 120.6) / 4, 5)
    expect([r[0]?.oeste, r[0]?.sul, r[0]?.leste, r[0]?.norte]).toEqual([-40.4, -20.5, -40.1, -20.1])
  })

  it('o mesmo nome de bairro em municípios diferentes são bolhas diferentes', () => {
    const r = bolhasDeBairro([
      linha({ bairro: 'Centro', municipio: 1, total: 2 }),
      linha({ bairro: 'CENTRO', municipio: 2, total: 1 }),
    ])
    expect(r.map((g) => g.id)).toEqual(['1:CENTRO', '2:CENTRO'])
  })

  it('sem bairro (nulo, vazio ou "não informado") é um grupo "Sem bairro" do município', () => {
    const r = bolhasDeBairro([
      linha({ bairro: null, total: 1 }),
      linha({ bairro: '  ', total: 1 }),
      linha({ bairro: 'Não informado', total: 1 }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: '3205309:', rotulo: 'Sem bairro', total: 3 })
  })

  it('ordena pelas maiores e ignora grupo vazio', () => {
    const r = bolhasDeBairro([
      linha({ bairro: 'A', total: 1 }),
      linha({ bairro: 'B', total: 5 }),
      linha({ bairro: 'C', total: 0 }),
    ])
    expect(r.map((g) => g.rotulo)).toEqual(['B', 'A'])
  })
})

describe('bolhasDeMunicipio', () => {
  it('uma bolha por município, com o nome, e "Sem município" para o que não tem', () => {
    const r = bolhasDeMunicipio([
      linha({ total: 2 }),
      linha({ municipio: null, nomeDoMunicipio: null, total: 1 }),
    ])
    expect(r.map((g) => [g.id, g.rotulo, g.total])).toEqual([
      ['3205309', 'Vitória', 2],
      ['0', 'Sem município', 1],
    ])
  })
})
