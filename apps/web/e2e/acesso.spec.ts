import { expect, type Page, test } from '@playwright/test'

import {
  administradorComSessao,
  codigoValido,
  criarAdministrador,
  emailUnico,
  limparLimites,
  linkDoEmail,
  quantosEmails,
  SENHA,
} from './ambiente'
import { URL_WEB } from '../playwright.config'

test.beforeEach(async () => {
  await limparLimites()
})

/** Encerra a sessão pelo menu do usuário (desktop). */
async function sair(page: Page) {
  await page.getByRole('button', { name: /^Menu de / }).click()
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login/)
}

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

/** Digita um código de 6 dígitos nos campos do CampoDeCodigo (o foco anda sozinho). */
async function digitar(page: Page, codigo: string) {
  await page.getByLabel('Dígito 1').click()
  await page.keyboard.type(codigo)
}

test.describe('Login e 2FA', () => {
  test('administrador entra, é obrigado a ativar o 2FA, guarda os códigos e depois entra com o código', async ({
    page,
  }) => {
    const conta = await criarAdministrador('2fa')

    await entrar(page, conta.email, conta.senha)
    // a casca está bloqueada até ativar
    await expect(page).toHaveURL(/\/ativar-2fa$/)
    await page.goto('/')
    await expect(page).toHaveURL(/\/ativar-2fa$/)

    await page.getByLabel('Senha', { exact: true }).fill(conta.senha)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('heading', { name: 'Leia o QR code' })).toBeVisible()
    await expect(page.getByAltText('QR code para o app autenticador')).toBeVisible()
    const chave = (await page.getByTestId('chave-manual').textContent())?.trim() ?? ''
    expect(chave).toMatch(/^[A-Z2-7]{16,}$/)

    // código errado primeiro
    await digitar(page, '000000')
    await page.getByRole('button', { name: 'Ativar verificação' }).click()
    await expect(page.getByText('Código incorreto ou vencido.')).toBeVisible()
    await digitar(page, await codigoValido(chave))
    await page.getByRole('button', { name: 'Ativar verificação' }).click()

    await expect(
      page.getByRole('heading', { name: 'Guarde seus códigos de recuperação' }),
    ).toBeVisible()
    const codigos = await page
      .getByRole('list', { name: 'Códigos de recuperação' })
      .getByRole('listitem')
      .allTextContents()
    expect(codigos.length).toBeGreaterThanOrEqual(5)
    await page.getByLabel('Guardei meus códigos de recuperação').check()
    await page.getByRole('button', { name: 'Concluir' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // sai e entra de novo: agora pede o código
    await sair(page)
    await page.context().clearCookies({ name: /two_factor|trust/ })
    await entrar(page, conta.email, conta.senha)
    await expect(page).toHaveURL(/\/verificacao/)
    await digitar(page, await codigoValido(chave))
    await page.getByLabel('Confiar neste aparelho por 30 dias').uncheck()
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // e com um código de recuperação (uso único)
    await sair(page)
    await entrar(page, conta.email, conta.senha)
    await expect(page).toHaveURL(/\/verificacao/)
    await page.getByRole('button', { name: 'Usar código de recuperação' }).click()
    await page.getByLabel('Código de recuperação').fill(codigos[0]!.trim())
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('e-mail ou senha errados: mensagem genérica, igual para conta inexistente', async ({
    page,
  }) => {
    const conta = await criarAdministrador('erro')
    await entrar(page, conta.email, 'senha-errada-123')
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha não conferem')
    const textoComContaReal = await page.getByRole('alert').textContent()
    await entrar(page, emailUnico('fantasma'), 'senha-errada-123')
    await expect(page.getByRole('alert')).toHaveText(textoComContaReal ?? '')
  })

  test('primeiro acesso pela tela: conta, empresa, tudo pronto e ativação do 2FA', async ({
    page,
  }) => {
    const email = emailUnico('primeiro')
    await page.goto('/login')
    await page.getByRole('link', { name: 'Criar conta' }).click()
    await expect(page.getByText('Passo 1 de 3 · Conta')).toBeVisible()
    await page.getByLabel('Seu nome').fill('Alessandro Dias')
    await page.getByLabel('E-mail do trabalho').fill(email)
    await page.getByLabel('Senha', { exact: true }).fill(SENHA)
    await page.getByLabel(/Li e aceito os termos/).check()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText('Passo 2 de 3 · Empresa')).toBeVisible()
    await page.getByLabel(/Razão social/).fill(`Dias Automação ${Date.now()} Ltda`)
    await page.getByRole('button', { name: 'Criar empresa' }).click()
    await expect(page.getByRole('heading', { name: 'Tudo pronto' })).toBeVisible()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page).toHaveURL(/\/ativar-2fa$/)
  })
})

test.describe('Recuperação de senha', () => {
  test('pede o link, abre o e-mail, cria a senha nova e a antiga deixa de valer', async ({
    page,
  }) => {
    const conta = await criarAdministrador('senha')
    await page.goto('/login')
    await page.getByRole('link', { name: 'Esqueci a senha' }).click()
    await expect(page.getByRole('heading', { name: 'Recuperar senha' })).toBeVisible()
    await page.getByLabel('E-mail').fill(conta.email)
    await page.getByRole('button', { name: 'Enviar link' }).click()
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible()

    const { link } = await linkDoEmail(conta.email)
    await page.goto(link)
    await expect(page).toHaveURL(/\/redefinir-senha\?token=/)
    const nova = 'outra-senha-forte-e2e-2'
    await page.getByLabel('Senha nova').fill(nova)
    await page.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(page).toHaveURL(/\/login/)

    await entrar(page, conta.email, conta.senha)
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha não conferem')
    await entrar(page, conta.email, nova)
    await expect(page).toHaveURL(/\/ativar-2fa$/)

    // o link é de uso único
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Este link não vale mais' })).toBeVisible()
  })

  test('e-mail sem conta recebe a mesma tela e nenhum e-mail sai', async ({ page }) => {
    const fantasma = emailUnico('fantasma')
    await page.goto('/esqueci-senha')
    await page.getByLabel('E-mail').fill(fantasma)
    await page.getByRole('button', { name: 'Enviar link' }).click()
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible()
    await expect(page.getByText(/tiver conta, o link chega em instantes/)).toBeVisible()
    await page.waitForTimeout(1500)
    expect(await quantosEmails(fantasma)).toBe(0)
  })
})

test.describe('Aceitar convite', () => {
  test('convidado novo cria a conta pelo link do e-mail e entra', async ({ page }) => {
    const { conta, api } = await administradorComSessao('convite')
    const convidado = emailUnico('novato')
    const r = await api.post('/v1/convites', { data: { email: convidado, papel: 'vendedor' } })
    expect(r.status()).toBe(201)

    const { link } = await linkDoEmail(convidado)
    await page.goto(link)
    await expect(page.getByText(conta.empresa)).toBeVisible()
    await expect(page.getByText(convidado)).toBeVisible()
    await page.getByLabel(/Seu nome/).fill('Mariana Gobbi')
    await page.getByLabel('Crie uma senha').fill(SENHA)
    await page.getByLabel(/Li e aceito os termos/).check()
    await page.getByRole('button', { name: 'Aceitar e entrar' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // o convite é de uso único
    await sair(page)
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Convite inválido' })).toBeVisible()
  })

  test('quem já tem conta entra nela e aceita', async ({ page }) => {
    const { conta, api } = await administradorComSessao('convite2')
    const existente = await criarAdministrador('existente')
    const r = await api.post('/v1/convites', { data: { email: existente.email, papel: 'gestor' } })
    expect(r.status()).toBe(201)

    const { link } = await linkDoEmail(existente.email)
    await page.goto(link)
    await expect(page.getByText(conta.empresa)).toBeVisible()
    await page.getByRole('button', { name: 'Entrar para aceitar' }).click()
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await page.getByLabel('E-mail').fill(existente.email)
    await page.getByLabel('Senha', { exact: true }).fill(existente.senha)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    // volta ao convite (tela pública) já logada na conta certa: só falta aceitar
    await expect(page).toHaveURL(/\/convite\?token=/)
    await page.getByRole('button', { name: 'Aceitar convite' }).click()
    // é administrador sem 2FA: a casca continua bloqueada até ativar
    await expect(page).toHaveURL(/\/ativar-2fa$/)
  })

  test('link adulterado ou inexistente é convite inválido', async ({ page }) => {
    await page.goto('/convite?token=tokeninventadotokeninventadotokeninventado')
    await expect(page.getByRole('heading', { name: 'Convite inválido' })).toBeVisible()
  })
})

test.describe('2FA para todos: política da empresa e Meu perfil → Segurança', () => {
  test('a política "todos" leva o vendedor à ativação; ativado, ele só desativa quando a regra deixa de exigir', async ({
    page,
  }) => {
    const { api } = await administradorComSessao('politica')
    const vendedor = emailUnico('vendedor')
    const convite = await api.post('/v1/convites', { data: { email: vendedor, papel: 'vendedor' } })
    expect(convite.status()).toBe(201)

    // o vendedor aceita o convite e entra (política padrão: só administradores)
    const { link } = await linkDoEmail(vendedor)
    await page.goto(link)
    await page.getByLabel(/Seu nome/).fill('Vera Vendedora')
    await page.getByLabel('Crie uma senha').fill(SENHA)
    await page.getByLabel(/Li e aceito os termos/).check()
    await page.getByRole('button', { name: 'Aceitar e entrar' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    // a sessão já nasceu com a empresa ativa (a única dele): nenhuma troca manual
    expect((await page.request.get('/v1/membros')).status()).toBe(200)

    // o administrador passa a exigir 2FA de todos: na próxima navegação o vendedor é levado à ativação
    const exigir = await api.patch('/v1/configuracoes/seguranca', {
      data: { doisFatoresExigido: 'todos' },
    })
    expect(exigir.status()).toBe(200)
    expect((await page.request.get('/v1/membros')).status()).toBe(403)
    await page.goto('/')
    await expect(page).toHaveURL(/\/ativar-2fa$/)
    await page.getByLabel('Senha', { exact: true }).fill(SENHA)
    await page.getByRole('button', { name: 'Continuar' }).click()
    const chave = (await page.getByTestId('chave-manual').textContent())?.trim() ?? ''
    await digitar(page, await codigoValido(chave))
    await page.getByRole('button', { name: 'Ativar verificação' }).click()
    await page.getByLabel('Guardei meus códigos de recuperação').check()
    await page.getByRole('button', { name: 'Concluir' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    expect((await page.request.get('/v1/membros')).status()).toBe(200)

    // Segurança: ativa, mas obrigatória (a política exige): sem botão de desativar
    await page.getByRole('button', { name: /^Menu de / }).click()
    await page.getByRole('menuitem', { name: 'Meu perfil → Segurança' }).click()
    await expect(page.getByText('Ativa', { exact: true })).toBeVisible()
    await expect(page.getByText(/obrigatória para você/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Desativar verificação' })).toHaveCount(0)
    const bloqueado = await page.request.post('/v1/auth/two-factor/disable', {
      data: { password: SENHA, code: await codigoValido(chave) },
      headers: { Origin: URL_WEB },
    })
    expect(bloqueado.status()).toBe(403)

    // novos códigos de recuperação
    await page.locator('#codigos-senha').fill(SENHA)
    await page.getByRole('button', { name: 'Gerar novos códigos' }).click()
    await expect(page.getByRole('list', { name: 'Novos códigos de recuperação' })).toBeVisible()
    await page.getByRole('button', { name: 'Pronto, guardei' }).click()

    // o administrador volta à política padrão: agora o vendedor pode desativar (senha + código)
    await api.patch('/v1/configuracoes/seguranca', { data: { doisFatoresExigido: 'admin' } })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Desativar verificação' })).toBeVisible()
    await page.locator('#desativar-senha').fill(SENHA)
    await digitar(page, await codigoValido(chave))
    await page.getByRole('button', { name: 'Desativar verificação' }).click()
    await expect(page.getByText('Desativada', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Ativar verificação em duas etapas' }),
    ).toBeVisible()
  })
})
