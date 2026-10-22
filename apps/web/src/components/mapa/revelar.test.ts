import { describe, expect, it } from 'vitest'

import { deslocamentoMinimo, type Retangulo } from './revelar'

const mapa = { largura: 1200, altura: 800 }
// o painel do desktop: 400 px à esquerda, de 88 px do topo até 12 px do fundo
const painel: Retangulo = { esquerda: 12, topo: 88, direita: 412, base: 788 }

describe('deslocamentoMinimo (pin escondido atrás do painel)', () => {
  it('pin livre: não mexe em nada', () => {
    expect(deslocamentoMinimo({ x: 700, y: 400 }, mapa, [painel])).toEqual({ dx: 0, dy: 0 })
  })

  it('pin atrás do painel: desliza só para a direita, o mínimo para sair de trás dele', () => {
    const r = deslocamentoMinimo({ x: 300, y: 400 }, mapa, [painel])
    expect(r.dy).toBe(0)
    // a borda esquerda do pin (x - 20) passa a 14 px da direita do painel
    expect(300 + r.dx - 20).toBe(412 + 14)
  })

  it('pin encostado na borda do painel: o deslocamento é pequeno', () => {
    const r = deslocamentoMinimo({ x: 430, y: 400 }, mapa, [painel])
    expect(r.dx).toBeGreaterThan(0)
    expect(r.dx).toBeLessThan(40)
  })

  it('celular: painel embaixo, o pin sobe o mínimo', () => {
    const folha: Retangulo = { esquerda: 0, topo: 500, direita: 390, base: 720 }
    const r = deslocamentoMinimo({ x: 195, y: 560 }, { largura: 390, altura: 720 }, [folha])
    expect(r.dx).toBe(0)
    // a base do pin (y + 6) passa a 14 px acima do topo da folha
    expect(560 + r.dy + 6).toBe(500 - 14)
  })

  it('pin fora do mapa: não centraliza nem desliza', () => {
    expect(deslocamentoMinimo({ x: 5000, y: 400 }, mapa, [painel])).toEqual({ dx: 0, dy: 0 })
    expect(deslocamentoMinimo({ x: -300, y: 400 }, mapa, [painel])).toEqual({ dx: 0, dy: 0 })
  })

  it('sem painel não há o que revelar', () => {
    expect(deslocamentoMinimo({ x: 300, y: 400 }, mapa, [])).toEqual({ dx: 0, dy: 0 })
  })

  it('não empurra o pin para fora do mapa: sem saída, fica onde está', () => {
    const tudo: Retangulo = { esquerda: 0, topo: 0, direita: 1200, base: 800 }
    expect(deslocamentoMinimo({ x: 600, y: 400 }, mapa, [tudo])).toEqual({ dx: 0, dy: 0 })
  })
})
