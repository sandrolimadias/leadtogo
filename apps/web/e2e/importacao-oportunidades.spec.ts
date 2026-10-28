import { completarCnpj } from '@leadtogo/shared'
import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Importação de oportunidades (planilha inventada aqui; docs/plano_importacao_oportunidades.md): o assistente
// de ponta a ponta, o funil, o mapeamento das fases e dos motivos, o Kanban e o desfazer.

async function sessao(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  return api
}

let seq = 0
const cnpjNovo = () =>
  completarCnpj(`8${String(Date.now() % 1_000_000).padStart(6, '0')}${++seq % 10}0001`.slice(0, 12))

type Api = Awaited<ReturnType<typeof sessao>>

/** As empresas já na carteira, importadas pela API sem consultar a Receita. */
async function empresasNaCarteira(api: Api, cnpjs: string[]) {
  await api.patch('/v1/configuracoes/carteira', { data: { bloquearEmpresaNaoAtiva: false } })
  const opcoes = (await (await api.get('/v1/carteira/empresas/opcoes')).json()) as {
    vendedores: { id: string }[]
  }
  const grupos = (await (await api.get('/v1/configuracoes/tag-grupos')).json()) as {
    tags: { id: string; chaveSistema: string | null }[]
  }[]
  const lead = grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === 'lead')!
  const csv = ['CNPJ;Razão social', ...cnpjs.map((c, i) => `${c};Cliente ${i + 1} Ltda`)].join('\n')
  const criado = await api.post('/v1/importacao/lotes?arquivo=empresas.csv', {
    headers: { 'Content-Type': 'application/octet-stream' },
    data: Buffer.from(csv),
  })
  const lote = (await criado.json()) as { id: string }
  const alterado = await api.patch(`/v1/importacao/lotes/${lote.id}`, {
    data: {
      fonteDados: 'planilha',
      campos: { documento: 'CNPJ', razaoSocial: 'Razão social' },
      vendedorId: opcoes.vendedores[0]!.id,
      statusTagId: lead.id,
    },
  })
  expect(alterado.status()).toBe(200)
  expect((await api.post(`/v1/importacao/lotes/${lote.id}/iniciar`)).status()).toBe(200)
  await expect
    .poll(
      async () =>
        ((await (await api.get(`/v1/importacao/lotes/${lote.id}`)).json()) as { situacao: string })
          .situacao,
      { timeout: 60_000 },
    )
    .toBe('concluida')
}

const csvDe = (linhas: string[][]) => linhas.map((l) => l.join(';')).join('\n')

test('importação: oportunidades, do envio ao Kanban, com fases e motivos apontados e o desfazer', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1366, height: 900 })
  const api = await sessao(page, 'impoport')
  const [a, b] = [cnpjNovo(), cnpjNovo()]
  await empresasNaCarteira(api, [a, b])

  await page.goto('/oportunidades')
  await page.getByRole('button', { name: 'Importar planilha' }).click()
  await expect(page.getByRole('heading', { name: 'Importar planilha', level: 1 })).toBeVisible()
  await page.getByLabel('Arquivo da planilha').setInputFiles({
    name: 'crm-antigo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      csvDe([
        ['CNPJ', 'Título', 'Etapa', 'Status', 'Motivo', 'Valor', 'Mensalidade', 'Fechada em'],
        [a, 'Contrato anual', 'Em proposta', 'Ativo', '', 'R$ 2.000,00', '500,00', ''],
        [a, 'Renovação 2025', 'Negociação', 'Perdida', 'caro', '0', '800,00', '10/03/2026'],
        [b, 'Piloto', 'Negociação', '', '', '1.500', '', ''],
        [b, 'Sem motivo', '', 'Perdido', '', '', '', ''],
      ]),
    ),
  })
  await page.getByRole('button', { name: 'Enviar e mapear colunas' }).click()
  await expect(page.getByRole('region', { name: 'Colunas da planilha' })).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Passos da importação' }).getByRole('listitem'),
  ).toHaveCount(5)

  // funil padrão já marcado e a chave "vira Cliente" desligada
  const funil = page.getByRole('region', { name: 'Funil e fechamento' })
  await expect(
    funil.getByRole('switch', { name: 'Conquistadas mudam o Status da empresa para Cliente' }),
  ).not.toBeChecked()
  // "Negociação" casa sozinha; "Em proposta" eu aponto para Proposta; "caro" vira o motivo Preço
  const fases = page.getByRole('region', { name: 'Fases' })
  await expect(fases.getByRole('listitem', { name: 'Fases: Em proposta' })).toContainText('1 linha')
  await expect(fases.getByLabel('Cadastro para Negociação')).toHaveValue(/.+/)
  await fases.getByLabel('Cadastro para Em proposta').selectOption({ label: 'Proposta' })
  await page
    .getByRole('region', { name: 'Motivos' })
    .getByLabel('Cadastro para caro')
    .selectOption({ label: 'Preço (Perdida)' })

  await page.getByRole('button', { name: 'Ver a prévia' }).click()
  const previa = page.getByRole('list', { name: 'Resumo da prévia' })
  await expect(previa).toContainText('Oportunidade criada')
  await expect(previa).toContainText('Pulada: dado inválido')
  await expect(page.getByText('Oportunidade Perdida exige o Motivo.')).toBeVisible()
  await expect(page.getByText(/1 oportunidade entra já fechada/)).toBeVisible()
  await page.getByRole('button', { name: /^Importar 3 oportunidades$/ }).click()
  const resumo = page.getByRole('list', { name: 'Resumo do relatório' })
  await expect(resumo).toBeVisible({ timeout: 60_000 })
  await expect(resumo).toContainText('Oportunidades criadas')
  await expect(page.getByRole('listitem', { name: 'Linha 1' })).toContainText('Contrato anual')
  await expect(page.getByRole('listitem', { name: 'Linha 4' })).toContainText(
    'Pulada: dado inválido',
  )

  // No Kanban (funil padrão): as ativas nas fases certas, com o total calculado; a perdida não aparece
  await page.getByRole('link', { name: 'Ver oportunidades' }).click()
  const contrato = page.getByRole('article', { name: 'Contrato anual' })
  await expect(contrato).toBeVisible()
  await expect(contrato).toContainText('8.000')
  await expect(page.getByRole('article', { name: 'Piloto' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Renovação 2025' })).toHaveCount(0)

  // Desfazer: as três saem
  await page.goBack()
  await page.getByRole('button', { name: 'Desfazer importação' }).first().click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toContainText('O Status das empresas não volta')
  await dialogo.getByRole('button', { name: 'Desfazer importação' }).click()
  await expect(page.getByText('Importação desfeita').first()).toBeVisible()
  const restantes = (await (await api.get('/v1/carteira/oportunidades')).json()) as {
    total: number
  }
  expect(restantes.total).toBe(0)
})
