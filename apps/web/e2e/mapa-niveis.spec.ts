import { ZOOM_DOS_NIVEIS_DO_MAPA } from '@leadtogo/shared'
import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Navegação do Mapa por níveis (decisões do Ale, 22/10/2026): de longe, uma bolha por MUNICÍPIO; aproximando, uma
// por BAIRRO; perto, os PINS. Clicar numa bolha aproxima até as empresas dela e mostra o nível seguinte; clicar
// numa empresa abre o painel e NÃO muda o zoom. O WebGL do Chromium sem GPU é lento: as esperas são folgadas.

/** O pedaço do mapa do MapLibre que o teste usa (exposto no contêiner, como em mapa-layout.spec.ts). */
interface MapaTeste {
  getZoom: () => number
  queryRenderedFeatures: (o: { layers: string[] }) => { properties: Record<string, unknown> }[]
  project: (c: [number, number]) => { x: number; y: number }
  getContainer: () => HTMLElement
}

function noMapa<R>(page: Page, fn: (mapa: MapaTeste) => R): Promise<R | null> {
  return page.evaluate((corpo) => {
    const contenedor = document.querySelector('[aria-label="Mapa das empresas"]') as unknown as {
      __mapa?: unknown
    } | null
    const mapa = contenedor?.__mapa
    if (!mapa) return null
    try {
      // o corpo da função vem de `fn.toString()` (código do próprio teste), só para ele rodar dentro da página
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return (new Function('mapa', `return (${corpo})(mapa)`) as (m: unknown) => unknown)(mapa)
    } catch {
      return null
    }
  }, fn.toString()) as Promise<R | null>
}

async function preparar(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  const grupos = (await (await api.get('/v1/configuracoes/tag-grupos')).json()) as {
    tags: { id: string; chaveSistema: string | null }[]
  }[]
  const cliente = grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === 'cliente')!
  const empresas = [
    ['Mercado do Centro', -20.3, -40.3, 3205309, 'Centro'],
    ['Padaria da Praia', -20.15, -40.15, 3205309, 'Jd. Camburi'],
    ['Oficina Norte', -20.151, -40.151, 3205309, 'JARDIM CAMBURÍ'],
    ['Loja da Serra', -20.13, -40.3, 3205002, 'Centro'],
  ] as const
  for (const [razaoSocial, latitude, longitude, municipioCodigo, bairro] of empresas) {
    const r = await api.post('/v1/carteira/empresas', {
      data: {
        tipoDocumento: 'nenhum',
        razaoSocial,
        statusTagId: cliente.id,
        endereco: { municipioCodigo, bairro },
      },
    })
    const { id } = (await r.json()) as { id: string }
    const p = await api.post(`/v1/geolocalizacao/empresas/${id}/posicao`, {
      data: { latitude, longitude },
    })
    expect(p.status()).toBe(200)
  }
}

