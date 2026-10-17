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

async function preparar(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  const grupos = (await (await api.get('/v1/configuracoes/tag-grupos')).json()) as {
    tags: { id: string; chaveSistema: string | null }[]
  }[]
  const cliente = grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === 'cliente')!
  const pontos = [
    ['Mercado do Centro', -20.3, -40.3],
    ['Padaria da Praia', -20.31, -40.29],
    ['Oficina Norte', -20.29, -40.31],
  ] as const
  for (const [razaoSocial, latitude, longitude] of pontos) {
    const r = await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial, statusTagId: cliente.id },
    })
    const { id } = (await r.json()) as { id: string }
    const p = await api.post(`/v1/geolocalizacao/empresas/${id}/posicao`, {
      data: { latitude, longitude },
    })
    expect(p.status()).toBe(200)
  }
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
    await preparar(page, `mapa${tela.width}`)
    await page.setViewportSize({ width: tela.width, height: tela.height })
    await page.goto('/mapa')
    await expect(page.getByRole('application', { name: 'Mapa das empresas' })).toBeVisible()
    const grupo = page.getByRole('group', { name: 'Status das empresas' })
    await expect(grupo.getByRole('button', { name: /^Cliente \d/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // os pins são botões DOM sobre o mapa (WebGL no Chromium sem GPU: pode demorar)
    const pin = page.getByRole('button', { name: /Mercado do Centro/ }).first()
    await expect(pin).toBeVisible({ timeout: 30_000 })
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
    await capturar(page, `mapa-${tela.nome}-pins`)

    await pin.click()
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
    await capturar(page, `mapa-${tela.nome}-painel`)

    // filtros na gaveta
    await page.getByRole('button', { name: /^Filtros/ }).click()
    await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible()
    await capturar(page, `mapa-${tela.nome}-filtros`)
  })
}
