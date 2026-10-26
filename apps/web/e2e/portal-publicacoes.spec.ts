import { type APIRequestContext, type Browser, expect, test } from '@playwright/test'

import { administradorComSessao, emailUnico, limparLimites, linkDoEmail } from './ambiente'

// Portal do cliente (Fase 3B): a equipe publica um comunicado; dois clientes de empresas diferentes leem, reagem e
// comentam; um denuncia o comentário do outro; a equipe oculta; o autor continua vendo o aviso, o outro não.

async function clienteComAcesso(api: APIRequestContext, nome: string, empresa: string) {
  const empresaCriada = (await (
    await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial: empresa },
    })
  ).json()) as { id: string }
  const email = emailUnico('cliente')
  const contato = (await (
    await api.post('/v1/carteira/contatos', {
      data: {
        nome,
        emails: [{ email, principal: true }],
        vinculo: { empresaId: empresaCriada.id, cargo: 'Compras', principal: true },
      },
    })
  ).json()) as { id: string }
  const r = await api.post('/v1/portal-acessos', {
    data: { contatoId: contato.id, empresaClienteId: empresaCriada.id, papel: 'responsavel' },
  })
  expect(r.status(), await r.text()).toBe(201)
  return { email }
}

async function entrarNoPortal(browser: Browser, email: string) {
  const contexto = await browser.newContext({ locale: 'pt-BR' })
  const pagina = await contexto.newPage()
  await pagina.setViewportSize({ width: 1280, height: 900 })
  await pagina.goto((await linkDoEmail(email)).link)
  await pagina.getByLabel(/Li e aceito o aviso de privacidade/).check()
  await pagina.getByRole('button', { name: 'Confirmar acesso' }).click()
  await expect(pagina.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible()
  return pagina
}

test('portal: publicação, reações, comentário, denúncia e moderação', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1366, height: 800 })
  const { api } = await administradorComSessao('portal-pub')
  expect(
    (
      await api.put('/v1/portal-configuracao', { data: { ativo: true, nome: 'Portal E2E' } })
    ).status(),
  ).toBe(200)
  const a = await clienteComAcesso(api, 'Sérgio Cliente Alves', 'Caldeiraria Alfa Ltda')
  const b = await clienteComAcesso(api, 'Olga de Outra Costa', 'Metalúrgica Beta Ltda')

  // --- A equipe publica pelo hub
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  await page.goto('/portal')
  await page.getByRole('tab', { name: /Publicações/ }).click()
  await page.getByRole('button', { name: 'Nova publicação' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Nova publicação' })
  await dialogo.getByLabel(/Título/).fill('Expediente reduzido na sexta')
  await dialogo.getByLabel(/Texto/).fill('Na **sexta** fechamos às 14h. <b>Sem HTML</b>.')
  await dialogo.getByRole('button', { name: 'Pré-visualizar' }).click()
  await expect(
    dialogo.getByRole('region', { name: 'Pré-visualização' }).locator('strong'),
  ).toHaveText('sexta')
  await dialogo.getByLabel('Quando').selectOption('publicada')
  await dialogo.getByRole('button', { name: 'Publicar' }).click()
  await expect(
    page.getByRole('list', { name: 'Publicações' }).getByText('Expediente reduzido na sexta'),
  ).toBeVisible()

  // --- O cliente A lê (HTML aparece como texto), curte e comenta
  const clienteA = await entrarNoPortal(browser, a.email)
  const cartaoA = clienteA.getByRole('article', { name: 'Expediente reduzido na sexta' })
  await expect(cartaoA).toBeVisible()
  await expect(cartaoA.locator('strong')).toHaveText('sexta')
  await expect(cartaoA.locator('b')).toHaveCount(0)
  await expect(cartaoA).toContainText('<b>Sem HTML</b>')
  await cartaoA.getByRole('button', { name: /Curtir/ }).click()
  await expect(cartaoA.getByRole('button', { name: /Curtir/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await cartaoA.getByRole('button', { name: /0 comentários/ }).click()
  await cartaoA.getByLabel('Escreva um comentário').fill('Compre empilhadeiras no privado!')
  await cartaoA.getByRole('button', { name: 'Comentar' }).click()
  await expect(cartaoA.getByText('Compre empilhadeiras no privado!')).toBeVisible()

  // --- O cliente B: o total soma as empresas, o comentário mostra só "Nome S." e ele denuncia
  const clienteB = await entrarNoPortal(browser, b.email)
  const cartaoB = clienteB.getByRole('article', { name: 'Expediente reduzido na sexta' })
  await expect(cartaoB.getByRole('button', { name: /Curtir/ })).toContainText('1')
  await cartaoB.getByRole('button', { name: /Curtir/ }).click()
  await expect(cartaoB.getByRole('button', { name: /Curtir/ })).toContainText('2')
  await cartaoB.getByRole('button', { name: /1 comentário/ }).click()
  await expect(cartaoB.getByText('Sérgio A.')).toBeVisible()
  await expect(cartaoB.getByText(/Sérgio Cliente Alves|Caldeiraria Alfa/)).toHaveCount(0)
  await cartaoB.getByRole('button', { name: /Denunciar/ }).click()
  const denuncia = clienteB.getByRole('dialog', { name: 'Denunciar comentário' })
  await denuncia.getByLabel('Propaganda ou spam').check()
  await denuncia.getByRole('button', { name: 'Enviar denúncia' }).click()
  await expect(cartaoB.getByText('Você denunciou este comentário.')).toBeVisible()

  // --- A equipe vê a denúncia e oculta o comentário
  await page.reload()
  await page.getByRole('tab', { name: /Publicações/ }).click()
  await expect(page.getByText('1 comentário denunciado aguarda análise')).toBeVisible()
  const moderacao = page.getByRole('list', { name: 'Comentários da publicação' })
  await expect(moderacao.getByText(/Propaganda ou spam · 1 denúncia/)).toBeVisible()
  await expect(moderacao.getByText(/Caldeiraria Alfa Ltda/)).toBeVisible()
  await moderacao.getByRole('button', { name: 'Ocultar' }).click()
  await page
    .getByRole('dialog', { name: 'Ocultar comentário' })
    .getByLabel(/Motivo/)
    .fill('Propaganda')
  await page
    .getByRole('dialog', { name: 'Ocultar comentário' })
    .getByRole('button', { name: 'Ocultar' })
    .click()
  await expect(page.getByText('Oculto', { exact: true })).toBeVisible()

  // --- B não vê mais; A continua vendo, com o motivo
  await clienteB.reload()
  await clienteB
    .getByRole('article', { name: 'Expediente reduzido na sexta' })
    .getByRole('button', { name: /0 comentários/ })
    .click()
  await expect(clienteB.getByText('Compre empilhadeiras no privado!')).toHaveCount(0)
  await clienteA.reload()
  await clienteA
    .getByRole('article', { name: 'Expediente reduzido na sexta' })
    .getByRole('button', { name: /comentário/ })
    .click()
  await expect(clienteA.getByText('A equipe ocultou este comentário: só você o vê.')).toBeVisible()
  await expect(clienteA.getByText(/Motivo: Propaganda/)).toBeVisible()
})
