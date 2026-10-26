import { type APIRequestContext, type Browser, expect } from '@playwright/test'

import { emailUnico, linkDoEmail } from './ambiente'

// Apoio dos testes E2E do portal: dá acesso a um contato de uma empresa-cliente e entra no portal pelo link do e-mail.

export async function clienteComAcesso(api: APIRequestContext, nome: string, empresa: string) {
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

export async function entrarNoPortal(browser: Browser, email: string) {
  const contexto = await browser.newContext({ locale: 'pt-BR' })
  const pagina = await contexto.newPage()
  await pagina.setViewportSize({ width: 1280, height: 900 })
  await pagina.goto((await linkDoEmail(email)).link)
  await pagina.getByLabel(/Li e aceito o aviso de privacidade/).check()
  await pagina.getByRole('button', { name: 'Confirmar acesso' }).click()
  await expect(pagina.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible()
  return pagina
}
