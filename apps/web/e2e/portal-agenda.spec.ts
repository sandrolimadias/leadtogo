import { expect, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'
import { clienteComAcesso, entrarNoPortal } from './portal-apoio'

// Portal do cliente (Fase 3D): a equipe publica um evento com UMA vaga; o primeiro cliente confirma ("Você vai"), o
// segundo entra na lista de espera, a equipe vê os dois, o primeiro cancela e o segundo é promovido sozinho.

test('portal: agenda (confirmar, lista de espera, cancelar e promoção)', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1366, height: 800 })
  const { api } = await administradorComSessao('portal-agenda')
  expect(
    (
      await api.put('/v1/portal-configuracao', { data: { ativo: true, nome: 'Portal E2E' } })
    ).status(),
  ).toBe(200)
  const a = await clienteComAcesso(api, 'Sérgio Cliente Alves', 'Caldeiraria Alfa Ltda')
  const b = await clienteComAcesso(api, 'Olga de Outra Costa', 'Metalúrgica Beta Ltda')

  // --- A equipe cria o evento pelo hub (rascunho) e publica
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  await page.goto('/portal')
  await page.getByRole('tab', { name: 'Agenda' }).click()
  await page.getByRole('button', { name: 'Novo evento' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Novo evento' })
  await dialogo.getByLabel(/Título/).fill('Treinamento: novo módulo de chamados')
  await dialogo.getByLabel('Local').fill('Auditório da sede')
  const mais = (dias: number, hora: string) => {
    const d = new Date(Date.now() + dias * 86_400_000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${hora}`
  }
  await dialogo.getByLabel(/Início/).fill(mais(7, '18:30'))
  await dialogo.getByLabel(/Fim/).fill(mais(7, '21:00'))
  await dialogo.getByLabel('Vagas totais').fill('1')
  await dialogo.getByRole('button', { name: 'Criar evento' }).click()
  // o rascunho aparece na aba Rascunhos (a tela leva até lá) e ainda não está para o cliente
  await expect(page.getByRole('button', { name: 'Rascunhos (1)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('list', { name: 'Eventos' })).toContainText(
    'Treinamento: novo módulo de chamados',
  )
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByText('Publicado', { exact: true }).first()).toBeVisible()

  // --- O cliente A confirma
  const clienteA = await entrarNoPortal(browser, a.email)
  const painel = clienteA.getByRole('region', { name: 'Próximos eventos' })
  await expect(painel.getByText('Treinamento: novo módulo de chamados')).toBeVisible()
  await expect(painel.getByText('Confirme presença')).toBeVisible()
  await clienteA
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: /Agenda/ })
    .click()
  const cartaoA = clienteA.getByRole('article', { name: 'Treinamento: novo módulo de chamados' })
  await expect(cartaoA).toContainText('1 vaga restante')
  await cartaoA.getByRole('button', { name: 'Confirmar presença' }).click()
  await expect(cartaoA.getByText('Você vai')).toBeVisible()
  await expect(cartaoA).toContainText('Sem vagas')
  await expect(cartaoA.getByRole('link', { name: /Adicionar à agenda/ })).toHaveAttribute(
    'href',
    /\/ics$/,
  )

  // --- O cliente B: lotado, entra na lista de espera
  const clienteB = await entrarNoPortal(browser, b.email)
  await clienteB
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: /Agenda/ })
    .click()
  const cartaoB = clienteB.getByRole('article', { name: 'Treinamento: novo módulo de chamados' })
  await expect(cartaoB.getByText('Lotado · lista de espera')).toBeVisible()
  await cartaoB.getByRole('button', { name: 'Entrar na lista de espera' }).click()
  await expect(cartaoB.getByText('Na lista de espera')).toBeVisible()
  // ninguém vê o nome do outro
  await expect(clienteB.getByText(/Sérgio/)).toHaveCount(0)

  // --- A equipe vê os dois
  await page.reload()
  await page.getByRole('tab', { name: 'Agenda' }).click()
  await page
    .getByRole('list', { name: 'Eventos' })
    .getByText('Treinamento: novo módulo de chamados')
    .click()
  await expect(
    page.getByRole('list', { name: 'Confirmados' }).getByText('Sérgio Cliente Alves'),
  ).toBeVisible()
  const fila = page.getByRole('list', { name: 'Lista de espera' })
  await expect(fila.getByText('Olga de Outra Costa')).toBeVisible()
  await expect(fila.getByText('1º')).toBeVisible()

  // --- O cliente A cancela: o B é promovido sozinho e a equipe vê a troca
  await cartaoA.getByRole('button', { name: 'Cancelar presença' }).click()
  // a vaga que abriu já foi para o B: para o A o evento volta a ficar lotado
  await expect(cartaoA.getByText('Lotado · lista de espera')).toBeVisible()
  await clienteB.reload()
  await expect(
    clienteB
      .getByRole('article', { name: 'Treinamento: novo módulo de chamados' })
      .getByText('Você vai'),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Agenda' }).click()
  await page
    .getByRole('list', { name: 'Eventos' })
    .getByText('Treinamento: novo módulo de chamados')
    .click()
  await expect(
    page.getByRole('list', { name: 'Confirmados' }).getByText('Olga de Outra Costa'),
  ).toBeVisible()
  await expect(page.getByText('Ninguém esperando.')).toBeVisible()
})
