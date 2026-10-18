import { describe, expect, it } from 'vitest'

import { estiloDoMapa, URL_DO_MAPA_BASE } from './estilo'
import { circulo, criarBolha, criarPin } from './pin'

describe('o elemento que vira Marker do MapLibre', () => {
  // O CSS do MapLibre dá `position:absolute` à classe `.maplibregl-marker`; um `all:unset` inline a anulava e os
  // pins se empilhavam em fila (bug de 18/10/2026). O estilo inline não pode mexer em posicionamento.
  const elementos = {
    pin: criarPin({ cor: '#000', rotulo: 'a' }),
    'pin selecionado': criarPin({ cor: '#000', rotulo: 'a', selecionado: true }),
    'pin arrastável': criarPin({ cor: '#000', rotulo: 'a', arrastavel: true }),
    bolha: criarBolha(12, '#000', 'b'),
  }
  for (const [nome, el] of Object.entries(elementos)) {
    it(`${nome}: sem all:unset e sem position, top, left nem transform inline`, () => {
      expect(el.getAttribute('style') ?? '').not.toMatch(/\ball\s*:/)
      expect(el.style.position).toBe('')
      expect(el.style.top).toBe('')
      expect(el.style.left).toBe('')
      expect(el.style.transform).toBe('')
    })
  }
})

describe('pin e bolha do mapa', () => {
  it('o pin é um botão com rótulo acessível e a cor do estado', () => {
    const el = criarPin({ cor: '#17693b', rotulo: 'Alfa Ltda' })
    expect(el.tagName).toBe('BUTTON')
    expect(el.getAttribute('aria-label')).toBe('Alfa Ltda')
    expect(el.querySelector('path')?.getAttribute('fill')).toBe('#17693b')
  })

  it('visitada ganha o visto (o estado não depende só da cor)', () => {
    const sem = criarPin({ cor: '#000', rotulo: 'a' })
    const com = criarPin({ cor: '#000', rotulo: 'a', visitada: true })
    expect(sem.querySelectorAll('path')).toHaveLength(1)
    expect(sem.querySelector('circle')).not.toBeNull()
    expect(com.querySelectorAll('path')).toHaveLength(2)
    expect(com.querySelector('circle')).toBeNull()
  })

  it('o pin selecionado e o arrastável são maiores', () => {
    const normal = criarPin({ cor: '#000', rotulo: 'a' })
    const grande = criarPin({ cor: '#000', rotulo: 'a', selecionado: true })
    const arrasta = criarPin({ cor: '#000', rotulo: 'a', arrastavel: true })
    expect(normal.style.width).toBe('30px')
    expect(grande.style.width).toBe('40px')
    expect(arrasta.style.width).toBe('40px')
    expect(arrasta.style.cssText).toContain('grab')
  })

  it('a bolha mostra o total (e "k" a partir de mil) com rótulo acessível', () => {
    expect(criarBolha(12, '#000', '12 empresas').textContent).toBe('12')
    expect(criarBolha(2500, '#000', '2500 empresas').textContent).toBe('2.5k')
    expect(criarBolha(7, '#000', '7 empresas').getAttribute('aria-label')).toBe('7 empresas')
  })
})

describe('círculo de incerteza', () => {
  it('um polígono fechado a ~o raio pedido em volta do ponto', () => {
    const f = circulo(-20.3, -40.3, 1000)
    const anel = f.geometry.coordinates[0] ?? []
    expect(anel[0]).toEqual(anel[anel.length - 1])
    // o ponto mais ao norte está a cerca de 1000 m (1000 / 111.195 m por grau)
    const norte = Math.max(...anel.map((p) => p[1]))
    expect((norte - -20.3) * 111_195).toBeGreaterThan(990)
    expect((norte - -20.3) * 111_195).toBeLessThan(1010)
  })
})

describe('estilo do mapa', () => {
  it('lê o PMTiles pela API e os glifos do nosso servidor (nada externo)', () => {
    const claro = estiloDoMapa('claro')
    expect(claro.glyphs).toBe('/mapa/fontes/{fontstack}/{range}.pbf')
    expect(JSON.stringify(claro.sources)).toContain(`pmtiles://${URL_DO_MAPA_BASE}`)
    expect(JSON.stringify(claro)).not.toMatch(/https?:\/\/(?!openstreetmap\.org)/)
  })

  it('o tema escuro troca as cores e mantém as camadas', () => {
    const claro = estiloDoMapa('claro')
    const escuro = estiloDoMapa('escuro')
    expect(escuro.layers.length).toBe(claro.layers.length)
    expect(JSON.stringify(escuro.layers)).not.toBe(JSON.stringify(claro.layers))
  })

  it('não usa sprite nem ícone de ponto de interesse', () => {
    const estilo = estiloDoMapa('claro')
    expect(estilo.sprite).toBeUndefined()
    expect(JSON.stringify(estilo.layers)).not.toContain('icon-image')
  })
})
