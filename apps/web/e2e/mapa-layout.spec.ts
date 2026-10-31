import { mkdirSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Mapa (G2, 16/10/2026): a tela ocupa a área central inteira (sem rolagem da página, sem o limite de 1440 px),
// com os chips de Status, a legenda e o painel da empresa; no celular o painel sobe de baixo e os filtros
// ficam numa gaveta. Sem o PMTiles no Garage do E2E o fundo é liso (os pins continuam valendo).

const CAPTURAS = process.env['CAPTURAS_DIR']
async function capturar(page: Page, nome: string) {
  if (!CAPTURAS) return
  mkdirSync(CAPTURAS, { recursive: true })
  await page.screenshot({ path: `${CAPTURAS}/${nome}.png` })
}

/** Cria as três empresas e devolve o id do "Mercado do Centro" (o pin que o teste toca). */
async function preparar(page: Page, nome: string): Promise<string> {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  const grupos = (await (await api.get('/v1/configuracoes/tag-grupos')).json()) as {
    tags: { id: string; chaveSistema: string | null }[]
  }[]
  const cliente = grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === 'cliente')!
  // Vitória (3205309): Centro e dois do Jardim Camburi (escritos de jeitos diferentes); Serra (3205002): Centro
  const pontos = [
    ['Mercado do Centro', -20.3, -40.3, 3205309, 'Centro'],
    ['Padaria da Praia', -20.15, -40.15, 3205309, 'Jd. Camburi'],
    ['Oficina Norte', -20.151, -40.151, 3205309, 'JARDIM CAMBURÍ'],
    ['Loja da Serra', -20.13, -40.3, 3205002, 'Centro'],
  ] as const
  let idDoMercado = ''
  for (const [razaoSocial, latitude, longitude, municipioCodigo, bairro] of pontos) {
    const r = await api.post('/v1/carteira/empresas', {
      data: {
        tipoDocumento: 'nenhum',
        razaoSocial,
        statusTagId: cliente.id,
        endereco: { municipioCodigo, bairro },
      },
    })
    const { id } = (await r.json()) as { id: string }
    if (razaoSocial === 'Mercado do Centro') idDoMercado = id
    const p = await api.post(`/v1/geolocalizacao/empresas/${id}/posicao`, {
      data: { latitude, longitude },
    })
    expect(p.status()).toBe(200)
  }
  return idDoMercado
}

/** O pedaço do mapa do MapLibre que o teste usa (o mapa fica exposto no contêiner, como em testar-imagens.mjs). */
interface MapaTeste {
  jumpTo: (o: { center: [number, number]; zoom: number }) => void
  queryRenderedFeatures: (o: { layers: string[] }) => { properties: Record<string, unknown> }[]
  project: (c: [number, number]) => { x: number; y: number }
  getContainer: () => HTMLElement
}

/** Os pins são símbolos desenhados pelo MapLibre (sem elemento DOM): o teste fala com o mapa. */
function noMapa<R>(page: Page, fn: (mapa: MapaTeste) => R): Promise<R | null> {
  return page.evaluate((corpo) => {
    const contenedor = document.querySelector('[aria-label="Mapa das empresas"]') as unknown as {
      __mapa?: unknown
    } | null
    const mapa = contenedor?.__mapa
    // o mapa ainda não existe (carregando): quem consulta tenta de novo
    if (!mapa) return null
    try {
      // o corpo da função vem de `fn.toString()` (código do próprio teste), só para ele rodar dentro da página
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return (new Function('mapa', `return (${corpo})(mapa)`) as (m: unknown) => unknown)(mapa)
    } catch {
      // a camada ainda não existe (o estilo está carregando): quem consulta tenta de novo
      return null
    }
  }, fn.toString()) as Promise<R | null>
}

const medidas = (page: Page) =>
  page.evaluate(() => {
    const e = document.scrollingElement!
    const area = document.getElementById('conteudo')!.getBoundingClientRect()
    const mapa = document
      .querySelector<HTMLElement>('[aria-label="Mapa das empresas"]')!
      .getBoundingClientRect()
    return {
      rolaPagina: e.scrollHeight > window.innerHeight + 1 || e.scrollWidth > window.innerWidth + 1,
      area: { w: Math.round(area.width), h: Math.round(area.height) },
      mapa: { w: Math.round(mapa.width), h: Math.round(mapa.height) },
    }
  })

