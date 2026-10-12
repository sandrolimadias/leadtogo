import {
  type APIRequestContext,
  type Browser,
  expect,
  type Page,
  request,
  test,
} from '@playwright/test'

import {
  administradorComSessao,
  codigoValido,
  type ContaCriada,
  emailUnico,
  limparLimites,
  linkDoEmail,
  SENHA,
} from './ambiente'
import { URL_WEB } from '../playwright.config'

// E2E da E16a (gestão multiempresa): criar a empresa B, convidar, aceitar, papéis, desativação e
// isolamento. O roteiro é o da E16, só que pelo app.

test.beforeEach(async () => {
  await limparLimites()
})

type Admin = Awaited<ReturnType<typeof administradorComSessao>>

const botaoDeEmpresa = (page: Page, nome: string | RegExp) =>
  page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: nome })

/** Login pela tela do administrador (ele tem 2FA: pede o código). */
async function entrarComo(page: Page, conta: ContaCriada, chave: string) {
  await limparLimites() // o login do Better Auth limita 3 por 10 s por IP
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(conta.email)
  await page.getByLabel('Senha', { exact: true }).fill(conta.senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/verificacao/)
  await page.getByLabel('Dígito 1').click()
  await page.keyboard.type(await codigoValido(chave))
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

async function entrarSemDoisFatores(page: Page, email: string) {
  await limparLimites()
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

/** Abre o convite pelo link do e-mail e cria a conta pela tela (conta nova). */
async function aceitarComoNovo(page: Page, email: string, nome: string, minimo = 1) {
  const { link } = await linkDoEmail(email, 20_000, minimo)
  await page.goto(link)
  await page.getByLabel(/Seu nome/).fill(nome)
  await page.getByLabel('Crie uma senha').fill(SENHA)
  await page.getByLabel(/Li e aceito os termos/).check()
  await page.getByRole('button', { name: 'Aceitar e entrar' }).click()
}

/** Convida pela tela de Usuários. */
async function convidarPelaTela(
  page: Page,
  email: string,
  papel: 'Administrador' | 'Gestor' | 'Vendedor',
) {
  await page.getByRole('button', { name: 'Convidar pessoa' }).first().click()
  const dialogo = page.getByRole('dialog', { name: 'Convidar pessoa' })
  await dialogo.getByLabel(/E-mail/).fill(email)
  await dialogo.getByLabel('Papel').selectOption({ label: papel })
  await dialogo.getByRole('button', { name: 'Enviar convite' }).click()
  await expect(dialogo).toBeHidden()
}

const linhaDe = (page: Page, nome: string) => page.getByRole('listitem', { name: nome })

/** Vendedor com conta criada direto pela API (convite aceito sem sessão) e a conta-administradora do convite. */
async function vendedorPelaApi(admin: Admin, rotulo: string, papel = 'vendedor'): Promise<string> {
  const email = emailUnico(rotulo)
  expect((await admin.api.post('/v1/convites', { data: { email, papel } })).status()).toBe(201)
  const token = new URL((await linkDoEmail(email)).link).searchParams.get('token')
  const publico = await request.newContext({
    baseURL: URL_WEB,
    extraHTTPHeaders: { Origin: URL_WEB },
  })
  const r = await publico.post('/v1/convites/aceitar', {
    data: { token, nome: `Vendedor ${rotulo}`, senha: SENHA },
  })
  expect(r.status(), await r.text()).toBe(200)
  await publico.dispose()
  return email
}

async function outroContexto(browser: Browser) {
  const contexto = await browser.newContext({ locale: 'pt-BR' })
  return { contexto, page: await contexto.newPage() }
}

async function membroIdPorEmail(api: APIRequestContext, email: string): Promise<string> {
  const lista = (await (await api.get('/v1/membros?incluirInativos=true')).json()) as {
    id: string
    email: string | null
  }[]
  const m = lista.find((x) => x.email === email)
  if (!m) throw new Error(`membro ${email} não encontrado`)
  return m.id
}

test.describe('Gestão multiempresa: roteiro da E16 pelo app', () => {
  test('cria a empresa B, convida um vendedor para a A e ele (com outro e-mail) não vê a B nem o menu de usuários', async ({
    page,
    browser,
  }) => {
    const admin = await administradorComSessao('gestao')
    await entrarComo(page, admin.conta, admin.chave)

    // 1. Criar a empresa B pelo seletor: entra nela
    const nomeB = `Filial B ${Date.now().toString(36)} Ltda`
    await botaoDeEmpresa(page, new RegExp(admin.conta.empresa)).click()
    await page.getByRole('menuitem', { name: 'Criar empresa' }).click()
    await expect(page).toHaveURL(/\/criar-empresa$/)
    await page.getByLabel(/Razão social/).fill(nomeB)
    await page.getByRole('button', { name: 'Criar empresa' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(botaoDeEmpresa(page, new RegExp(nomeB))).toBeVisible()

    // 2. Volta para a A e convida um vendedor pela tela de Usuários
    await botaoDeEmpresa(page, new RegExp(nomeB)).click()
    await page
      .getByRole('menuitem', { name: new RegExp(`${admin.conta.empresa}.*Administrador`) })
      .click()
    await expect(botaoDeEmpresa(page, new RegExp(admin.conta.empresa))).toBeVisible()
    await page.getByRole('link', { name: 'Configurações' }).click()
    await expect(page).toHaveURL(/\/configuracoes\/usuarios$/)
    const vendedor = emailUnico('vendedor-a')
    await convidarPelaTela(page, vendedor, 'Vendedor')
    await expect(linhaDe(page, `Convite para ${vendedor}`)).toContainText('Convidado')

    // 3. O convidado aceita com OUTRO e-mail (conta nova) num navegador à parte
    const { contexto, page: pagVendedor } = await outroContexto(browser)
    await aceitarComoNovo(pagVendedor, vendedor, 'Vera Vendedora')
    await expect(pagVendedor.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // 4. Isolamento: só a A, sem o menu Configurações, rota barrada, API recusa
    const me = (await (await pagVendedor.request.get('/v1/me')).json()) as {
      empresas: { razaoSocial: string }[]
    }
    expect(me.empresas.map((e) => e.razaoSocial)).toEqual([admin.conta.empresa])
    await expect(
      pagVendedor
        .getByRole('navigation', { name: 'Principal' })
        .getByRole('link', { name: 'Configurações' }),
    ).toHaveCount(0)
    await pagVendedor.goto('/configuracoes/usuarios')
    await expect(pagVendedor.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(pagVendedor).toHaveURL(`${URL_WEB}/`)
    await pagVendedor.goto('/criar-empresa')
    await expect(pagVendedor).toHaveURL(`${URL_WEB}/`)
    expect(
      (
        await pagVendedor.request.post('/v1/empresas', {
          data: { razaoSocial: 'Tentativa' },
          headers: { Origin: URL_WEB },
        })
      ).status(),
    ).toBe(403)

    // 5. O administrador vê a pessoa como ativa na lista
    await page.reload()
    await expect(linhaDe(page, 'Vera Vendedora')).toContainText('Ativo')
    await expect(linhaDe(page, 'Vera Vendedora')).toContainText('Vendedor')
    await contexto.close()
  })

  test('papel, desativar, reativar, reenviar e cancelar convite pela tela de Usuários', async ({
    page,
  }) => {
    const admin = await administradorComSessao('usuarios')
    const email = await vendedorPelaApi(admin, 'equipe')
    await entrarComo(page, admin.conta, admin.chave)
    await page.getByRole('link', { name: 'Configurações' }).click()
    const pessoa = linhaDe(page, 'Vendedor equipe')

    // muda o papel (vendedor -> gestor), refletido na API
    await pessoa.getByRole('combobox').selectOption({ label: 'Gestor' })
    await expect(page.getByText('Vendedor equipe agora é gestor')).toBeVisible()
    const papelNaApi = async () =>
      (
        (await (await admin.api.get('/v1/membros')).json()) as { email: string; papel: string }[]
      ).find((m) => m.email === email)?.papel
    await expect.poll(papelNaApi).toBe('gestor')

    // desativa (com confirmação) e reativa
    await pessoa.getByRole('button', { name: 'Desativar' }).click()
    await page
      .getByRole('dialog', { name: 'Desativar Vendedor equipe?' })
      .getByRole('button', { name: 'Desativar' })
      .click()
    await expect(pessoa).toContainText('Inativo')
    await pessoa.getByRole('button', { name: 'Reativar' }).click()
    await expect(pessoa).toContainText('Ativo')
    await expect(pessoa.getByRole('button', { name: 'Desativar' })).toBeVisible()

    // convite: o e-mail já da equipe é recusado com mensagem clara
    await page.getByRole('button', { name: 'Convidar pessoa' }).first().click()
    const dialogo = page.getByRole('dialog', { name: 'Convidar pessoa' })
    await dialogo.getByLabel(/E-mail/).fill(email)
    await dialogo.getByRole('button', { name: 'Enviar convite' }).click()
    await expect(dialogo.getByText('Este e-mail já faz parte da equipe.')).toBeVisible()
    await dialogo.getByRole('button', { name: 'Cancelar' }).click()

    // convida, reenvia (o link antigo morre) e cancela
    const novo = emailUnico('pendente')
    await convidarPelaTela(page, novo, 'Gestor')
    const primeiro = (await linkDoEmail(novo)).link
    const convite = linhaDe(page, `Convite para ${novo}`)
    await convite.getByRole('button', { name: 'Reenviar' }).click()
    await expect(page.getByText(`Convite reenviado para ${novo}`)).toBeVisible()
    const segundo = (await linkDoEmail(novo, 20_000, 2)).link
    expect(segundo).not.toBe(primeiro)
    await page.goto(primeiro)
    await expect(page.getByRole('heading', { name: 'Convite inválido' })).toBeVisible()
    await page.goto('/configuracoes/usuarios')
    await linhaDe(page, `Convite para ${novo}`).getByRole('button', { name: 'Cancelar' }).click()
    await page
      .getByRole('dialog', { name: 'Cancelar este convite?' })
      .getByRole('button', { name: 'Cancelar convite' })
      .click()
    await expect(linhaDe(page, `Convite para ${novo}`)).toHaveCount(0)
    await page.goto(segundo)
    await expect(page.getByRole('heading', { name: 'Convite inválido' })).toBeVisible()
  })

  test('desativado com a sessão aberta: aviso claro e vai para a outra empresa dele', async ({
    browser,
  }) => {
    const admin = await administradorComSessao('desativa')
    const email = await vendedorPelaApi(admin, 'saida')
    // a mesma pessoa também é da empresa B (criada pelo administrador)
    const nomeB = `Filial B ${Date.now().toString(36)} Ltda`
    const criada = (await (
      await admin.api.post('/v1/empresas', { data: { razaoSocial: nomeB } })
    ).json()) as { empresa: { id: string } }
    await admin.api.post('/v1/sessao/empresa-ativa', { data: { empresaId: criada.empresa.id } })
    expect(
      (await admin.api.post('/v1/convites', { data: { email, papel: 'gestor' } })).status(),
    ).toBe(201)
    const { link } = await linkDoEmail(email, 20_000, 2)

    const { contexto, page } = await outroContexto(browser)
    await entrarSemDoisFatores(page, email)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    // aceita o convite da B com a sessão dele
    const token = new URL(link).searchParams.get('token')
    const aceite = await page.request.post('/v1/convites/aceitar', {
      data: { token },
      headers: { Origin: URL_WEB },
    })
    expect(aceite.status(), await aceite.text()).toBe(200)

    // o administrador desativa a pessoa na A (a empresa ativa dela)
    await admin.api.post('/v1/sessao/empresa-ativa', {
      data: {
        empresaId: (
          (await (await admin.api.get('/v1/me')).json()) as {
            empresas: { id: string; razaoSocial: string }[]
          }
        ).empresas.find((e) => e.razaoSocial === admin.conta.empresa)?.id,
      },
    })
    const id = await membroIdPorEmail(admin.api, email)
    expect((await admin.api.patch(`/v1/membros/${id}`, { data: { ativo: false } })).status()).toBe(
      200,
    )

    // ao recarregar: mensagem clara e entrada na B (o nome da A não existe mais para ele depois do reload)
    await page.reload()
    await expect(page.getByText('Seu acesso a esta empresa foi encerrado')).toBeVisible()
    await expect(botaoDeEmpresa(page, new RegExp(nomeB))).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    expect(
      (
        (await (await page.request.get('/v1/me')).json()) as { empresas: { razaoSocial: string }[] }
      ).empresas.map((e) => e.razaoSocial),
    ).toEqual([nomeB])
    await contexto.close()
  })

  test('desativado sem outra empresa: aviso e volta para o login', async ({ browser }) => {
    const admin = await administradorComSessao('desativa2')
    const email = await vendedorPelaApi(admin, 'sozinho')
    const { contexto, page } = await outroContexto(browser)
    await entrarSemDoisFatores(page, email)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const id = await membroIdPorEmail(admin.api, email)
    expect((await admin.api.patch(`/v1/membros/${id}`, { data: { ativo: false } })).status()).toBe(
      200,
    )
    // ao recarregar, a sessão ainda aponta a empresa perdida e não há outra: aviso e login
    await page.reload()
    await expect(page.getByText('Seu acesso a esta empresa foi encerrado')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
    await contexto.close()
  })

  test('política de 2FA pela tela: com "todos", quem aceita o convite é levado à ativação', async ({
    page,
    browser,
  }) => {
    const admin = await administradorComSessao('politica2')
    await entrarComo(page, admin.conta, admin.chave)
    await page.getByRole('link', { name: 'Configurações' }).click()
    await page.getByRole('link', { name: /Segurança/ }).click()
    await expect(
      page.getByRole('radio', { name: /^Administradores\s*Só os administradores/ }),
    ).toBeChecked()
    await page.getByRole('radio', { name: /Todos os membros/ }).check()
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Política de segurança salva')).toBeVisible()
    const api = await admin.api.get('/v1/configuracoes/seguranca')
    expect(await api.json()).toEqual({ doisFatoresExigido: 'todos' })

    const vendedor = emailUnico('exigido')
    await page.getByRole('link', { name: /Usuários e equipe/ }).click()
    await convidarPelaTela(page, vendedor, 'Vendedor')
    const { contexto, page: pagVendedor } = await outroContexto(browser)
    await aceitarComoNovo(pagVendedor, vendedor, 'Nilza Nova')
    // a casca fica bloqueada até ativar o 2FA
    await expect(pagVendedor).toHaveURL(/\/ativar-2fa$/)
    await contexto.close()
  })
})
