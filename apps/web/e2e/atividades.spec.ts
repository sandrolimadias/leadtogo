import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Módulo 5: registrar, agendar, concluir, cancelar e excluir atividades pela tela, com o efeito na carteira
// (última visita, último contato e tag Visitada) visto na ficha da empresa.

async function entrarComSessao(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  return api
}

const formulario = (page: Page) => page.getByRole('dialog', { name: 'Registrar atividade' })

test('atividades: registrar visita, agendar, concluir, cancelar e excluir', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1366, height: 768 })
  const api = await entrarComSessao(page, 'ativ')
  const criada = (await (
    await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial: 'Mercado das Atividades' },
    })
  ).json()) as { id: string }

  // 1. Nova atividade na ficha: Visita já escolhida, empresa preenchida, situação Realizada
  await page.goto(`/empresas/${criada.id}`)
  await expect(page.getByRole('heading', { name: 'Mercado das Atividades' })).toBeVisible()
  await expect(page.getByText('Nunca').first()).toBeVisible()
  await page.getByRole('button', { name: 'Nova atividade' }).first().click()
  await expect(formulario(page).getByRole('button', { name: /Visita/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(
    formulario(page).getByRole('button', { name: 'Empresa', exact: true }),
  ).toContainText('Mercado das Atividades')
  await formulario(page)
    .getByLabel(/Título/)
    .fill('Visita de apresentação')
  await formulario(page)
    .getByLabel(/Resultado/)
    .fill('Conhecemos o dono e o estoque.')
  await formulario(page).getByRole('button', { name: 'Registrar atividade' }).click()
  await expect(page.getByText('Atividade registrada')).toBeVisible()

  // 2. O efeito na carteira: tag Visitada e última visita "Hoje"
  await expect(page.getByText('Visitada', { exact: true })).toBeVisible()
  await expect(page.getByText('Hoje').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Atividades' }).click()
  const lista = page.getByRole('list', { name: 'Atividades' })
  await expect(lista.getByText('Visita de apresentação')).toBeVisible()
  await expect(lista.getByText('Realizada', { exact: true })).toBeVisible()

  // 3. Cancelar a única visita: a tag sai e a última visita volta a "Nunca"
  await lista.getByRole('button', { name: 'Ações de Visita de apresentação' }).click()
  await page.getByRole('menuitem', { name: 'Cancelar atividade' }).click()
  await page.getByRole('button', { name: 'Cancelar atividade' }).click()
  await expect(page.getByText('Atividade cancelada')).toBeVisible()
  await expect(page.getByText('Visitada', { exact: true })).toHaveCount(0)
  await expect(lista.getByText('Cancelada', { exact: true })).toBeVisible()

  // 4. Agendar a próxima (Pendente) com data futura
  await page.getByRole('button', { name: 'Nova atividade' }).first().click()
  await formulario(page)
    .getByRole('button', { name: /Pendente/ })
    .click()
  await formulario(page)
    .getByLabel(/Título/)
    .fill('Voltar com a proposta')
  await formulario(page)
    .getByLabel(/Data e hora/)
    .fill('2030-10-15T10:00')
  await formulario(page).getByRole('button', { name: 'Agendar atividade' }).click()
  await expect(page.getByText('Atividade registrada')).toBeVisible()
  await expect(lista.getByText('Voltar com a proposta')).toBeVisible()

  // 5. A tela Atividades: aba Agendadas com a contagem; concluir pela lista
  await page.getByRole('link', { name: 'Atividades', exact: true }).click()
  await expect(page).toHaveURL(/\/atividades$/)
  await expect(
    page.getByRole('heading', { name: 'Atividades', exact: true, level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('tab', { name: /Agendadas/ })).toContainText('1')
  await expect(page.getByRole('cell', { name: /^Voltar com a proposta/ })).toBeVisible()
  await page.getByRole('button', { name: 'Ações de Voltar com a proposta' }).click()
  await page.getByRole('menuitem', { name: 'Concluir' }).click()
  const conclusao = page.getByRole('dialog', { name: 'Concluir atividade' })
  await conclusao.getByLabel(/Resultado/).fill('Proposta entregue.')
  await conclusao.getByRole('button', { name: 'Concluir', exact: true }).click()
  await expect(page.getByText('Atividade concluída')).toBeVisible()
  await page.getByRole('tab', { name: /Realizadas/ }).click()
  await expect(page.getByRole('cell', { name: /^Voltar com a proposta/ })).toBeVisible()

  // 6. Excluir
  await page.getByRole('button', { name: 'Ações de Voltar com a proposta' }).click()
  await page.getByRole('menuitem', { name: 'Excluir' }).click()
  await page.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Atividade excluída')).toBeVisible()
  await expect(page.getByRole('cell', { name: /^Voltar com a proposta/ })).toHaveCount(0)
})

test('atividades no celular: o "+" do cabeçalho abre a folha de registro e a página não rola', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarComSessao(page, 'ativcel')
  await page.goto('/atividades')
  await expect(page.getByRole('navigation', { name: 'Navegação do celular' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Navegação do celular' }).getByRole('link', {
      name: 'Atividades',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Registrar atividade' }).first().click()
  await expect(formulario(page)).toBeVisible()
  const semRolagem = await page.evaluate(() => {
    const e = document.scrollingElement!
    return e.scrollHeight === e.clientHeight
  })
  expect(semRolagem).toBe(true)
})
