import { expect, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'
import { clienteComAcesso, entrarNoPortal } from './portal-apoio'

// Portal do cliente (Fase 3C): o hub da equipe e a área Documentos do cliente. O envio de arquivo de verdade (Garage e
// ClamAV) é coberto pelos testes de integração da API; este roteiro confere as telas ligadas à API real. Sem o
// antivírus configurado (como no CI), o cadastro responde que o envio ainda não está disponível.

test('portal: documentos (hub da equipe e área do cliente)', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1366, height: 800 })
  const { api } = await administradorComSessao('portal-doc')
  expect(
    (
      await api.put('/v1/portal-configuracao', { data: { ativo: true, nome: 'Portal E2E' } })
    ).status(),
  ).toBe(200)
  const cliente = await clienteComAcesso(api, 'Sérgio Cliente', 'Caldeiraria Doc Ltda')

  // --- A equipe: aba Documentos vazia e o cadastro (sem antivírus no ambiente de teste)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  await page.goto('/portal')
  await page.getByRole('tab', { name: 'Documentos' }).click()
  await expect(page.getByText('Nenhum documento')).toBeVisible()
  await page.getByRole('button', { name: 'Novo documento' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Novo documento' })
  await expect(dialogo.getByRole('button', { name: 'Enviar documento' })).toBeDisabled()
  await dialogo.getByLabel(/Título/).fill('Guia rápido do portal')
  await dialogo.getByLabel(/Arquivo/).setInputFiles({
    name: 'guia.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 teste'),
  })
  await dialogo.getByLabel('Para quem').selectOption('empresas')
  await expect(dialogo.getByRole('button', { name: 'Enviar documento' })).toBeDisabled()
  await dialogo.getByLabel('Para quem').selectOption('todos')
  await dialogo.getByRole('button', { name: 'Enviar documento' }).click()
  await expect(dialogo.getByText(/ainda não está configurado/)).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()

  // --- O cliente: a área Documentos existe no menu e explica que ainda não há arquivos
  const portal = await entrarNoPortal(browser, cliente.email)
  await portal
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: /Documentos/ })
    .click()
  await expect(portal).toHaveURL(/\/documentos$/)
  await expect(portal.getByRole('heading', { name: 'Documentos' })).toBeVisible()
  await expect(portal.getByText('Nenhum documento ainda')).toBeVisible()
  await portal.getByLabel('Buscar documentos').fill('guia')
  await expect(portal.getByText('Nenhum documento encontrado')).toBeVisible()
})
