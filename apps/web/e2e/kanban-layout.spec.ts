import { mkdirSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Kanban de Oportunidades (ajustes de 16/10/2026): o quadro ocupa a largura e a altura toda da área central,
// as colunas cabem sem rolagem horizontal e rolam os cards por dentro, qualquer coluna pode ser recolhida
// (e o estado fica na conta), o celular mostra uma coluna por vez, as zonas de fechamento ficam no topo
// (31/10/2026: numa faixa própria, empurrando as colunas para baixo) e
// o funil aceita no máximo 6 fases ativas.

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
  const empresa = (await (
    await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial: 'Mercado do Quadro' },
    })
  ).json()) as { id: string }
  const funis = (await (await api.get('/v1/configuracoes/funis')).json()) as {
    id: string
    padrao: boolean
    fases: { id: string; nome: string }[]
  }[]
  const funil = funis.find((f) => f.padrao)!
  // 4 fases do padrão + 2 = 6 ativas (o máximo)
  for (const nomeDaFase of ['Contrato', 'Pós-venda']) {
    const r = await api.post(`/v1/configuracoes/funis/${funil.id}/fases`, {
      data: { nome: nomeDaFase },
    })
    expect(r.status()).toBe(201)
  }
  const atualizado = (await (await api.get('/v1/configuracoes/funis')).json()) as typeof funis
  const fases = atualizado.find((f) => f.id === funil.id)!.fases
  const criar = async (titulo: string, faseId: string) =>
    api.post('/v1/carteira/oportunidades', {
      data: {
        titulo,
        empresaId: empresa.id,
        faseId,
        valorUnico: 1000,
        valorMensal: 100,
        meses: 12,
      },
    })
  // a 1ª fase fica cheia (força a rolagem dentro da coluna); as outras têm alguns cards
  for (let i = 1; i <= 14; i++) await criar(`Primeira ${i}`, fases[0]!.id)
  for (const [i, f] of fases.slice(1).entries()) await criar(`Da fase ${i + 2}`, f.id)
  return { api, fases, funil }
}

const coluna = (page: Page, fase: string) => page.getByRole('region', { name: `Fase ${fase}` })

test('kanban: largura e altura toda, colunas sem rolagem horizontal e cards rolando por dentro (1920×1080 e 1366×768)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await preparar(page, 'kbl1')
  for (const tela of [
    { width: 1920, height: 1080, nome: '1920x1080' },
    { width: 1366, height: 768, nome: '1366x768' },
  ]) {
    await page.setViewportSize({ width: tela.width, height: tela.height })
    await page.goto('/oportunidades')
    const quadro = page.getByRole('region', { name: /Quadro do funil/ })
    await expect(quadro).toBeVisible()
    await expect(coluna(page, 'Qualificação').getByRole('article').first()).toBeVisible()
    await page.waitForTimeout(500)

    const m = await page.evaluate(() => {
      const e = document.scrollingElement!
      const q = document.querySelector<HTMLElement>('[aria-label^="Quadro do funil"]')!
      const conteudo = document.getElementById('conteudo')!
      const cols = [...q.querySelectorAll<HTMLElement>('[data-coluna]')]
      const caixa = q.getBoundingClientRect()
      const cc = conteudo.getBoundingClientRect()
      const h1 = document.querySelector('h1')!.getBoundingClientRect()
      const primeira = cols[0]!.querySelector<HTMLElement>('.overflow-y-auto')!
      return {
        paginaVertical: e.scrollHeight === e.clientHeight,
        paginaHorizontal: e.scrollWidth === e.clientWidth,
        semRolagemHorizontal: q.scrollWidth <= q.clientWidth,
        seisColunas: cols.length,
        todasDentro: cols.every((c) => {
          const r = c.getBoundingClientRect()
          return r.left >= caixa.left - 1 && r.right <= caixa.right + 1
        }),
        larguras: cols.map((c) => Math.round(c.getBoundingClientRect().width)),
        larguraDoQuadro: Math.round(caixa.width),
        larguraDaAreaCentral: Math.round(cc.width),
        quadroAteOFim: Math.round(cc.bottom - caixa.bottom),
        h1Dentro1440: h1.right - h1.left <= 1440,
        cardsRolamPorDentro: primeira.scrollHeight > primeira.clientHeight,
        areaCentralNaoRola: conteudo.scrollHeight <= conteudo.clientHeight + 1,
      }
    })
    expect(m.paginaVertical, tela.nome).toBe(true)
    expect(m.paginaHorizontal, tela.nome).toBe(true)
    expect(m.semRolagemHorizontal, tela.nome).toBe(true)
    expect(m.seisColunas, tela.nome).toBe(6)
    expect(m.todasDentro, tela.nome).toBe(true)
    // repartem o espaço por igual
    expect(Math.max(...m.larguras) - Math.min(...m.larguras), tela.nome).toBeLessThanOrEqual(2)
    // o quadro usa a largura da área central (menos o espaçamento), sem o teto de 1440 px
    expect(m.larguraDoQuadro, tela.nome).toBeGreaterThanOrEqual(m.larguraDaAreaCentral - 56)
    if (tela.width === 1920) expect(m.larguraDoQuadro).toBeGreaterThan(1440)
    // as colunas descem até o fim da área central e os cards rolam dentro da coluna
    expect(m.quadroAteOFim, tela.nome).toBeLessThanOrEqual(32)
    expect(m.cardsRolamPorDentro, tela.nome).toBe(true)
    expect(m.areaCentralNaoRola, tela.nome).toBe(true)
    await capturar(page, `kanban-${tela.nome}`)
  }
})

