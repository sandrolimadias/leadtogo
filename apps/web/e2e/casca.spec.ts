import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, emailUnico, limparLimites, linkDoEmail, SENHA } from './ambiente'

test.beforeEach(async () => {
  await limparLimites()
})

const botaoDeEmpresa = (page: Page, nome: string | RegExp) =>
  page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: nome })

async function entrar(page: Page, email: string) {
  await limparLimites() // o login do Better Auth limita 3 por 10 s por IP
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function sair(page: Page) {
  await page.getByRole('button', { name: /^Menu de / }).click()
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login/)
}

/** Uma pessoa (vendedora) que faz parte de DUAS empresas, criada pelo fluxo real de convites. */
async function vendedoraDeDuasEmpresas(page: Page) {
  const a = await administradorComSessao('empA')
  const b = await administradorComSessao('empB')
  const email = emailUnico('duas')

  // convite da A: cria a conta pela tela
  expect((await a.api.post('/v1/convites', { data: { email, papel: 'vendedor' } })).status()).toBe(
    201,
  )
  await page.goto((await linkDoEmail(email)).link)
  await page.getByLabel(/Seu nome/).fill('Vera Vendedora')
  await page.getByLabel('Crie uma senha').fill(SENHA)
  await page.getByLabel(/Li e aceito os termos/).check()
  await page.getByRole('button', { name: 'Aceitar e entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await sair(page)

  // convite da B: ela já tem conta, entra e aceita
  expect((await b.api.post('/v1/convites', { data: { email, papel: 'gestor' } })).status()).toBe(
    201,
  )
  const segundo = await linkDoEmail(email, 20_000, 2)
  await limparLimites()
  await page.goto(segundo.link)
  await page.getByRole('button', { name: 'Entrar para aceitar' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('button', { name: 'Aceitar convite' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await sair(page)
  return { email, a: a.conta.empresa, b: b.conta.empresa }
}

test.describe('casca do app', () => {
  test('várias empresas: seletor no login, lembra a última usada, troca pelo menu e recolhe o menu', async ({
    page,
  }) => {
    const { email, a, b } = await vendedoraDeDuasEmpresas(page)

    // nenhuma usada ainda: o app pede a escolha antes de abrir
    await entrar(page, email)
    await expect(page.getByRole('heading', { name: 'Escolha a empresa' })).toBeVisible()
    await page
      .getByRole('list', { name: 'Suas empresas' })
      .getByRole('button', { name: new RegExp(b) })
      .click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(botaoDeEmpresa(page, new RegExp(b))).toBeVisible()
    await expect(botaoDeEmpresa(page, new RegExp(b))).toContainText('Gestor')

    // o menu lateral recolhe e a preferência sobrevive ao recarregar
    await page.getByRole('button', { name: 'Recolher menu' }).click()
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible()
    await page.getByRole('button', { name: 'Expandir menu' }).click()

    // sai e entra de novo: já abre na B (a última usada), sem seletor
    await sair(page)
    await entrar(page, email)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(botaoDeEmpresa(page, new RegExp(b))).toBeVisible()

    // troca para a A pelo menu: mantém a tela e avisa; o próximo login abre na A
    await page.getByRole('link', { name: 'Empresas' }).click()
    await expect(page.getByRole('heading', { name: 'Empresas' })).toBeVisible()
    await botaoDeEmpresa(page, new RegExp(b)).click()
    await page.getByRole('menuitem', { name: new RegExp(`${a}.*Vendedor`) }).click()
    await expect(page.getByText('Empresa ativa trocada')).toBeVisible()
    await expect(botaoDeEmpresa(page, new RegExp(a))).toBeVisible()
    await expect(page).toHaveURL(/\/empresas$/)
    await sair(page)
    await entrar(page, email)
    await expect(botaoDeEmpresa(page, new RegExp(a))).toBeVisible()
  })

  test('celular: barra inferior, folha de perfil com a troca de empresa e Meu perfil → Segurança', async ({
    page,
  }) => {
    const { email, a, b } = await vendedoraDeDuasEmpresas(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await entrar(page, email)
    await page
      .getByRole('list', { name: 'Suas empresas' })
      .getByRole('button', { name: new RegExp(a) })
      .click()
    const barra = page.getByRole('navigation', { name: 'Navegação do celular' })
    await expect(barra).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0)

    await barra.getByRole('link', { name: 'Funil' }).click()
    await expect(page).toHaveURL(/\/oportunidades$/)

    await page.getByRole('button', { name: 'Abrir perfil' }).click()
    const folha = page.getByRole('dialog', { name: 'Meu perfil' })
    await expect(folha.getByRole('button', { name: new RegExp(a) })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await folha.getByRole('button', { name: new RegExp(b) }).click()
    await expect(page.getByText('Empresa ativa trocada')).toBeVisible()

    await page.getByRole('button', { name: 'Mais' }).click()
    await page
      .getByRole('dialog', { name: 'Meu perfil' })
      .getByRole('link', { name: 'Meu perfil → Segurança' })
      .click()
    await expect(page.getByRole('heading', { name: 'Segurança' })).toBeVisible()
    await expect(page).toHaveURL(/\/perfil\/seguranca$/)
  })
})
