import { describe, expect, it } from 'vitest'

import { minutoDoDiaEmBrasilia, quandoPodeSair } from './silencio.js'

// Brasília é UTC-3 (sem horário de verão desde 2019): 15:30Z = 12:30 em Brasília
const em = (iso: string) => new Date(iso)

describe('quandoPodeSair', () => {
  it('sem silêncio configurado sai na hora', () => {
    const agora = em('2026-11-10T15:30:00Z')
    expect(quandoPodeSair(agora, null, null)).toEqual(agora)
  })

  it('fora do silêncio sai na hora', () => {
    const agora = em('2026-11-10T15:30:00Z') // 12:30
    expect(quandoPodeSair(agora, '22:00', '07:00')).toEqual(agora)
    expect(quandoPodeSair(agora, '13:00:00', '14:00:00')).toEqual(agora)
  })

  it('no silêncio que vira a noite espera o fim, antes ou depois da meia-noite', () => {
    // 23:10 em Brasília (02:10Z do dia seguinte) -> 07:00 do dia seguinte (10:00Z)
    expect(quandoPodeSair(em('2026-11-11T02:10:30Z'), '22:00', '07:00').toISOString()).toBe(
      '2026-11-11T10:00:00.000Z',
    )
    // 05:00 em Brasília (08:00Z) -> 07:00 do mesmo dia (10:00Z)
    expect(quandoPodeSair(em('2026-11-11T08:00:00Z'), '22:00', '07:00').toISOString()).toBe(
      '2026-11-11T10:00:00.000Z',
    )
  })

  it('no silêncio do mesmo dia espera o fim; o fim é livre (intervalo aberto)', () => {
    expect(quandoPodeSair(em('2026-11-10T15:30:00Z'), '12:00', '14:00').toISOString()).toBe(
      '2026-11-10T17:00:00.000Z',
    )
    const noFim = em('2026-11-10T17:00:00Z') // 14:00 exatos
    expect(quandoPodeSair(noFim, '12:00', '14:00')).toEqual(noFim)
  })

  it('o minuto do dia usa o horário de Brasília', () => {
    expect(minutoDoDiaEmBrasilia(em('2026-11-10T03:05:00Z'))).toBe(5)
  })
})