test('kanban: recolher uma coluna, o espaço vai para as abertas e o estado fica na conta', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await preparar(page, 'kbl2')
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/oportunidades')
  await expect(coluna(page, 'Diagnóstico')).toBeVisible()
  const antes = (await coluna(page, 'Proposta').boundingBox())!.width

  await page.getByRole('button', { name: 'Recolher a fase Diagnóstico' }).click()
  const faixa = page.getByRole('region', { name: 'Fase Diagnóstico (recolhida)' })
  await expect(faixa).toBeVisible()
  await expect(faixa).toContainText('Diagnóstico')
  await expect(faixa).toContainText('R$')
  expect((await faixa.boundingBox())!.width).toBeLessThan(60)
  // o espaço liberado vai para as abertas, e continua sem rolagem horizontal
  await expect
    .poll(async () => (await coluna(page, 'Proposta').boundingBox())!.width)
    .toBeGreaterThan(antes)
  expect(
    await page.evaluate(() => {
      const q = document.querySelector<HTMLElement>('[aria-label^="Quadro do funil"]')!
      return q.scrollWidth <= q.clientWidth
    }),
  ).toBe(true)
  await capturar(page, 'kanban-1366x768-recolhida')

  // lembrado: sai e entra de novo (a preferência está na conta, não só na tela)
  await page.waitForTimeout(600)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Fase Diagnóstico (recolhida)' })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir a fase Diagnóstico' }).click()
  await expect(coluna(page, 'Diagnóstico')).toBeVisible()
  await page.waitForTimeout(600)
  await page.reload()
  await expect(coluna(page, 'Diagnóstico')).toBeVisible()
})

test('kanban: ao arrastar, as zonas de fechamento aparecem no topo e empurram as colunas para baixo', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await preparar(page, 'kbl3')
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/oportunidades')
  const alca = page.getByRole('button', { name: 'Arrastar Da fase 2' })
  await expect(alca).toBeVisible()
  await page.waitForTimeout(500)
  const de = (await alca.boundingBox())!
  await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2)
  await page.mouse.down()
  await page.mouse.move(de.x + de.width / 2 + 12, de.y + de.height / 2 + 30, { steps: 5 })
  const perdida = page.getByRole('group', { name: 'Soltar aqui para marcar como perdida' })
  await expect(perdida).toBeVisible()
  const zona = (await perdida.boundingBox())!
  // a faixa fica ACIMA do quadro: o cabeçalho das fases (nome, quantidade e soma) continua visível
  const quadro = (await page.getByRole('region', { name: /Quadro do funil/ }).boundingBox())!
  expect(quadro.y).toBeGreaterThanOrEqual(zona.y + zona.height)
  const cabecalho = (await coluna(page, 'Qualificação')
    .getByRole('heading', { name: 'Qualificação' })
    .boundingBox())!
  expect(cabecalho.y).toBeGreaterThanOrEqual(zona.y + zona.height)
  await capturar(page, 'kanban-zonas-no-topo')
  await page.mouse.move(zona.x + zona.width / 2, zona.y + zona.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByRole('dialog', { name: 'Fechar oportunidade' })).toBeVisible()
})

