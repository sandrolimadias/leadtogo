import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Fase 2: o chamado percorre a central (abrir, assumir, conversar, nota interna, resolver), as métricas
// enxergam o que aconteceu e as configurações (áreas, triagem, expediente) abrem para quem administra.

async function entrarComSessao(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  return api
}

test('chamado: abre, assume, conversa com nota interna separada, resolve e entra nas métricas', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1366, height: 768 })
  await entrarComSessao(page, 'chamados')

  // 1. Abre o chamado pela lista; sem triagem ligada, ele cai direto na área
  await page.goto('/chamados')
  await page.getByRole('button', { name: 'Abrir chamado' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Abrir chamado' })
  await dialogo.getByLabel(/^Assunto/).fill('Revisar contrato da Aurora')
  await dialogo.getByLabel('O que está acontecendo').fill('Preciso da revisão até sexta.')
  await dialogo.getByLabel('Área').selectOption({ label: 'Jurídico' })
  await dialogo.getByRole('button', { name: 'Abrir chamado' }).click()
  await expect(page).toHaveURL(/\/chamados\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: /Revisar contrato da Aurora/ })).toBeVisible()
  await expect(page.getByText('Pendente').first()).toBeVisible()

  // 2. Assume e responde na conversa
  await page.getByRole('button', { name: 'Assumir' }).click()
  await expect(page.getByText('Em atendimento').first()).toBeVisible()
  await page.getByRole('textbox', { name: 'Responder' }).fill('Recebi, começo hoje.')
  await page.getByRole('button', { name: 'Enviar' }).click()
  const conversa = page.getByRole('region', { name: 'Conversa' })
  await expect(conversa.getByText('Recebi, começo hoje.')).toBeVisible()

  // 3. A nota interna fica à parte, nunca na conversa
  await page.getByLabel('Nova nota interna').fill('Cliente costuma atrasar a documentação.')
  await page.getByRole('button', { name: 'Salvar nota' }).click()
  const notas = page.getByRole('region', { name: 'Notas internas' })
  await expect(notas.getByText('Cliente costuma atrasar a documentação.')).toBeVisible()
  await expect(conversa.getByText('Cliente costuma atrasar a documentação.')).toHaveCount(0)

  // 4. Resolve
  await page.getByLabel('Mudar o estado').selectOption({ label: 'Resolvido' })
  await expect(page.getByText('Resolvido').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible()

  // 5. A lista mostra o chamado e as métricas o contam
  await page.goto('/chamados')
  await page.getByRole('tab', { name: /Todos/ }).click()
  await expect(page.getByRole('link', { name: /Revisar contrato da Aurora/ })).toBeVisible()
  await page.getByRole('link', { name: 'Métricas' }).click()
  await expect(page.getByRole('heading', { name: 'Métricas dos chamados' })).toBeVisible()
  const porArea = page.getByRole('region', { name: 'Por área' })
  await expect(porArea.getByRole('rowheader', { name: 'Jurídico' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Exportar CSV/ })).toBeVisible()
})

test('configurações dos chamados: áreas padrão, triagem desligada e expediente de segunda a sexta', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await entrarComSessao(page, 'chamados-config')

  await page.goto('/configuracoes/chamados')
  const areas = page.getByRole('list', { name: 'Áreas' })
  for (const nome of ['Jurídico', 'Financeiro', 'Comercial', 'Administrativo']) {
    await expect(areas.getByRole('listitem', { name: nome })).toBeVisible()
  }

  await page.getByRole('tab', { name: 'Triagem' }).click()
  await expect(
    page.getByRole('form', { name: 'Triagem' }).getByRole('switch', { name: 'Triagem ligada' }),
  ).not.toBeChecked()

  await page.getByRole('tab', { name: 'Expediente e feriados' }).click()
  await expect(page.getByLabel('Segunda-feira: início')).toHaveValue('08:00')
  await expect(
    page.getByRole('listitem', { name: 'Sábado' }).getByText('Sem expediente'),
  ).toBeVisible()
  await expect(page.getByText('25/12 (todo ano)')).toBeVisible()
})
