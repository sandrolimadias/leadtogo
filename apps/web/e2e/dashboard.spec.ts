import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Módulo 7: o Dashboard (visão Minha) com números de verdade, os gráficos (tooltip e clique levando à lista
// filtrada), a conclusão rápida e o layout (a página não rola).

async function entrarComSessao(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  return api
}

test('dashboard: números, clique no gráfico do funil e conclusão rápida', async ({ page }) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const api = await entrarComSessao(page, 'dash')

  // dados: uma empresa com 3 oportunidades (uma vai para Proposta, uma é conquistada, uma perdida)
  const empresa = (await (
    await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial: 'Mercado do Dashboard' },
    })
  ).json()) as { id: string }
  const funis = (await (await api.get('/v1/configuracoes/funis')).json()) as {
    id: string
    padrao: boolean
    fases: { id: string; nome: string }[]
  }[]
  const funil = funis.find((f) => f.padrao)!
  const proposta = funil.fases.find((f) => f.nome === 'Proposta')!.id
  const motivos = (await (await api.get('/v1/configuracoes/motivos')).json()) as {
    id: string
    aplicaA: string[]
  }[]
  const motivoPerda = motivos.find((m) => m.aplicaA.includes('perdido'))!.id
  const criar = async (titulo: string, extra: Record<string, unknown>) =>
    (await (
      await api.post('/v1/carteira/oportunidades', {
        data: { titulo, empresaId: empresa.id, ...extra },
      })
    ).json()) as { id: string }
  const emProposta = await criar('Em proposta', { valorUnico: 1000, valorMensal: 100, meses: 10 })
  await api.post(`/v1/carteira/oportunidades/${emProposta.id}/mover`, {
    data: { faseId: proposta },
  })
  const ganha = await criar('Ganha', { valorMensal: 300, meses: 12 })
  await api.post(`/v1/carteira/oportunidades/${ganha.id}/fechar`, {
    data: { status: 'conquistado', empresaViraCliente: false },
  })
  const perdida = await criar('Perdida', { valorUnico: 500 })
  await api.post(`/v1/carteira/oportunidades/${perdida.id}/fechar`, {
    data: { status: 'perdido', motivoId: motivoPerda },
  })
  // uma atividade de hoje para a conclusão rápida
  const tipos = (await (await api.get('/v1/configuracoes/tipos-atividade')).json()) as {
    id: string
    chaveSistema: string | null
  }[]
  const visita = tipos.find((t) => t.chaveSistema === 'visita')!.id
  const hoje = new Date()
  hoje.setHours(23, 59, 0, 0)
  await api.post('/v1/carteira/atividades', {
    data: {
      tipoAtividadeId: visita,
      titulo: 'Visita de hoje',
      empresaId: empresa.id,
      situacao: 'pendente',
      diaInteiro: true,
      dataInicio: new Date().toISOString(),
    },
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()

  // 1. Os números do mês
  await expect(page.getByRole('region', { name: 'MRR conquistado' })).toContainText('R$ 300,00')
  await expect(page.getByRole('region', { name: 'Taxa de conversão' })).toContainText('50%')
  await expect(page.getByRole('region', { name: 'Taxa de conversão' })).toContainText(
    '1 conquistadas × 1 perdidas',
  )
  await expect(page.getByRole('region', { name: 'Previsão do período' })).toContainText(
    '1 sem previsão',
  )

  // 2. Tooltip do gráfico do funil: valores e o aviso de clique (mouse sobre a barra)
  const funilGrafico = page.getByRole('group', { name: /^Funil Vendas/ })
  const barras = funilGrafico.locator('.recharts-bar-rectangle')
  await expect(barras).toHaveCount(4)
  await barras.nth(2).hover()
  const tooltip = page.getByRole('status').filter({ hasText: 'Clique para ver a lista' })
  await expect(tooltip).toContainText('Proposta')
  await expect(tooltip).toContainText('2.000,00')
  await expect(tooltip).toContainText('Do funil')

  // 3. Clique na barra: Oportunidades do funil, na fase, já filtrada
  await barras.nth(2).click()
  await expect(page).toHaveURL(/\/oportunidades\?.*fase=/)
  await expect(page.getByText(/Filtrando por fase Proposta/)).toBeVisible()
  await expect(page.getByRole('table')).toContainText('Em proposta')
  await expect(page.getByRole('table')).not.toContainText('Ganha')

  // 4. Clique nos motivos de perda: as perdidas daquele motivo no período
  await page.goto('/')
  const motivosGrafico = page.getByRole('group', { name: /^Principais motivos de perda/ })
  await motivosGrafico.locator('.recharts-bar-rectangle').first().click()
  await expect(page).toHaveURL(/grupo=perdas/)
  await expect(page.getByRole('table')).toContainText('Perdida')

  // 5. Carteira por status: clique leva às Empresas com o status
  await page.goto('/')
  await page
    .getByRole('group', { name: /^Carteira por status/ })
    .locator('.recharts-bar-rectangle')
    .first()
    .click()
  await expect(page).toHaveURL(/\/empresas\?.*status=/)

  // 6. Conclusão rápida: o resultado é obrigatório e a atividade sai da lista
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Minhas atividades' })
  await expect(card.getByText('Visita de hoje')).toBeVisible()
  await card.getByRole('button', { name: 'Concluir Visita de hoje' }).click()
  await card.getByRole('button', { name: 'Concluir atividade' }).click()
  await expect(card.getByText('Informe o resultado.')).toBeVisible()
  await card.getByLabel(/Resultado/).fill('Conversa boa, volto na semana que vem.')
  await card.getByRole('button', { name: 'Concluir atividade' }).click()
  await expect(page.getByText('Atividade concluída')).toBeVisible()
  await expect(card.getByText('Visita de hoje')).toHaveCount(0)

  // 7. Trocar o período muda os números (o mês anterior não tem o que o mês atual tem)
  await page.getByRole('button', { name: 'Mês anterior' }).click()
  await expect(page).toHaveURL(/periodo=mes_anterior/)
  await expect(page.getByRole('region', { name: 'MRR conquistado' })).toContainText('R$ 0,00')
})

test('dashboard: tema escuro, cores dos tokens e a página não rola (computador e celular)', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const api = await entrarComSessao(page, 'dashtema')
  await api.post('/v1/carteira/empresas', {
    data: { tipoDocumento: 'nenhum', razaoSocial: 'Empresa do tema escuro' },
  })
  for (const tela of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(tela)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Carteira' })).toBeVisible()
    const medidas = await page.evaluate(() => {
      const e = document.scrollingElement!
      return {
        paginaVertical: e.scrollHeight === e.clientHeight,
        paginaHorizontal: e.scrollWidth === e.clientWidth,
      }
    })
    expect(medidas).toEqual({ paginaVertical: true, paginaHorizontal: true })
  }
  // as barras usam a cor do token, resolvida pelo tema (nunca preto nem transparente)
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/')
  const cor = await page
    .getByRole('group', { name: /^Carteira por status/ })
    .locator('.recharts-bar-rectangle path')
    .first()
    .evaluate((el) => getComputedStyle(el).fill)
  expect(cor).toMatch(/^rgb\(/)
  expect(cor).not.toBe('rgb(0, 0, 0)')
})