test('kanban no celular: uma coluna por vez, deslizando para o lado, e zonas no topo (390×844)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await preparar(page, 'kbl4')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/oportunidades')
  const quadro = page.getByRole('region', { name: /Quadro do funil/ })
  await expect(quadro).toBeVisible()
  await expect(coluna(page, 'Qualificação')).toBeVisible()
  await page.waitForTimeout(400)

  const medida = () =>
    page.evaluate(() => {
      const e = document.scrollingElement!
      const q = document.querySelector<HTMLElement>('[aria-label^="Quadro do funil"]')!
      const caixa = q.getBoundingClientRect()
      const cols = [...q.querySelectorAll<HTMLElement>('[data-coluna]')]
      return {
        paginaVertical: e.scrollHeight === e.clientHeight,
        paginaHorizontal: e.scrollWidth === e.clientWidth,
        visiveis: cols.filter((c) => {
          const r = c.getBoundingClientRect()
          return r.left >= caixa.left - 2 && r.right <= caixa.right + 2
        }).length,
        largura: Math.round(cols[0]!.getBoundingClientRect().width),
        larguraDoQuadro: Math.round(caixa.width),
        total: cols.length,
      }
    })
  const m = await medida()
  expect(m.paginaVertical).toBe(true)
  expect(m.paginaHorizontal).toBe(true)
  expect(m.total).toBe(6)
  expect(m.visiveis).toBe(1)
  expect(m.largura).toBe(m.larguraDoQuadro)
  const indicador = page.getByRole('group', { name: 'Posição no funil' })
  await expect(indicador).toContainText('1 de 6')
  await capturar(page, 'kanban-390x844-fase-1')

  // deslizar para o lado passa para a coluna seguinte (o encaixe termina na coluna inteira)
  await quadro.evaluate((el) => el.scrollTo({ left: el.clientWidth, behavior: 'instant' }))
  await expect(indicador).toContainText('2 de 6')
  expect((await medida()).visiveis).toBe(1)
  await capturar(page, 'kanban-390x844-fase-2')
  await indicador.getByRole('button', { name: 'Ir para a fase Pós-venda' }).click()
  await expect(indicador).toContainText('6 de 6')

  // sem o botão de recolher; as zonas aparecem no topo ao arrastar pela alça
  await expect(page.getByRole('button', { name: /^Recolher a fase/ })).toHaveCount(0)
  await indicador.getByRole('button', { name: 'Ir para a fase Qualificação' }).click()
  await expect(indicador).toContainText('1 de 6')
  await page.waitForTimeout(500)
  const alca = page.getByRole('button', { name: 'Arrastar Primeira 14' })
  const de = (await alca.boundingBox())!
  await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2)
  await page.mouse.down()
  await page.mouse.move(de.x + de.width / 2 + 12, de.y + de.height / 2 + 30, { steps: 5 })
  const conquistada = page.getByRole('group', { name: 'Soltar aqui para marcar como conquistada' })
  await expect(conquistada).toBeVisible()
  const faixa = (await conquistada.boundingBox())!
  expect((await quadro.boundingBox())!.y).toBeGreaterThanOrEqual(faixa.y + faixa.height)
  await capturar(page, 'kanban-390x844-zonas-no-topo')
  await page.mouse.up()
})

test('funil: o limite é de 6 fases ativas (API 409; inativar libera)', async ({ page }) => {
  const { api } = await administradorComSessao('kbl5')
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  const nomes = ['A', 'B', 'C', 'D', 'E', 'F']
  const criado = await api.post('/v1/configuracoes/funis', {
    data: { nome: 'Seis fases', fases: nomes.map((nome) => ({ nome })) },
  })
  expect(criado.status()).toBe(201)
  const funil = (await criado.json()) as { id: string; fases: { id: string }[] }
  const setima = await api.post(`/v1/configuracoes/funis/${funil.id}/fases`, {
    data: { nome: 'Sétima' },
  })
  expect(setima.status()).toBe(409)
  expect(((await setima.json()) as { erro: string }).erro).toBe('limite_de_fases_ativas')
  // na tela: criar e reativar ficam desligados, com a explicação
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/configuracoes/funis')
  await expect(page.getByRole('button', { name: 'Nova fase em Seis fases' })).toBeDisabled()
  await expect(page.getByText(/já tem 6 fases ativas, o máximo/)).toBeVisible()
  // inativar uma libera a criação (as inativas não contam); reativar com 6 ativas é recusado
  const ultima = funil.fases.at(-1)!.id
  expect(
    (
      await api.patch(`/v1/configuracoes/funis/fases/${ultima}`, { data: { ativo: false } })
    ).status(),
  ).toBe(200)
  const nova = await api.post(`/v1/configuracoes/funis/${funil.id}/fases`, {
    data: { nome: 'Sétima' },
  })
  expect(nova.status()).toBe(201)
  const reativar = await api.patch(`/v1/configuracoes/funis/fases/${ultima}`, {
    data: { ativo: true },
  })
  expect(reativar.status()).toBe(409)
})

test('oportunidades: duplicar pelo menu do card abre a Nova oportunidade preenchida', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await preparar(page, 'kbl6')
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/oportunidades')
  await page.getByRole('button', { name: 'Ações de Da fase 2' }).click()
  await capturar(page, 'kanban-menu-do-card')
  await page.getByRole('menuitem', { name: 'Duplicar' }).click()
  const form = page.getByRole('dialog', { name: 'Duplicar oportunidade' })
  await expect(form.getByLabel(/Nome da oportunidade/)).toHaveValue('Da fase 2 (cópia)')
  await expect(form.getByLabel('Valor único (R$)')).toHaveValue('1000')
  await expect(form.getByLabel('Valor mensal (R$)')).toHaveValue('100')
  await expect(form.getByText('Mercado do Quadro')).toBeVisible()
  await form.getByLabel(/Nome da oportunidade/).fill('Da fase 2 (renovação)')
  await form.getByRole('button', { name: 'Criar oportunidade' }).click()
  await expect(page.getByText('Oportunidade duplicada')).toBeVisible()
  await expect(
    coluna(page, 'Diagnóstico').getByRole('article', { name: 'Da fase 2 (renovação)' }),
  ).toBeVisible()
  await expect(
    coluna(page, 'Diagnóstico').getByRole('article', { name: 'Da fase 2', exact: true }),
  ).toBeVisible()
})
