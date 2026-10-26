import { expect, test } from '@playwright/test'

import { administradorComSessao, emailUnico, limparLimites, linkDoEmail } from './ambiente'
import { URL_PORTAL } from '../playwright.config'

// Portal do cliente (Fase 3A): a equipe dá acesso a um contato, ele entra pelo link do e-mail, abre um chamado,
// a equipe responde e pede resposta, ele responde, a equipe resolve, ele reabre e avalia. Vale o caminho todo:
// convite por e-mail, cookie do portal, origem conferida, isolamento entre empresas-clientes e o hub do CRM.

test('portal: convite, chamado do cliente, conversa com a equipe, resolver, reabrir e avaliar', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1366, height: 768 })

  // --- A equipe: liga o portal, deixa a área Jurídico visível, cria a empresa-cliente e o contato
  const { api } = await administradorComSessao('portal')
  const ligado = await api.put('/v1/portal-configuracao', {
    data: { ativo: true, nome: 'Portal E2E' },
  })
  expect(ligado.status()).toBe(200)
  const areas = (await (await api.get('/v1/chamados/areas')).json()) as {
    id: string
    nome: string
  }[]
  const juridico = areas.find((a) => a.nome === 'Jurídico')
  expect(juridico).toBeDefined()
  expect(
    (
      await api.patch(`/v1/chamados/areas/${juridico?.id ?? ''}`, {
        data: { visivelNoPortal: true },
      })
    ).status(),
  ).toBe(200)
  const empresa = (await (
    await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial: 'Caldeiraria do Portal Ltda' },
    })
  ).json()) as { id: string }
  const emailCliente = emailUnico('cliente')
  const contato = (await (
    await api.post('/v1/carteira/contatos', {
      data: {
        nome: 'Sérgio Cliente',
        emails: [{ email: emailCliente, principal: true }],
        vinculo: { empresaId: empresa.id, cargo: 'Gerente', principal: true },
      },
    })
  ).json()) as { id: string }
  const outra = (await (
    await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial: 'Outra Empresa Cliente' },
    })
  ).json()) as { id: string }
  const outroEmail = emailUnico('outro')
  const outroContato = (await (
    await api.post('/v1/carteira/contatos', {
      data: {
        nome: 'Olga de Outra',
        emails: [{ email: outroEmail, principal: true }],
        vinculo: { empresaId: outra.id, cargo: 'Compras', principal: true },
      },
    })
  ).json()) as { id: string }

  // --- Dá o acesso: o convite chega por e-mail
  for (const [contatoId, empresaClienteId] of [
    [contato.id, empresa.id],
    [outroContato.id, outra.id],
  ]) {
    const r = await api.post('/v1/portal-acessos', {
      data: { contatoId, empresaClienteId, papel: 'responsavel' },
    })
    expect(r.status(), await r.text()).toBe(201)
  }
  const convite = await linkDoEmail(emailCliente)
  expect(convite.link.startsWith(`${URL_PORTAL}/acesso#`)).toBe(true)

  // --- O cliente (outro contexto de navegador): abre o link, confirma e entra
  const contextoCliente = await browser.newContext({ locale: 'pt-BR' })
  const cliente = await contextoCliente.newPage()
  await cliente.setViewportSize({ width: 1280, height: 800 })
  await cliente.goto(convite.link)
  await expect(cliente.getByRole('heading', { name: 'Ative seu acesso' })).toBeVisible()
  // abrir a página não gasta o link: recarregar o mesmo endereço ainda funciona
  const botao = cliente.getByRole('button', { name: 'Confirmar acesso' })
  await expect(botao).toBeDisabled()
  await cliente.getByLabel(/Li e aceito o aviso de privacidade/).check()
  await botao.click()
  await expect(cliente.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible()
  // o token saiu do endereço
  expect(cliente.url()).not.toContain('#')
  // o link de uso único já não vale
  const reuso = await contextoCliente.newPage()
  await reuso.goto(convite.link)
  await expect(reuso.getByRole('heading', { name: 'Link inválido' })).toBeVisible()
  await reuso.close()

  // --- O cliente abre um chamado (a empresa e o solicitante vêm da sessão)
  await cliente.getByRole('button', { name: 'Abrir chamado' }).first().click()
  await cliente.getByLabel(/^Assunto/).fill('Inversor da ponte desarmando')
  await cliente.getByLabel('Área').selectOption({ label: 'Jurídico' })
  await cliente.getByLabel('Descrição').fill('Desde ontem desarma com falha de sobrecorrente.')
  await cliente.locator('form').getByRole('button', { name: 'Abrir chamado' }).click()
  await expect(cliente).toHaveURL(/\/chamados\/[0-9a-f-]{36}$/)
  await expect(cliente.getByRole('heading', { name: 'Inversor da ponte desarmando' })).toBeVisible()
  const urlDoChamado = cliente.url()
  // o cliente só vê o estado dele, nunca prioridade nem responsável
  await expect(cliente.getByText('Aberto', { exact: true }).first()).toBeVisible()
  await expect(cliente.getByText(/Prioridade|Responsável pelo/)).toHaveCount(0)

  // --- A equipe: acha o chamado no hub, assume e escreve ao cliente aguardando a resposta dele
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  await page.goto('/portal')
  await expect(page.getByRole('heading', { name: 'Portal do Cliente' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Indicadores' })).toBeVisible()
  await page.getByRole('link', { name: /Inversor da ponte desarmando/ }).click()
  await page.getByRole('button', { name: 'Assumir' }).click()
  await expect(page.getByText('Em atendimento').first()).toBeVisible()
  await page.getByLabel('Nova nota interna').fill('SEGREDO-DA-EQUIPE: cliente em contrato antigo.')
  await page.getByRole('button', { name: 'Salvar nota' }).click()
  await expect(
    page.getByRole('region', { name: 'Notas internas' }).getByText(/SEGREDO-DA-EQUIPE/),
  ).toBeVisible()
  await page.getByRole('textbox', { name: 'Responder' }).fill('Qual é o modelo do inversor?')
  // "Aguardar resposta do cliente" já vem marcada: escreve e muda o estado numa ação só
  await expect(page.getByLabel(/^Aguardar resposta do cliente/)).toBeChecked()
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText('Aguardando cliente').first()).toBeVisible()
  // "Criar tarefa" liga uma atividade ao chamado
  await page.getByRole('button', { name: 'Criar tarefa' }).click()
  await page.getByRole('dialog').getByLabel('Título').fill('Ligar para o cliente amanhã')
  await page.getByRole('dialog').getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(
    page.getByRole('region', { name: 'Tarefas' }).getByText('Ligar para o cliente amanhã'),
  ).toBeVisible()

  // --- O cliente vê a pergunta (e a nota interna nunca aparece), recebeu aviso e responde
  await cliente.reload()
  await expect(cliente.getByText('A equipe aguarda a sua resposta.')).toBeVisible()
  await expect(cliente.getByText('Qual é o modelo do inversor?')).toBeVisible()
  await expect(cliente.getByText('SEGREDO-DA-EQUIPE')).toHaveCount(0)
  await cliente.goto(`${URL_PORTAL}/notificacoes`)
  await expect(cliente.getByText(/Aguardando a sua resposta/).first()).toBeVisible()
  await cliente.goto(urlDoChamado)
  await cliente.getByLabel('Sua resposta').fill('É um WEG CFW500.')
  await cliente.getByRole('button', { name: 'Enviar' }).click()
  await expect(cliente.getByText('É um WEG CFW500.')).toBeVisible()
  await expect(cliente.getByText('Em atendimento', { exact: true }).first()).toBeVisible()

  // --- A empresa-cliente de outro contato não alcança esse chamado
  const contextoOutro = await browser.newContext({ locale: 'pt-BR' })
  const outroCliente = await contextoOutro.newPage()
  const conviteOutro = await linkDoEmail(outroEmail)
  await outroCliente.goto(conviteOutro.link)
  await outroCliente.getByLabel(/Li e aceito o aviso de privacidade/).check()
  await outroCliente.getByRole('button', { name: 'Confirmar acesso' }).click()
  await expect(
    outroCliente.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ }),
  ).toBeVisible()
  await outroCliente.goto(urlDoChamado)
  await expect(outroCliente.getByText('Chamado não encontrado.')).toBeVisible()
  await contextoOutro.close()

  // --- A equipe resolve; o cliente reabre, a equipe resolve de novo e o cliente avalia
  await page.reload()
  await page.getByLabel('Mudar o estado').selectOption({ label: 'Resolvido' })
  await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible()
  await cliente.reload()
  await expect(cliente.getByText('Este chamado foi resolvido.')).toBeVisible()
  await cliente.getByRole('button', { name: 'Reabrir' }).click()
  await expect(cliente.getByText('Em atendimento', { exact: true }).first()).toBeVisible()
  await page.reload()
  await page.getByLabel('Mudar o estado').selectOption({ label: 'Resolvido' })
  await cliente.reload()
  await cliente.getByRole('button', { name: '5 estrelas' }).click()
  await cliente.getByLabel('Comentário').fill('Atendimento rápido.')
  await cliente.getByRole('button', { name: 'Enviar avaliação' }).click()
  await expect(cliente.getByText('Sua avaliação')).toBeVisible()

  // --- O hub agora conta a avaliação; revogar o acesso derruba a sessão do cliente
  await page.goto('/portal')
  await expect(
    page.getByRole('region', { name: 'Indicadores' }).getByText('1 avaliação em 30 dias'),
  ).toBeVisible()
  await page.getByRole('tab', { name: /Acessos/ }).click()
  const linhaDele = page
    .getByRole('list', { name: 'Acessos ao portal' })
    .getByRole('listitem')
    .filter({ hasText: 'Sérgio Cliente' })
  await linhaDele.getByRole('button', { name: 'Revogar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revogar acesso' }).click()
  await cliente.reload()
  await expect(cliente.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  await contextoCliente.close()
})

/** O portal sem login leva à tela de entrada, que pede o link por e-mail e responde igual para qualquer endereço. */
test('portal: sem login vai a /entrar e o pedido de link responde igual para qualquer e-mail', async ({
  page,
}) => {
  await limparLimites()
  await page.goto(`${URL_PORTAL}/chamados`)
  await expect(page).toHaveURL(/\/entrar$/)
  await page.getByLabel(/^E-mail/).fill(emailUnico('naoexiste'))
  await page.getByRole('button', { name: 'Enviar link de entrada' }).click()
  await expect(page.getByText(/Se este e-mail tem acesso ao portal/)).toBeVisible()
})