for (const tela of [
  { width: 1920, height: 1080, nome: '1920x1080', celular: false },
  { width: 1366, height: 768, nome: '1366x768', celular: false },
  { width: 390, height: 844, nome: '390x844', celular: true },
]) {
  test(`mapa ${tela.nome}: ocupa a área central, sem rolagem da página; chips, pins e painel`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const idDoMercado = await preparar(page, `mapa${tela.width}`)
    await page.setViewportSize({ width: tela.width, height: tela.height })
    await page.goto('/mapa')
    await expect(page.getByRole('application', { name: 'Mapa das empresas' })).toBeVisible()
    const grupo = page.getByRole('group', { name: 'Status das empresas' })
    await expect(grupo.getByRole('button', { name: /^Cliente \d/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // no zoom de abertura (de longe) o servidor devolve uma bolha por município: Vitória (3) e Serra (1)
    await expect
      .poll(
        () =>
          noMapa(page, (mapa) =>
            mapa
              .queryRenderedFeatures({ layers: ['bolhas-circulos'] })
              .map((f) => f.properties['texto'])
              .sort(),
          ),
        { timeout: 30_000 },
      )
      .toEqual(['1', '3'])
    // aproxima: a bolha se desfaz nos pins (WebGL no Chromium sem GPU: pode demorar)
    await noMapa(page, (mapa) => mapa.jumpTo({ center: [-40.3, -20.3], zoom: 16 }))
    await expect
      .poll(
        () =>
          noMapa(page, (mapa) =>
            mapa.queryRenderedFeatures({ layers: ['pins'] }).map((f) => f.properties['id']),
          ),
        { timeout: 30_000 },
      )
      .toContain(idDoMercado)
    await page.waitForTimeout(400)

    const m = await medidas(page)
    expect(m.rolaPagina).toBe(false)
    // o mapa tem a largura e a altura toda da área central (sem o limite de 1440 px)
    expect(Math.abs(m.mapa.w - m.area.w)).toBeLessThanOrEqual(2)
    expect(Math.abs(m.mapa.h - m.area.h)).toBeLessThanOrEqual(2)
    if (tela.width > 1440) expect(m.mapa.w).toBeGreaterThan(1440)

    if (!tela.celular) {
      await expect(page.getByRole('region', { name: 'Legenda do mapa' })).toBeVisible()
    }
    // os créditos (onde entra a fonte do IBGE) ficam embaixo do zoom, sem cobrir o + e o −
    const canto = await page.evaluate(() => {
      const creditos = document.querySelector('.maplibregl-ctrl-attrib')!.getBoundingClientRect()
      const zoom = document.querySelector('.maplibregl-ctrl-group')!.getBoundingClientRect()
      return { zoomEmbaixo: zoom.bottom, creditosEmCima: creditos.top }
    })
    expect(canto.zoomEmbaixo).toBeLessThanOrEqual(canto.creditosEmCima)
    await capturar(page, `mapa-${tela.nome}-pins`)

    // toca no corpo da gota do pin (a ponta é a coordenada, ~12 px abaixo)
    const ponto = await noMapa(page, (mapa) => {
      const c = mapa.getContainer().getBoundingClientRect()
      const p = mapa.project([-40.3, -20.3])
      return { x: c.left + p.x, y: c.top + p.y - 12 }
    })
    await page.mouse.click(ponto!.x, ponto!.y)
    const painel = page.getByRole('complementary', { name: 'Empresa selecionada' })
    await expect(painel.getByRole('heading', { name: 'Mercado do Centro' })).toBeVisible()
    await expect(painel.getByText('Posição exata')).toBeVisible()
    const caixa = (await painel.boundingBox())!
    if (tela.celular) {
      // folha que sobe de baixo: cola no fim da área central (acima da barra inferior) e ocupa a largura toda
      expect(Math.round(caixa.x)).toBe(0)
      expect(Math.round(caixa.width)).toBe(tela.width)
      const fundoDaArea = await page.evaluate(
        () => document.getElementById('conteudo')!.getBoundingClientRect().bottom,
      )
      expect(
        Math.abs(Math.round(caixa.y + caixa.height) - Math.round(fundoDaArea)),
      ).toBeLessThanOrEqual(2)
    } else {
      expect(Math.round(caixa.width)).toBe(400)
      const esquerdaDaArea = await page.evaluate(
        () => document.getElementById('conteudo')!.getBoundingClientRect().left,
      )
      expect(caixa.x - esquerdaDaArea).toBeLessThan(40)
    }
    expect((await medidas(page)).rolaPagina).toBe(false)
    // as abas do painel ficam inteiras (numa coluna de altura fixa a barra de abas encolhia até sumir)
    const abas = painel.getByRole('tablist', { name: 'Detalhes da empresa' })
    await expect(abas.getByRole('tab', { name: 'Contatos' })).toBeVisible()
    const barraDeAbas = await abas.evaluate((e) => ({ h: e.clientHeight, sh: e.scrollHeight }))
    expect(barraDeAbas.h).toBeGreaterThanOrEqual(36)
    expect(barraDeAbas.sh).toBeLessThanOrEqual(barraDeAbas.h)
    await capturar(page, `mapa-${tela.nome}-painel`)

    // filtros na gaveta
    await page.getByRole('button', { name: /^Filtros/ }).click()
    await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible()
    await capturar(page, `mapa-${tela.nome}-filtros`)
  })
}
