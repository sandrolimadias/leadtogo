import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Regra de layout (docs/design_system.md, "Layout e rolagem"): a página nunca rola; menu lateral e barra do
// topo ficam parados; só a área central (#conteudo) rola, com uma única barra; o cabeçalho das colunas
// gruda no topo dela; o conteúdo tem no máximo 1440 px e fica centralizado.

const TELAS = [
  { nome: '1920x1080', width: 1920, height: 1080, celular: false },
  { nome: '1366x768', width: 1366, height: 768, celular: false },
  { nome: '390x844', width: 390, height: 844, celular: true },
] as const

const caixa = (page: Page, seletor: string) =>
  page
    .locator(seletor)
    .first()
    .evaluate((el) => {
      const { x, y, width, height } = el.getBoundingClientRect()
      return { x, y, width, height }
    })

test('layout: a página não rola, menu e topo ficam parados e só a área central rola', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ colorScheme: 'dark' })
  // administrador com 2FA e sessão aberta pela API; a página herda os cookies dessa sessão
  const { api } = await administradorComSessao('layout')
  await page.context().addCookies((await api.storageState()).cookies)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // carteira com mais linhas do que cabem em qualquer janela
  await limparLimites()
  for (let i = 1; i <= 30; i += 1) {
    const r = await api.post('/v1/carteira/empresas', {
      data: {
        tipoDocumento: 'nenhum',
        razaoSocial: `Empresa de layout ${String(i).padStart(2, '0')}`,
      },
    })
    expect(r.status(), await r.text()).toBe(201)
  }

  for (const tela of TELAS) {
    await test.step(tela.nome, async () => {
      await page.setViewportSize({ width: tela.width, height: tela.height })
      await page.goto('/empresas')
      await expect(page.getByText('Empresa de layout 01')).toBeVisible()
      const fixos = tela.celular
        ? ['header', 'nav[aria-label="Navegação do celular"]']
        : ['nav[aria-label="Principal"]', 'header']

      // a) a janela não rola, nem na horizontal
      const pagina = () =>
        page.evaluate(() => {
          const e = document.scrollingElement!
          return {
            alturaOk: e.scrollHeight === e.clientHeight,
            larguraOk: e.scrollWidth === e.clientWidth,
          }
        })
      expect(await pagina()).toEqual({ alturaOk: true, larguraOk: true })

      // c) uma única barra de rolagem vertical: a da área central
      const rolaveis = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => {
            const o = getComputedStyle(el).overflowY
            return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1
          })
          .map((el) => el.id || el.tagName),
      )
      expect(rolaveis).toEqual(['conteudo'])

      // b) menu e topo parados depois de rolar a área central até o fim
      const antes = await Promise.all(fixos.map((s) => caixa(page, s)))
      const conteudo = page.locator('#conteudo')
      await conteudo.evaluate((el) => el.scrollTo(0, el.scrollHeight))
      const depois = await Promise.all(fixos.map((s) => caixa(page, s)))
      expect(depois).toEqual(antes)
      expect(await pagina()).toEqual({ alturaOk: true, larguraOk: true })

      // d) o cabeçalho das colunas grudado no topo da área central (a tabela só existe fora do celular)
      await conteudo.evaluate((el) => el.scrollTo(0, (el.scrollHeight - el.clientHeight) / 2))
      if (!tela.celular) {
        const topoDaArea = (await caixa(page, '#conteudo')).y
        const cabecalho = page.getByRole('columnheader').first()
        await expect(cabecalho).toBeVisible()
        const topo = (await cabecalho.boundingBox())!.y
        expect(Math.abs(topo - topoDaArea)).toBeLessThanOrEqual(1)
      }

      // e) conteúdo com no máximo 1440 px, centralizado
      const medidas = await page.evaluate(() => {
        const area = document.querySelector<HTMLElement>('#conteudo')!
        const miolo = area.firstElementChild!.getBoundingClientRect()
        const a = area.getBoundingClientRect()
        return {
          largura: Math.round(miolo.width),
          esquerda: Math.round(miolo.left - a.left),
          direita: Math.round(a.left + area.clientWidth - miolo.right),
          disponivel: area.clientWidth,
        }
      })
      expect(medidas.largura).toBe(Math.min(1440, medidas.disponivel))
      expect(Math.abs(medidas.esquerda - medidas.direita)).toBeLessThanOrEqual(1)

      await page.screenshot({ path: `test-results/layout-${tela.nome}.png` })
    })
  }
})
