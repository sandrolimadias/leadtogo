import { describe, expect, it } from 'vitest'

import { classeDe, corDaClasse, desenharMapa, faixasDeDensidade } from './densidade'

describe('mapa de densidade', () => {
  it('até 5 classes por quantis dos valores positivos; zero fica fora', () => {
    const faixas = faixasDeDensidade([0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55])
    expect(faixas).toHaveLength(5)
    expect(faixas[0]).toEqual({ classe: 1, de: 1, ate: 2 })
    expect(faixas[4]?.ate).toBe(55)
    // as faixas encostam uma na outra
    for (let i = 1; i < faixas.length; i++) {
      expect(faixas[i]?.de).toBe((faixas[i - 1]?.ate ?? 0) + 1)
    }
    expect(classeDe(0, faixas)).toBe(0)
    expect(classeDe(1, faixas)).toBe(1)
    expect(classeDe(55, faixas)).toBe(5)
  })

  it('com poucos valores distintos, as classes se juntam; sem valores, nenhuma', () => {
    expect(faixasDeDensidade([1, 2, 3, 3, 3])).toEqual([
      { classe: 1, de: 1, ate: 1 },
      { classe: 2, de: 2, ate: 2 },
      { classe: 3, de: 3, ate: 3 },
    ])
    expect(faixasDeDensidade([4, 4, 4])).toEqual([{ classe: 1, de: 4, ate: 4 }])
    expect(faixasDeDensidade([0, 0])).toEqual([])
  })

  it('cores só dos tokens: a mais escura é o token puro; zero é o fundo neutro', () => {
    expect(corDaClasse(5, 5, 'azul')).toBe(
      'color-mix(in oklch, var(--tag-blue-fg) 100%, var(--surface))',
    )
    expect(corDaClasse(1, 5, 'vermelho')).toBe(
      'color-mix(in oklch, var(--tag-red-fg) 22%, var(--surface))',
    )
    expect(corDaClasse(1, 1, 'azul')).toContain('100%')
    expect(corDaClasse(0, 5, 'azul')).toBe('var(--surface-sunken)')
    expect(corDaClasse(2, 3, 'azul')).toContain(' 58%')
  })

  it('desenha os contornos na largura pedida, com a altura da proporção do estado', () => {
    const d = desenharMapa(
      [
        {
          codigo: 1,
          poligonos: [
            [
              [
                [-41, -20],
                [-40, -20],
                [-40, -19],
                [-41, -19],
                [-41, -20],
              ],
            ],
          ],
        },
      ],
      100,
      0,
    )
    expect(d.largura).toBe(100)
    // 1° de longitude a ~19,5° de latitude vale cos(19,5°) ≈ 0,943 de 1° de latitude
    expect(d.altura).toBe(106)
    expect(d.caminhos.get(1)).toMatch(
      /^M0\.0,106\.\dL100\.0,106\.\dL100\.0,0\.0L0\.0,0\.0L0\.0,106\.\dZ$/,
    )
    expect(desenharMapa([]).altura).toBe(0)
  })
})
