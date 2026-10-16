import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Módulo 6: o funil em Kanban (arrastar e soltar), fechar, reabrir, suspender e o efeito na empresa.

async function entrarComSessao(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  return api
}

const coluna = (page: Page, fase: string) => page.getByRole('region', { name: `Fase ${fase}` })

/** Arrasta pela alça (o dnd-kit precisa de movimento do ponteiro em passos). */
async function arrastar(page: Page, titulo: string, alvo: ReturnType<Page['locator']>) {
  const alca = page.getByRole('button', { name: `Arrastar ${titulo}` })
  const de = (await alca.boundingBox())!
  await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2)
  await page.mouse.down()
  await page.mouse.move(de.x + de.width / 2 + 12, de.y + de.height / 2 + 12, { steps: 4 })
  const para = (await alvo.boundingBox())!
  await page.mouse.move(para.x + para.width / 2, para.y + Math.min(para.height / 2, 60), {
    steps: 12,
  })
  await page.mouse.up()
}

test('oportunidades: criar, arrastar de fase, fechar, reabrir, suspender e conquistar', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1600, height: 900 })
  const api = await entrarComSessao(page, 'op')
  const empresa = (await (
    await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial: 'Mercado das Oportunidades' },
    })
  ).json()) as { id: string }

  // 1. Nova oportunidade: o total aparece na hora; o banco calcula o mesmo
  await page.goto('/oportunidades')
  await expect(page.getByRole('heading', { name: 'Oportunidades', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Nova oportunidade' }).first().click()
  const form = page.getByRole('dialog', { name: 'Nova oportunidade' })
  await form.getByRole('searchbox', { name: 'Buscar empresa' }).fill('oportunidades')
  await form.getByRole('button', { name: /Mercado das Oportunidades/ }).click()
  await form.getByLabel(/Nome da oportunidade/).fill('Contrato anual')
  await form.getByLabel('Valor único (R$)').fill('2000')
  await form.getByLabel('Valor mensal (R$)').fill('500')
  await expect(form.getByText(/Total do contrato:/)).toContainText('8.000,00')
  await form.getByRole('button', { name: 'Criar oportunidade' }).click()
  await expect(page.getByText('Oportunidade criada')).toBeVisible()
  const card = coluna(page, 'Qualificação').getByRole('article', { name: 'Contrato anual' })
  await expect(card).toContainText('8.000,00')
  await expect(card).toContainText('500,00/mês')
  await expect(card).toContainText('Sem previsão')
  await expect(card).toContainText('Sem próxima atividade')

  // 2. Arrastar para Proposta: a probabilidade acompanha a fase
  await arrastar(page, 'Contrato anual', coluna(page, 'Proposta'))
  await expect(page.getByText('Movida para Proposta')).toBeVisible()
  await expect(
    coluna(page, 'Proposta').getByRole('article', { name: 'Contrato anual' }),
  ).toContainText('50%')

  // 2b. Pelo teclado: Espaço levanta a alça, a seta para a esquerda vai para a coluna anterior, Espaço solta
  await page.getByRole('button', { name: 'Arrastar Contrato anual' }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Space')
  await expect(
    coluna(page, 'Diagnóstico').getByRole('article', { name: 'Contrato anual' }),
  ).toBeVisible()
  await arrastar(page, 'Contrato anual', coluna(page, 'Proposta'))
  await expect(
    coluna(page, 'Proposta').getByRole('article', { name: 'Contrato anual' }),
  ).toBeVisible()

  // 3. Arrastar para a zona "Perdida": abre o fechamento, que pede o motivo
  await arrastar(page, 'Contrato anual', page.getByRole('group', { name: /marcar como perdida/ }))
  const fechar = page.getByRole('dialog', { name: 'Fechar oportunidade' })
  await expect(fechar).toBeVisible()
  await fechar.getByRole('button', { name: 'Marcar como perdida' }).click()
  await expect(fechar.getByText('Escolha o motivo.')).toBeVisible()
  await fechar.getByLabel(/Motivo/).selectOption({ index: 1 })
  await fechar.getByRole('button', { name: 'Marcar como perdida' }).click()
  await expect(page.getByText('Oportunidade marcada como perdida')).toBeVisible()
  await expect(page.getByRole('article', { name: 'Contrato anual' })).toHaveCount(0)

  // 4. Na Lista: aparece como Perdida, que parou na fase Proposta; reabrir volta ao Kanban
  await page.getByRole('button', { name: 'Lista' }).click()
  await expect(page.getByRole('table')).toContainText('Parou em Proposta')
  await page.getByRole('button', { name: 'Ações de Contrato anual' }).click()
  await page.getByRole('menuitem', { name: 'Reabrir' }).click()
  await expect(page.getByText('Oportunidade reaberta')).toBeVisible()
  await page.getByRole('button', { name: 'Kanban' }).click()
  await expect(
    coluna(page, 'Proposta').getByRole('article', { name: 'Contrato anual' }),
  ).toBeVisible()

  // 5. Suspender (menu do card): motivo e "retomar em"; a atividade de retomada vai para a agenda
  await page.getByRole('button', { name: 'Ações de Contrato anual' }).click()
  await page.getByRole('menuitem', { name: 'Suspensa' }).click()
  await fechar.getByLabel(/Motivo/).selectOption({ index: 1 })
  await fechar.getByLabel('Retomar em').fill('2031-03-10')
  await fechar.getByRole('button', { name: 'Suspender oportunidade' }).click()
  await expect(page.getByText('Oportunidade suspensa')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Suspensas · 1' })).toBeVisible()
  await page.goto('/atividades')
  await expect(page.getByRole('cell', { name: /^Retomar: Contrato anual/ })).toBeVisible()

  // 6. Reabrir pela janela de suspensas e conquistar: a empresa vira Cliente
  await page.goto('/oportunidades')
  await page.getByRole('button', { name: 'Suspensas · 1' }).click()
  await page
    .getByRole('dialog', { name: 'Oportunidades suspensas' })
    .getByRole('button', { name: 'Reabrir' })
    .click()
  await expect(page.getByText('Oportunidade reaberta')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Ações de Contrato anual' }).click()
  await page.getByRole('menuitem', { name: 'Conquistada' }).click()
  await expect(fechar.getByText(/8\.000,00/)).toBeVisible()
  await fechar.getByRole('button', { name: 'Marcar como conquistada' }).click()
  await expect(page.getByText('Oportunidade conquistada')).toBeVisible()
  await page.goto(`/empresas/${empresa.id}`)
  await expect(page.getByText('Cliente', { exact: true }).first()).toBeVisible()
  // a aba Oportunidades da empresa mostra a conquistada
  await page.getByRole('tab', { name: 'Oportunidades' }).click()
  await expect(page.getByRole('list', { name: 'Oportunidades da empresa' })).toContainText(
    'Contrato anual',
  )
})

test('oportunidades: a página não rola e o quadro rola na horizontal por dentro', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 700 })
  await entrarComSessao(page, 'oplayout')
  await page.goto('/oportunidades')
  const quadro = page.getByRole('region', { name: /Quadro do funil/ })
  await expect(quadro).toBeVisible()
  const medidas = await page.evaluate(() => {
    const e = document.scrollingElement!
    const q = document.querySelector<HTMLElement>('[aria-label^="Quadro do funil"]')!
    return {
      paginaVertical: e.scrollHeight === e.clientHeight,
      paginaHorizontal: e.scrollWidth === e.clientWidth,
      quadroRola: q.scrollWidth > q.clientWidth,
    }
  })
  expect(medidas).toEqual({ paginaVertical: true, paginaHorizontal: true, quadroRola: true })
})
