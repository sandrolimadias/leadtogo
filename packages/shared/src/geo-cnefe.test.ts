import { describe, expect, it } from 'vitest'

import { distanciaEmMetros, escolherNaRua, type LinhaCnefe } from './geo-cnefe.js'

// Uma rua fictícia de 0,001° de latitude por 10 números (~111 m), com os pares de um lado.
const rua = (numeros: number[], cep = '29000000', nivel = 1, lon = -40.3): LinhaCnefe[] =>
  numeros.map((n) => ({
    latitude: -20.3 + n / 10_000,
    longitude: lon,
    numero: n,
    nivelCoordenada: nivel,
    cep,
  }))

describe('escolherNaRua', () => {
  it('sem endereço na rua: nulo', () => {
    expect(escolherNaRua([], 10, null)).toBeNull()
  })

  it('número casado: nível "numero" e no ponto do endereço', () => {
    const p = escolherNaRua(rua([2, 4, 6, 8]), 6, null)
    expect(p?.nivel).toBe('numero')
    expect(p?.latitude).toBeCloseTo(-20.3 + 6 / 10_000, 6)
    expect(p?.ambiguo).toBe(false)
  })

  it('número que não existe, com vizinhos dos dois lados: interpola no mesmo lado', () => {
    const p = escolherNaRua(rua([2, 4, 8, 10]), 6, null)
    expect(p?.nivel).toBe('numero_interpolado')
    expect(p?.latitude).toBeCloseTo(-20.3 + 6 / 10_000, 6)
  })

  it('interpola só por vizinhos de coordenada boa e a até 200 números', () => {
    const longe = escolherNaRua(rua([2, 400]), 100, null)
    expect(longe?.nivel).toBe('rua')
    const ruim = escolherNaRua(rua([2, 4, 8, 10], '29000000', 4), 6, null)
    expect(ruim?.nivel).toBe('rua')
  })

  it('número fora da faixa: cai no vizinho mais próximo (nível rua)', () => {
    const p = escolherNaRua(rua([2, 4, 6]), 50, null)
    expect(p?.nivel).toBe('rua')
    expect(p?.detalhe).toContain('44 números')
  })

  it('sem número (S/N): centro da rua', () => {
    const p = escolherNaRua(rua([2, 4, 6]), null, null)
    expect(p?.nivel).toBe('rua')
    expect(p?.latitude).toBeCloseTo(-20.3 + 4 / 10_000, 6)
  })

  describe('mesma rua em dois bairros', () => {
    const duas = [...rua([10], '29000001', 1, -40.3), ...rua([10], '29000002', 1, -40.25)]

    it('o CEP resolve: fica o trecho daquele CEP e a posição é exata', () => {
      const p = escolherNaRua(duas, 10, '29000002')
      expect(p?.nivel).toBe('numero')
      expect(p?.ambiguo).toBe(false)
      expect(p?.longitude).toBeCloseTo(-40.25, 6)
    })

    it('sem CEP que resolva: o número casa mas é ambíguo (vira aproximada)', () => {
      const p = escolherNaRua(duas, 10, null)
      expect(p?.nivel).toBe('numero')
      expect(p?.ambiguo).toBe(true)
      const outroCep = escolherNaRua(duas, 10, '99999999')
      expect(outroCep?.ambiguo).toBe(true)
    })

    it('vários pontos do mesmo número dentro de 100 m não são ambiguidade', () => {
      const p = escolherNaRua([...rua([10]), ...rua([10])], 10, null)
      expect(p?.ambiguo).toBe(false)
    })
  })
})

describe('distanciaEmMetros', () => {
  it('um grau de latitude tem cerca de 111 km', () => {
    expect(distanciaEmMetros(-20, -40, -21, -40)).toBeGreaterThan(111_000)
    expect(distanciaEmMetros(-20, -40, -21, -40)).toBeLessThan(111_400)
  })

  it('mesmo ponto: zero', () => {
    expect(distanciaEmMetros(-20.3, -40.3, -20.3, -40.3)).toBe(0)
  })
})
