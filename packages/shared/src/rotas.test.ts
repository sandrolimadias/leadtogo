import { describe, expect, it } from 'vitest'

import {
  codigoDaRota,
  distanciaEmLinhaRetaM,
  duracaoTotalS,
  formatarDistancia,
  formatarDuracao,
  linkDoWaze,
  MAX_PARADAS_POR_ROTA,
  ordemEmLinhaReta,
  otimizarRotaSchema,
  salvarRotaSchema,
  trechoEstimado,
  trechosDoGoogleMaps,
} from './rotas.js'

const id = (n: number) => `0190f0e0-0000-7000-8000-${String(n).padStart(12, '0')}`
const ponto = (latitude: number, longitude: number) => ({ latitude, longitude })

describe('salvarRotaSchema', () => {
  const base = {
    nome: 'Grande Vitória · segunda',
    data: '2026-10-26',
    partida: 'posicao_atual' as const,
    voltarAoInicio: true,
    empresaIds: [id(1), id(2)],
  }

  it('aceita a rota com a posição atual e recusa "ponto" sem o ponto', () => {
    expect(salvarRotaSchema.safeParse(base).success).toBe(true)
    const r = salvarRotaSchema.safeParse({ ...base, partida: 'ponto' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['pontoPartidaId'])
  })

  it(`no máximo ${MAX_PARADAS_POR_ROTA} paradas, sem repetir empresa`, () => {
    const muitas = Array.from({ length: MAX_PARADAS_POR_ROTA + 1 }, (_, i) => id(i))
    expect(salvarRotaSchema.safeParse({ ...base, empresaIds: muitas }).success).toBe(false)
    expect(
      salvarRotaSchema.safeParse({ ...base, empresaIds: muitas.slice(0, MAX_PARADAS_POR_ROTA) })
        .success,
    ).toBe(true)
    expect(salvarRotaSchema.safeParse({ ...base, empresaIds: [id(1), id(1)] }).success).toBe(false)
  })

  it('otimizar exige ao menos duas paradas', () => {
    const r = otimizarRotaSchema.safeParse({
      partida: 'posicao_atual',
      voltarAoInicio: false,
      empresaIds: [id(1)],
    })
    expect(r.success).toBe(false)
  })
})

describe('estimativa em linha reta', () => {
  it('distância entre Vitória e Vila Velha na ordem de grandeza certa', () => {
    const d = distanciaEmLinhaRetaM(ponto(-20.3155, -40.3128), ponto(-20.3297, -40.2925))
    expect(d).toBeGreaterThan(2000)
    expect(d).toBeLessThan(3000)
  })

  it('o trecho estimado aplica o desvio e a velocidade média', () => {
    const t = trechoEstimado(ponto(0, 0), ponto(0, 0.1)) // ~11,1 km em linha reta
    expect(t.distanciaM).toBeGreaterThan(14_000)
    expect(t.distanciaM).toBeLessThan(15_000)
    expect(t.duracaoS).toBe(Math.round(t.distanciaM / (40_000 / 3600)))
  })

  it('a ordem visita os pontos de uma reta na sequência, a partir do início', () => {
    const paradas = [ponto(0, 0.4), ponto(0, 0.1), ponto(0, 0.3), ponto(0, 0.2)]
    expect(ordemEmLinhaReta(ponto(0, 0), paradas, false)).toEqual([1, 3, 2, 0])
  })

  it('sem início, a primeira parada fica no lugar', () => {
    const paradas = [ponto(0, 0.1), ponto(0, 0.4), ponto(0, 0.2), ponto(0, 0.3)]
    const ordem = ordemEmLinhaReta(null, paradas, false)
    expect(ordem[0]).toBe(0)
    expect(ordem).toEqual([0, 2, 3, 1])
  })

  it('devolve uma permutação de todas as paradas', () => {
    const paradas = Array.from({ length: 30 }, (_, i) =>
      ponto(-20 - ((i * 7) % 11) / 50, -40 - ((i * 5) % 13) / 50),
    )
    const ordem = ordemEmLinhaReta(ponto(-20.2, -40.2), paradas, true)
    expect([...ordem].sort((a, b) => a - b)).toEqual(paradas.map((_, i) => i))
  })
})

describe('navegação', () => {
  const paradas = Array.from({ length: 15 }, (_, i) => ponto(-20 - i / 100, -40))

  it('no celular, 15 paradas viram 4 trechos de até 4 paradas (3 intermediárias + destino)', () => {
    const t = trechosDoGoogleMaps({ origem: null, paradas, destinoFinal: null, celular: true })
    expect(t).toHaveLength(4)
    expect(t[0]?.rotulo).toBe('Trecho 1 (paradas 1–4)')
    expect(t[3]?.rotulo).toBe('Trecho 4 (paradas 13–15)')
    // o primeiro trecho sem origem: o Google começa na posição atual
    expect(t[0]?.url).not.toContain('origin=')
    expect(t[0]?.url).toContain('waypoints=-20,-40|-20.01,-40|-20.02,-40')
    expect(t[0]?.url).toContain('destination=-20.03,-40')
    // o trecho seguinte começa no destino do anterior
    expect(t[1]?.url).toContain('origin=-20.03,-40')
  })

  it('no computador cabem 10 paradas por trecho; a volta ao início termina no ponto de partida', () => {
    const sede = ponto(-20.5, -40.5)
    const t = trechosDoGoogleMaps({ origem: sede, paradas, destinoFinal: sede, celular: false })
    expect(t).toHaveLength(2)
    expect(t[0]?.url).toContain('origin=-20.5,-40.5')
    expect(t[1]?.rotulo).toBe('Trecho 2 (paradas 11–15 e volta)')
    expect(t[1]?.url).toContain('destination=-20.5,-40.5')
    for (const x of t) expect(x.url.length).toBeLessThan(2048)
  })

  it('Waze: um destino por vez', () => {
    expect(linkDoWaze(ponto(-20.3, -40.29))).toBe(
      'https://waze.com/ul?ll=-20.3,-40.29&navigate=yes',
    )
  })
})

describe('formatação', () => {
  it('código, distância e duração', () => {
    expect(codigoDaRota(151)).toBe('R-0151')
    expect(formatarDistancia(850)).toBe('850 m')
    expect(formatarDistancia(199_400)).toBe('199 km')
    expect(formatarDistancia(null)).toBe('—')
    expect(formatarDuracao(35 * 60)).toBe('35 min')
    expect(formatarDuracao(14 * 3600 + 20 * 60)).toBe('14 h 20 min')
    expect(duracaoTotalS(3600, 15, 40)).toBe(3600 + 15 * 40 * 60)
  })
})
