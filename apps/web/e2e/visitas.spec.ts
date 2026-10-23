import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// G3b: check-in e relatório SEM SINAL (context.setOffline), a fila sobe quando a conexão volta e a visita
// aparece UMA vez na ficha, com a carteira e as tags certas; reenviar o mesmo relatório não duplica.

async function entrarComSessao(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  return api
}

test('visita offline: check-in, relatório depois, volta o sinal e aparece uma vez só', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1366, height: 768 })
  const api = await entrarComSessao(page, 'visita')
  const empresa = (await (
    await api.post('/v1/carteira/empresas', {
      data: { tipoDocumento: 'nenhum', razaoSocial: 'Padaria do Campo' },
    })
  ).json()) as { id: string }
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -20.3, longitude: -40.3 })

  // 1. Online: a ficha guarda a empresa no aparelho; as telas do campo já carregam (o Vite serve o código
  //    sob demanda, e sem sinal não haveria de onde baixar)
  await page.goto('/visitas')
  await expect(page.getByRole('heading', { name: 'Relatórios pendentes' })).toBeVisible()
  await page.goto('/visitas/0199a000-0000-7000-8000-000000000999')
  await expect(page.getByText('Relatório não encontrado')).toBeVisible()
  await page.goto(`/empresas/${empresa.id}`)
  await expect(page.getByRole('heading', { name: 'Padaria do Campo' })).toBeVisible()
  // (a casca também guardou os resultados, os modelos e o check-in ao abrir o app)
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const r = indexedDB.open('leadtogo-offline')
            r.onsuccess = () => {
              const tx = r.result.transaction('empresas', 'readonly')
              const c = tx.objectStore('empresas').count()
              c.onsuccess = () => resolve(c.result)
            }
            r.onerror = () => resolve(0)
          }),
      ),
    )
    .toBeGreaterThan(0)

  // 2. Sem sinal: check-in
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Check-in' }).click()
  const janela = page.getByRole('dialog', { name: /Check-in em Padaria do Campo/ })
  await expect(janela.getByText(/Sem sinal: o check-in fica no aparelho/)).toBeVisible()
  await janela.getByRole('button', { name: 'Fazer check-in' }).click()
  await expect(page).toHaveURL(/\/visitas\/[0-9a-f-]{36}$/)
  const relatorioId = page.url().split('/').pop() as string
  await expect(page.getByText(/Ainda no aparelho/)).toBeVisible()

  // 3. Relatório depois, ainda sem sinal
  await page.getByLabel(/Resultado da visita/).selectOption({ label: 'Visita realizada' })
  await page.getByLabel(/^Resumo/).fill('Conversei com o dono; quer proposta.')
  await page.getByRole('button', { name: 'Concluir relatório' }).click()
  await expect(page.getByText('Relatório concluído')).toBeVisible()
  await expect(page).toHaveURL(/\/visitas$/)
  await expect(page.getByText('No aparelho', { exact: true })).toBeVisible()

  // 4. Volta o sinal: a fila sobe sozinha
  await context.setOffline(false)
  await expect(page.getByText('Nenhum relatório pendente')).toBeVisible({ timeout: 30_000 })

  // 5. Na ficha: uma visita só, realizada, e a empresa visitada
  await page.goto(`/empresas/${empresa.id}`)
  await expect(page.getByText('Visitada', { exact: true })).toBeVisible()
  const relatorios = page.getByRole('list', { name: 'Relatórios de visita' })
  await expect(relatorios.getByRole('listitem')).toHaveCount(1)
  await expect(relatorios.getByText('Visita realizada')).toBeVisible()
  await page.getByRole('tab', { name: 'Atividades' }).click()
  await expect(
    page.getByRole('list', { name: 'Atividades' }).getByText(/Visita a Padaria/),
  ).toHaveCount(1)

  // 6. Reenvio duplicado (a fila mandou de novo): devolve o mesmo e não cria outra visita
  const reenvio = await api.put(`/v1/visitas/${relatorioId}`, {
    data: {
      empresaId: empresa.id,
      checkin: null,
      resultadoId: null,
      respostas: [],
      concluir: false,
    },
  })
  expect(reenvio.ok()).toBe(true)
  expect(((await reenvio.json()) as { situacao: string }).situacao).toBe('concluido')
  const lista = (await (await api.get(`/v1/visitas?empresaId=${empresa.id}`)).json()) as unknown[]
  expect(lista).toHaveLength(1)
})