for (const tela of [
  { width: 1366, height: 768, nome: '1366x768' },
  { width: 390, height: 844, nome: '390x844' },
]) {
  test(`mapa ${tela.nome}: município → bairros → pins; clicar na empresa abre o painel sem mudar o zoom`, async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await preparar(page, `niveis${tela.width}`)
    await page.setViewportSize({ width: tela.width, height: tela.height })
    await page.goto('/mapa')
    await expect(page.getByRole('application', { name: 'Mapa das empresas' })).toBeVisible()

    const bolhas = () =>
      noMapa(page, (mapa) =>
        mapa
          .queryRenderedFeatures({ layers: ['bolhas-circulos'] })
          .map((f) => String(f.properties['texto']))
          .sort(),
      )
    const zoom = async () => (await noMapa(page, (mapa) => mapa.getZoom())) ?? 0
    // clica no centro de uma bolha pelo texto (o total de empresas dela)
    const clicar = async (texto: string) => {
      const ponto = await page.evaluate((t) => {
        const contenedor = document.querySelector(
          '[aria-label="Mapa das empresas"]',
        ) as unknown as {
          __mapa: {
            queryRenderedFeatures: (o: { layers: string[] }) => {
              properties: Record<string, unknown>
              geometry: { coordinates: [number, number] }
            }[]
            project: (c: [number, number]) => { x: number; y: number }
            getContainer: () => HTMLElement
          }
        }
        const mapa = contenedor.__mapa
        const f = mapa
          .queryRenderedFeatures({ layers: ['bolhas-circulos'] })
          .find((x) => x.properties['texto'] === t)
        if (!f) return null
        const c = mapa.getContainer().getBoundingClientRect()
        const p = mapa.project(f.geometry.coordinates)
        return { x: c.left + p.x, y: c.top + p.y }
      }, texto)
      expect(ponto, `bolha "${texto}" visível`).not.toBeNull()
      await page.mouse.click(ponto!.x, ponto!.y)
    }
    const { municipioAte, bairroAte } = ZOOM_DOS_NIVEIS_DO_MAPA

    // 1) de longe: uma bolha por município, Vitória (3) e Serra (1)
    await expect.poll(bolhas, { timeout: 30_000 }).toEqual(['1', '3'])
    expect(await zoom()).toBeLessThan(municipioAte)

    // 2) clicar em Vitória: aproxima e vira bolhas de BAIRRO (Camburi 2, Centro 1); ainda sem pins
    await clicar('3')
    await expect
      .poll(async () => (await zoom()) >= municipioAte && (await zoom()) < bairroAte, {
        timeout: 30_000,
      })
      .toBe(true)
    // Camburi (2, as duas grafias juntas) e o Centro de Vitória (1); a Serra, que cabe na tela, mostra a dela (1)
    await expect.poll(bolhas, { timeout: 30_000 }).toEqual(['1', '1', '2'])
    expect(
      await noMapa(page, (mapa) => mapa.queryRenderedFeatures({ layers: ['pins'] }).length),
    ).toBe(0)

    // 3) clicar no Jardim Camburi (duas grafias juntas): aproxima e vira PINS
    await clicar('2')
    await expect.poll(async () => (await zoom()) >= bairroAte, { timeout: 30_000 }).toBe(true)
    await expect
      .poll(
        () =>
          noMapa(page, (mapa) =>
            mapa.queryRenderedFeatures({ layers: ['pins'] }).map((f) => f.properties['id']),
          ).then((ids) => (ids ?? []).length),
        { timeout: 30_000 },
      )
      .toBe(2)
    expect(await bolhas()).toEqual([])

    // 4) clicar num pin: abre o painel e o zoom NÃO muda
    await page.waitForTimeout(1500)
    const antes = await zoom()
    const pin = await noMapa(page, (mapa) => {
      const c = mapa.getContainer().getBoundingClientRect()
      const p = mapa.project([-40.15, -20.15])
      return { x: c.left + p.x, y: c.top + p.y - 12 }
    })
    await page.mouse.click(pin!.x, pin!.y)
    const painel = page.getByRole('complementary', { name: 'Empresa selecionada' })
    await expect(painel.getByRole('heading', { name: 'Padaria da Praia' })).toBeVisible()
    await page.waitForTimeout(1500)
    expect(await zoom()).toBeCloseTo(antes, 3)

    // 5) o painel (à esquerda no desktop, embaixo no celular) não esconde o pin: se escondesse, o mapa deslizou o
    // mínimo para mostrá-lo, sem mudar o zoom
    const depois = await noMapa(page, (mapa) => {
      const c = mapa.getContainer().getBoundingClientRect()
      const p = mapa.project([-40.15, -20.15])
      return { x: c.left + p.x, y: c.top + p.y }
    })
    const caixa = (await painel.boundingBox())!
    const cruza =
      depois!.x + 20 > caixa.x &&
      depois!.x - 20 < caixa.x + caixa.width &&
      depois!.y + 6 > caixa.y &&
      depois!.y - 40 < caixa.y + caixa.height
    expect(cruza, 'o pin fica visível ao lado do painel').toBe(false)
  })
}
