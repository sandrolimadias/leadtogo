import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// G4: a seleção da lista de Empresas vira uma rota nova, que abre no editor do mapa; a rota do dia se executa
// com o check-in do G3 (a visita se liga à parada sozinha) e "Pular". Sem VROOM/OSRM no E2E, a tela avisa
// "Otimização de rotas ainda não configurada" e as distâncias saem em linha reta.

async function entrarComSessao(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  return api
}

test('rota: da seleção da lista ao editor no mapa, e a execução com check-in e pular', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1366, height: 768 })
  const api = await entrarComSessao(page, 'rotas')
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -20.25, longitude: -40.28 })

  const empresas = [
    ['Mercado Rota Um', -20.3, -40.3],
    ['Padaria Rota Dois', -20.31, -40.29],
  ] as const
  const ids: string[] = []
  for (const [razaoSocial, latitude, longitude] of empresas) {
    const r = await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial, endereco: { municipioCodigo: 3205309 } },
    })
    const { id } = (await r.json()) as { id: string }
    ids.push(id)
    const p = await api.post(`/v1/geolocalizacao/empresas/${id}/posicao`, {
      data: { latitude, longitude },
    })
    expect(p.status()).toBe(200)
  }

  // 1. Lista de Empresas: marca as duas e "Adicionar à rota" → "Nova rota" abre o editor no mapa
  await page.goto('/empresas?busca=Rota')
  for (const [nome] of empresas) {
    await page.getByRole('checkbox', { name: new RegExp(`Selecionar ${nome}`) }).check()
  }
  await page.getByRole('button', { name: 'Adicionar à rota' }).click()
  await page.getByRole('menuitem', { name: 'Nova rota' }).click()
  await expect(page).toHaveURL(/\/mapa\?rota=[0-9a-f-]{36}$/)
  const editor = page.getByRole('region', { name: 'Editor de rota' })
  await expect(editor.getByText(/Otimização de rotas ainda não configurada/)).toBeVisible()
  await expect(editor.getByRole('button', { name: /Otimizar ordem/ })).toBeDisabled()
  const paradas = editor.getByRole('list', { name: 'Paradas na ordem de visita' })
  await expect(paradas.getByRole('listitem')).toHaveCount(2)

  // 2. Muda o nome e salva
  await editor.getByLabel('Nome da rota').fill('Centro de Vitória')
  await editor.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByText('Rota salva')).toBeVisible()

  // 3. A lista de Rotas mostra a rota de hoje, planejada
  await page.goto('/rotas')
  const lista = page.getByRole('list', { name: 'Rotas' })
  await expect(lista.getByText('Centro de Vitória')).toBeVisible()
  await expect(lista.getByText('Planejada')).toBeVisible()
  await lista.getByRole('link', { name: /Centro de Vitória/ }).click()

  // 4. Execução: check-in na primeira parada (perto: posição do aparelho = a da empresa)
  await context.setGeolocation({ latitude: -20.3, longitude: -40.3 })
  const parada1 = page.getByRole('listitem').filter({ hasText: 'Mercado Rota Um' })
  await parada1.getByRole('button', { name: 'Check-in' }).click()
  const janela = page.getByRole('dialog', { name: /Check-in em Mercado Rota Um/ })
  await janela.getByRole('button', { name: 'Fazer check-in' }).click()
  await expect(page).toHaveURL(/\/visitas\/[0-9a-f-]{36}$/)
  await page.getByLabel(/Resultado da visita/).selectOption({ label: 'Visita realizada' })
  await page.getByRole('button', { name: 'Concluir relatório' }).click()
  await expect(page.getByText('Relatório concluído')).toBeVisible()

  // 5. De volta à rota: a primeira visitada, a rota em andamento; pula a segunda e ela termina
  await page.goto('/rotas')
  await page
    .getByRole('list', { name: 'Rotas' })
    .getByRole('link', { name: /Centro de Vitória/ })
    .click()
  await expect(page.getByText('Em andamento')).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Mercado Rota Um' }).getByText('Visitada'),
  ).toBeVisible()
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Padaria Rota Dois' })
    .getByRole('button', { name: 'Pular' })
    .click()
  const pular = page.getByRole('dialog', { name: /Pular Padaria Rota Dois/ })
  await pular.getByLabel('Motivo').fill('Fechada')
  await pular.getByRole('button', { name: 'Pular parada' }).click()
  await expect(page.getByText('Concluída', { exact: true })).toBeVisible()
  await expect(page.getByText('Pulada: Fechada')).toBeVisible()

  // 6. A visita ficou ligada à parada (API)
  const rotas = (await (await api.get('/v1/rotas')).json()) as { itens: { id: string }[] }
  const rota = (await (await api.get(`/v1/rotas/${rotas.itens[0]?.id}`)).json()) as {
    paradas: { empresaId: string; situacao: string; atividadeId: string | null }[]
  }
  expect(rota.paradas.find((p) => p.empresaId === ids[0])).toMatchObject({ situacao: 'visitada' })
  expect(rota.paradas.find((p) => p.empresaId === ids[0])?.atividadeId).not.toBeNull()
})
