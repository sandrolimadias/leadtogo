import { describe, expect, it } from 'vitest'

import { estiloDoMapa } from './estilo'

const URL_DO_MAPA_BASE = 'https://mapa.crm.exemplo.com.br/es-20261021.pmtiles'
import { limitarArea } from './area'
import { geojsonDasBolhas, geojsonDosPins, raioDaBolha, textoDaBolha } from './dados'
import { desenharPin, idDoIcone, lerIdDoIcone } from './icone'
import { circulo, criarPin } from './pin'

describe('o elemento que vira Marker do MapLibre', () => {
  // O CSS do MapLibre dá `position:absolute` à classe `.maplibregl-marker`; um `all:unset` inline a anulava e os
  // pins se empilhavam em fila (bug de 18/10/2026). O estilo inline não pode mexer em posicionamento.
  const elementos = {
    pin: criarPin({ cor: '#000', rotulo: 'a' }),
    'pin selecionado': criarPin({ cor: '#000', rotulo: 'a', selecionado: true }),
    'pin arrastável': criarPin({ cor: '#000', rotulo: 'a', arrastavel: true }),
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

describe('pin do mapa', () => {
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
  it('lê o PMTiles do bucket público do mapa e os glifos do nosso servidor (nada de terceiros)', () => {
    const claro = estiloDoMapa('claro', URL_DO_MAPA_BASE)
    expect(claro.glyphs).toBe('/mapa/fontes/{fontstack}/{range}.pbf')
    expect(JSON.stringify(claro.sources)).toContain(`pmtiles://${URL_DO_MAPA_BASE}`)
    // o único endereço absoluto além da atribuição do OpenStreetMap é o do mapa base (o domínio liberado na CSP)
    expect(JSON.stringify(claro)).not.toMatch(
      /https?:\/\/(?!openstreetmap\.org|mapa\.crm\.exemplo\.com\.br)/,
    )
  })

  it('o tema escuro troca as cores e mantém as camadas', () => {
    const claro = estiloDoMapa('claro', URL_DO_MAPA_BASE)
    const escuro = estiloDoMapa('escuro', URL_DO_MAPA_BASE)
    expect(escuro.layers.length).toBe(claro.layers.length)
    expect(JSON.stringify(escuro.layers)).not.toBe(JSON.stringify(claro.layers))
  })

  it('não usa sprite nem ícone de ponto de interesse', () => {
    const estilo = estiloDoMapa('claro', URL_DO_MAPA_BASE)
    expect(estilo.sprite).toBeUndefined()
    expect(JSON.stringify(estilo.layers)).not.toContain('icon-image')
  })
})

describe('área visível enviada à API', () => {
  it('afastado além do mundo, a longitude e a latitude ficam nos limites (a API recusava com 400)', () => {
    expect(
      limitarArea({ oeste: -258.7, sul: -85.05, leste: 306.5, norte: 85.05, zoom: 0.47 }),
    ).toEqual({
      oeste: -180,
      sul: -85.05,
      leste: 180,
      norte: 85.05,
      zoom: 0.47,
    })
    expect(limitarArea({ oeste: -41, sul: -92, leste: -40, norte: 91, zoom: 12 })).toMatchObject({
      sul: -85.0511,
      norte: 85.0511,
    })
  })

  it('o que já está dentro dos limites não muda', () => {
    const a = { oeste: -40.6, sul: -20.6, leste: -40, norte: -19.9, zoom: 12.3 }
    expect(limitarArea(a)).toEqual(a)
  })
})

describe('ícone do pin na camada do mapa', () => {
  it('o nome da imagem carrega cor, visto e seleção, e volta igual', () => {
    const o = { cor: 'rgb(10, 20, 30)', visitada: true, selecionado: false }
    expect(idDoIcone(o)).toBe('pin|rgb(10, 20, 30)|1|0')
    expect(lerIdDoIcone(idDoIcone(o))).toEqual(o)
    expect(lerIdDoIcone('outra-imagem')).toBeNull()
  })

  it('só desenha com canvas (o jsdom não tem): a função existe para o navegador', () => {
    expect(typeof desenharPin).toBe('function')
  })
})

describe('dados GeoJSON das camadas do mapa', () => {
  const token = (c: string) => `resolvida(${c})`

  it('cada pin vira um ponto [lon, lat] com o ícone da cor, do visto e da seleção', () => {
    const r = geojsonDosPins(
      [
        { id: 'a', latitude: -20.3, longitude: -40.3, cor: '--tag-green-fg', visitada: true },
        { id: 'b', latitude: -20.4, longitude: -40.4, cor: '#112233', selecionado: true },
      ],
      token,
    )
    expect(r.features.map((f) => f.geometry.coordinates)).toEqual([
      [-40.3, -20.3],
      [-40.4, -20.4],
    ])
    expect(r.features[0]?.properties).toEqual({
      id: 'a',
      icone: 'pin|resolvida(--tag-green-fg)|1|0',
      z: 0,
    })
    // cor CSS passa direto; o selecionado desenha por cima (z maior)
    expect(r.features[1]?.properties).toEqual({ id: 'b', icone: 'pin|#112233|0|1', z: 1 })
  })

  it('as bolhas levam o texto (o total abreviado quando não há), o raio, a cor resolvida e o rótulo', () => {
    const r = geojsonDasBolhas(
      [
        { id: 'm1', latitude: -20, longitude: -40, total: 7, cor: '--warning', texto: '3' },
        { id: 'g2', latitude: -21, longitude: -41, total: 1234, cor: '#fff' },
      ],
      token,
    )
    expect(r.features[0]?.properties).toEqual({
      id: 'm1',
      texto: '3',
      raio: 16,
      cor: 'resolvida(--warning)',
      rotulo: '',
    })
    expect(r.features[1]?.properties).toMatchObject({ texto: '1,2 mil', raio: 30, cor: '#fff' })
  })

  it('o raio cresce com o total e o texto abrevia a partir de mil', () => {
    expect([1, 10, 100, 1000].map(raioDaBolha)).toEqual([16, 20, 25, 30])
    expect([5, 999, 1000, 15500].map(textoDaBolha)).toEqual(['5', '999', '1 mil', '15,5 mil'])
  })

  it('sem pins, a coleção é vazia (a camada some do mapa)', () => {
    expect(geojsonDosPins([], token).features).toEqual([])
  })
})
