import { expect, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Busca global (docs/plano_busca_global.md): sugestões na barra do topo, a ficha, as buscas recentes e a tela /busca.

test('busca global: digitar, ver as sugestões, abrir a ficha e achar o termo nas recentes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { api } = await administradorComSessao('busca')
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  const empresa = (await (
    await api.post('/v1/carteira/empresas', {
      data: {
        tipoDocumento: 'nenhum',
        razaoSocial: 'Usinagem São João',
        nomeFantasia: 'Usidantec',
      },
    })
  ).json()) as { id: string }
  await api.post('/v1/carteira/oportunidades', {
    data: { titulo: 'Contrato de manutenção', empresaId: empresa.id, valorUnico: 1500 },
  })

  // 1. Sugestões enquanto digita (sem acento), agrupadas por tipo
  await page.goto('/')
  const caixa = page.getByRole('combobox', { name: /Buscar empresas/ })
  await caixa.fill('sao joao')
  const lista = page.getByRole('listbox', { name: 'Busca global' })
  await expect(lista.getByRole('group', { name: 'Empresas' })).toContainText('Usidantec')
  await expect(lista.getByRole('group', { name: 'Oportunidades' })).toContainText(
    'Contrato de manutenção',
  )

  // 2. ↓ e Enter abrem a ficha da empresa
  await caixa.press('ArrowDown')
  await caixa.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/empresas/${empresa.id}$`))
  await expect(page.getByRole('heading', { name: 'Usidantec', level: 1 })).toBeVisible()

  // 3. De volta à caixa vazia: o termo está nas buscas recentes
  await page.keyboard.press('Control+k')
  await expect(caixa).toBeFocused()
  await expect(
    page.getByRole('group', { name: 'Buscas recentes' }).getByRole('option', { name: 'sao joao' }),
  ).toBeVisible()

  // 4. Enter sem item marcado: a tela /busca, com "Ver todos" para a lista do tipo
  await caixa.fill('manutencao')
  await expect(lista.getByRole('group', { name: 'Oportunidades' })).toBeVisible()
  await caixa.press('Enter')
  await expect(page).toHaveURL(/\/busca\?q=manutencao$/)
  const secao = page.getByRole('region', { name: 'Oportunidades' })
  await expect(secao).toContainText('Contrato de manutenção')
  await secao.getByRole('link', { name: /Ver todos em Oportunidades/ }).click()
  await expect(page).toHaveURL(/\/oportunidades\?visao=lista&busca=manutencao$/)
  await expect(page.getByText('Contrato de manutenção').first()).toBeVisible()
})
