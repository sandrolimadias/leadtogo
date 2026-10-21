import { describe, expect, it } from 'vitest'

import { configuracaoDeTeste } from '../testes/app-teste.js'
import { MonitorDoPool } from './monitor-do-pool.js'

const monitor = (max = 10) => new MonitorDoPool(configuracaoDeTeste({ DB_POOL_MAX: String(max) }))
const T0 = 1_800_000_000_000

describe('MonitorDoPool', () => {
  it('conta as transações em andamento e volta a zero', () => {
    const m = monitor()
    m.iniciar(T0)
    m.iniciar(T0)
    expect(m.emAndamento).toBe(2)
    m.terminar()
    m.terminar()
    m.terminar() // nunca fica negativo
    expect(m.emAndamento).toBe(0)
  })

  it('o pico dos últimos 5 minutos sobrevive à saturação que já passou', () => {
    const m = monitor(10)
    for (let i = 0; i < 9; i++) m.iniciar(T0)
    for (let i = 0; i < 9; i++) m.terminar()
    expect(m.emAndamento).toBe(0)
    expect(m.picoPct(5, T0 + 60_000)).toBe(90)
    expect(m.picoPct(5, T0 + 4 * 60_000)).toBe(90)
    // passada a janela, o pico some
    expect(m.picoPct(5, T0 + 6 * 60_000)).toBe(0)
  })

  it('conta também quem espera uma conexão (pode passar de 100%)', () => {
    const m = monitor(4)
    for (let i = 0; i < 6; i++) m.iniciar(T0)
    expect(m.picoPct(5, T0)).toBe(150)
  })
})
