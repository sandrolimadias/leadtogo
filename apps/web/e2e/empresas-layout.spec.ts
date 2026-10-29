import { expect, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Empresas (29/10/2026): no tablet a grade de filtros não passa do fundo; no celular só a busca fica na
// linha e o botão Filtros abre e fecha a seção; na ficha, as abas não mostram barra de rolagem.
// Capturas em test-results/ (ou em CAPTURAS, se definido) para conferir a olho.

const pasta = process.env['CAPTURAS'] ?? 'test-results'

test('empresas: filtros cabem no tablet, celular com Filtros recolhível e abas da ficha sem rolagem', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const { api } = await administradorComSessao('empresaslayout')
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  const r = await api.post('/v1/carteira/empresas', {
    data: { tipoDocumento: 'nenhum', razaoSocial: 'Empresa do layout' },
  })
  expect(r.status(), await r.text()).toBe(201)
  const { id } = (await r.json()) as { id: string }

  for (const tela of [
    { nome: 'desktop', width: 1366, height: 768 },
    { nome: 'tablet', width: 1024, height: 768 },
    { nome: 'tablet-retrato', width: 820, height: 1180 },
  ]) {
    await test.step(tela.nome, async () => {
      await page.setViewportSize({ width: tela.width, height: tela.height })
      await page.goto('/empresas')
      await expect(page.getByText('Empresa do layout')).toBeVisible()
      // cada filtro fica dentro do quadro que os contém
      const fundo = await page
        .getByRole('textbox', { name: 'Buscar empresas' })
        .evaluate((el) => el.closest('.rounded-lg')!.getBoundingClientRect().right)
      for (const nome of ['Status', 'Cidade', 'Porte', 'Regime tributário']) {
        const caixa = await page.getByRole('combobox', { name: nome }).boundingBox()
        expect(caixa!.x + caixa!.width, nome).toBeLessThanOrEqual(fundo + 0.5)
      }
      await page.screenshot({ path: `${pasta}/empresas-${tela.nome}.png` })
    })
  }

  await test.step('celular', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/empresas')
    await expect(page.getByRole('article', { name: 'Empresa do layout' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveCount(0)
    await page.screenshot({ path: `${pasta}/empresas-celular.png` })
    await page.getByRole('button', { name: 'Filtros' }).click()
    await expect(page.getByRole('combobox', { name: 'Regime tributário' })).toBeVisible()
    await page.screenshot({ path: `${pasta}/empresas-celular-filtros.png`, fullPage: true })
    await page.getByRole('button', { name: 'Fechar filtros' }).click()
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveCount(0)
  })

  await test.step('ficha', async () => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(`/empresas/${id}`)
    const abas = page.getByRole('tablist', { name: 'Seções da empresa' })
    await expect(abas).toBeVisible()
    const rola = await abas.evaluate((el) => ({
      vertical: el.scrollHeight > el.clientHeight,
      horizontal: el.scrollWidth > el.clientWidth,
    }))
    expect(rola).toEqual({ vertical: false, horizontal: false })
    await page.screenshot({ path: `${pasta}/ficha-desktop.png` })
  })
})
