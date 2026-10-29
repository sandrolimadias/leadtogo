import { expect, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Contatos (29/10/2026, plano_contatos_filtros_e_tags.md): em todos os tamanhos os filtros ficam atrás do
// botão Filtros e abrem um abaixo do outro, dentro do quadro; "Fechar filtros" recolhe sem perder o filtro.
// Tags de contato: grupo próprio, coluna Tags na lista, etiqueta no cartão do celular e "Editar tags" na ficha.
// Capturas em test-results/ (ou em CAPTURAS, se definido) para conferir a olho.

const pasta = process.env['CAPTURAS'] ?? 'test-results'

test('contatos: filtros recolhíveis em coluna e tags de contato na lista e na ficha', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const { api } = await administradorComSessao('contatoslayout')
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()

  const grupo = await api.post('/v1/configuracoes/tag-grupos', {
    data: { nome: 'Perfil', selecao: 'multipla', obrigatorio: false, aplicaA: 'contato' },
  })
  expect(grupo.status(), await grupo.text()).toBe(201)
  const { id: grupoId } = (await grupo.json()) as { id: string }
  const tecnico = await api.post('/v1/configuracoes/tags', {
    data: { tagGrupoId: grupoId, nome: 'Técnico', cor: 'blue' },
  })
  expect(tecnico.status(), await tecnico.text()).toBe(201)
  const comprador = await api.post('/v1/configuracoes/tags', {
    data: { tagGrupoId: grupoId, nome: 'Comprador', cor: 'green' },
  })
  expect(comprador.status(), await comprador.text()).toBe(201)
  const { id: tecnicoId } = (await tecnico.json()) as { id: string }

  const c = await api.post('/v1/carteira/contatos', {
    data: { nome: 'Contato do layout', tagIds: [tecnicoId] },
  })
  expect(c.status(), await c.text()).toBe(201)
  const { id: contatoId } = (await c.json()) as { id: string }

  for (const tela of [
    { nome: 'desktop', width: 1366, height: 768 },
    { nome: 'tablet', width: 1024, height: 768 },
  ]) {
    await test.step(tela.nome, async () => {
      await page.setViewportSize({ width: tela.width, height: tela.height })
      await page.goto('/contatos')
      const linha = page.getByRole('row').filter({ hasText: 'Contato do layout' })
      await expect(linha).toBeVisible()
      await expect(linha.getByText('Técnico')).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Cargo' })).toHaveCount(0)

      await page.getByRole('button', { name: 'Filtros' }).click()
      const secao = page.getByRole('region', { name: 'Filtros' })
      await expect(secao).toBeVisible()
      // um abaixo do outro: a mesma coluna, cada um mais abaixo que o anterior, dentro do quadro
      const fundo = await page
        .getByRole('textbox', { name: 'Buscar contatos' })
        .evaluate((el) => el.closest('.rounded-lg')!.getBoundingClientRect().right)
      let acima = -1
      for (const nome of ['Cargo', 'Papel na decisão', 'Tag do contato', 'Tag da empresa']) {
        const caixa = (await secao.getByRole('combobox', { name: nome }).boundingBox())!
        expect(caixa.y, nome).toBeGreaterThan(acima)
        expect(caixa.x + caixa.width, nome).toBeLessThanOrEqual(fundo + 0.5)
        acima = caixa.y
      }
      await page.screenshot({ path: `${pasta}/contatos-${tela.nome}-filtros.png` })

      await secao.getByRole('combobox', { name: 'Tag do contato' }).selectOption(tecnicoId)
      await expect(page.getByRole('button', { name: 'Filtros · 1' })).toBeVisible()
      await page.getByRole('button', { name: 'Fechar filtros' }).click()
      await expect(page.getByRole('region', { name: 'Filtros' })).toHaveCount(0)
      await expect(page).toHaveURL(new RegExp(`tagContato=${tecnicoId}`))
      await expect(linha).toBeVisible()
      await page.screenshot({ path: `${pasta}/contatos-${tela.nome}.png` })
    })
  }

  await test.step('celular', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/contatos')
    const cartao = page.getByRole('article', { name: 'Contato do layout' })
    await expect(cartao).toBeVisible()
    await expect(cartao.getByText('Técnico')).toBeVisible()
    await page.getByRole('button', { name: 'Filtros' }).click()
    await expect(page.getByRole('combobox', { name: 'Tag do contato' })).toBeVisible()
    await page.screenshot({ path: `${pasta}/contatos-celular-filtros.png`, fullPage: true })
    await page.getByRole('button', { name: 'Fechar filtros' }).click()
    await expect(page.getByRole('combobox', { name: 'Cargo' })).toHaveCount(0)
  })

  await test.step('ficha: Editar tags', async () => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(`/contatos/${contatoId}`)
    await page.getByRole('button', { name: 'Editar tags' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar tags' })
    await dialogo.getByRole('checkbox', { name: 'Comprador' }).check()
    await dialogo.getByRole('button', { name: 'Salvar tags' }).click()
    await expect(dialogo).toHaveCount(0)
    await expect(page.getByText('Comprador')).toBeVisible()
    await page.screenshot({ path: `${pasta}/contatos-ficha-tags.png` })
  })
})
