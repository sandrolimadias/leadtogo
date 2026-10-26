import { expect, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'
import { clienteComAcesso, entrarNoPortal } from './portal-apoio'

// Portal do cliente (Fase 3E): a equipe envia um aviso curto pelo hub; o cliente o vê no sino, abre o link e a equipe
// acompanha entregues e lidos. O cliente ajusta o horário de silêncio, procura algo na busca global, e o limite
// semanal de avisos normais barra o excesso.

test('portal: avisos, preferências, busca e limite semanal', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1366, height: 800 })
  const { api } = await administradorComSessao('portal-avisos')
  expect(
    (
      await api.put('/v1/portal-configuracao', { data: { ativo: true, nome: 'Portal E2E' } })
    ).status(),
  ).toBe(200)
  const a = await clienteComAcesso(api, 'Sérgio Cliente Alves', 'Caldeiraria Alfa Ltda')
  const b = await clienteComAcesso(api, 'Olga de Outra Costa', 'Metalúrgica Beta Ltda')
  const publicacao = await api.post('/v1/portal-publicacoes', {
    data: {
      titulo: 'Novidades da conciliação automática',
      corpo: 'Chegou a conciliação automática de notas.',
      alcance: 'todos',
      situacao: 'publicada',
    },
  })
  expect(publicacao.status(), await publicacao.text()).toBe(201)

  // Os dois entram no portal antes do aviso: só quem tem o acesso ATIVO recebe (convite pendente não recebe)
  const cliente = await entrarNoPortal(browser, a.email)
  await entrarNoPortal(browser, b.email)

  // --- A equipe envia um aviso pelo hub
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  await page.goto('/portal')
  await page.getByRole('tab', { name: 'Avisos' }).click()
  const formulario = page.getByRole('region', { name: 'Novo aviso' })
  await formulario.getByLabel(/Mensagem/).fill('Expediente de sexta termina às 14h')
  await formulario.getByLabel('Link (opcional)').fill('/agenda')
  await expect(page.getByRole('figure', { name: 'Como chega no celular' })).toContainText(
    'Expediente de sexta termina às 14h',
  )
  await formulario.getByRole('button', { name: 'Enviar aviso' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar envio' }).click()
  const lista = page.getByRole('list', { name: 'Avisos' })
  await expect(lista).toContainText('Expediente de sexta termina às 14h')

  // --- O cliente vê no sino e abre o link do aviso
  await cliente.reload()
  await cliente
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: /Notificações/ })
    .click()
  await expect(cliente.getByText('Expediente de sexta termina às 14h')).toBeVisible()
  await cliente.getByRole('button', { name: /Aviso/ }).click()
  await expect(cliente.getByRole('heading', { name: 'Agenda' })).toBeVisible()

  // --- A equipe acompanha: entregues e lidos
  await page.reload()
  await page.getByRole('tab', { name: 'Avisos' }).click()
  await expect(page.getByRole('list', { name: 'Avisos' })).toContainText(
    /Entregues 2 de 2 · Lidos 50%/,
  )

  // --- O cliente ajusta o silêncio e a preferência fica salva
  await cliente
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: /Perfil/ })
    .click()
  await cliente.getByRole('tab', { name: 'Notificações' }).click()
  await cliente.getByRole('switch', { name: 'Silenciar avisos normais' }).check({ force: true })
  await expect(cliente.getByLabel('Das')).toHaveValue('22:00')
  await cliente.getByRole('button', { name: 'Salvar preferências' }).click()
  await expect(cliente.getByText('Preferências salvas')).toBeVisible()
  await cliente.reload()
  await cliente.getByRole('tab', { name: 'Notificações' }).click()
  await expect(cliente.getByRole('switch', { name: 'Silenciar avisos normais' })).toBeChecked()

  // --- A busca global acha a publicação (sem acento)
  const busca = cliente.getByLabel('Buscar no portal')
  await busca.fill('conciliacao')
  await busca.press('Enter')
  await expect(cliente.getByRole('region', { name: 'Publicações' })).toContainText(
    'Novidades da conciliação automática',
  )

  // --- Limite semanal: dois avisos normais a mais (3 de 3) e o terceiro é barrado; o urgente passa
  for (const mensagem of ['Segundo aviso da semana', 'Terceiro aviso da semana']) {
    const r = await api.post('/v1/portal-avisos', { data: { mensagem, alcance: 'todos' } })
    expect(r.status(), await r.text()).toBe(201)
  }
  await page.reload()
  await page.getByRole('tab', { name: 'Avisos' }).click()
  await page
    .getByRole('region', { name: 'Novo aviso' })
    .getByLabel(/Mensagem/)
    .fill('Um a mais')
  await expect(page.getByText(/3 de 3/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar aviso' })).toBeDisabled()
  await page.getByRole('switch', { name: 'Urgente' }).check({ force: true })
  await expect(page.getByRole('button', { name: 'Enviar aviso' })).toBeEnabled()
})
