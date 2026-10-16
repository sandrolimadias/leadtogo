import { completarCnpj } from '@leadtogo/shared'
import { expect, type Page, test } from '@playwright/test'

import { administradorComSessao, limparLimites } from './ambiente'

// Importação de contatos e de atividades (planilhas inventadas aqui): o assistente de ponta a ponta,
// o mapeamento dos tipos, o efeito na carteira da empresa e o desfazer.

async function sessao(page: Page, nome: string) {
  const { api } = await administradorComSessao(nome)
  await page.context().addCookies((await api.storageState()).cookies)
  await limparLimites()
  return api
}

let seq = 0
const cnpjNovo = () =>
  completarCnpj(`5${String(Date.now() % 1_000_000).padStart(6, '0')}${++seq % 10}0001`.slice(0, 12))

type Api = Awaited<ReturnType<typeof sessao>>

/** As duas empresas já na carteira, importadas pelo próprio assistente (a API) sem consultar a Receita. */
async function empresasNaCarteira(api: Api, cnpjs: string[]) {
  await api.patch('/v1/configuracoes/carteira', { data: { bloquearEmpresaNaoAtiva: false } })
  const opcoes = (await (await api.get('/v1/carteira/empresas/opcoes')).json()) as {
    vendedores: { id: string }[]
  }
  const grupos = (await (await api.get('/v1/configuracoes/tag-grupos')).json()) as {
    tags: { id: string; chaveSistema: string | null }[]
  }[]
  const lead = grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === 'lead')!
  const csv = ['CNPJ;Razão social', ...cnpjs.map((c, i) => `${c};Empresa ${i + 1} Ltda`)].join('\n')
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

async function enviar(page: Page, tipo: string, nome: string, conteudo: string) {
  await page.goto(`/importacao/nova?tipo=${tipo}`)
  await expect(page.getByRole('heading', { name: 'Importar planilha', level: 1 })).toBeVisible()
  await page.getByLabel('Arquivo da planilha').setInputFiles({
    name: nome,
    mimeType: 'text/csv',
    buffer: Buffer.from(conteudo),
  })
  await page.getByRole('button', { name: 'Enviar e mapear colunas' }).click()
  await expect(page.getByRole('region', { name: 'Colunas da planilha' })).toBeVisible()
}

test('importação: contatos e atividades, do envio ao relatório, com o efeito na carteira e o desfazer', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1366, height: 900 })
  const api = await sessao(page, 'impnovos')
  const [a, b] = [cnpjNovo(), cnpjNovo()]
  await empresasNaCarteira(api, [a, b])

  // ---- Contatos ----
  await page.goto('/contatos')
  await expect(page.getByRole('button', { name: 'Importar planilha' })).toBeVisible()
  await enviar(
    page,
    'contatos',
    'contatos.csv',
    csvDe([
      ['CNPJ', 'Nome', 'E-mail', 'Telefone', 'Cargo'],
      [a, 'Maria Exemplo', 'maria@exemplo.com.br', '(27) 99999-0001', 'Diretora'],
      [b, 'Maria Exemplo', 'maria@exemplo.com.br', '', 'Sócia'],
      [a, 'E-mail Ruim', 'sem-arroba', '', ''],
      [cnpjNovo(), 'Sem Empresa', 'sem@exemplo.com.br', '', ''],
    ]),
  )
  // 5 passos, sem Regras nem Carteira
  await expect(
    page.getByRole('list', { name: 'Passos da importação' }).getByRole('listitem'),
  ).toHaveCount(5)
  await page.getByRole('button', { name: 'Ver a prévia' }).click()
  const previa = page.getByRole('list', { name: 'Resumo da prévia' })
  await expect(previa).toContainText('Contato criado')
  await expect(previa).toContainText('Vinculada a contato que já existia')
  await expect(page.getByText('E-mail inválido: sem-arroba')).toBeVisible()
  await page.getByRole('button', { name: /^Importar 2 contatos$/ }).click()
  await expect(page.getByRole('list', { name: 'Resumo do relatório' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('list', { name: 'Resumo do relatório' })).toContainText(
    'Contatos criados',
  )
  await expect(page.getByRole('listitem', { name: 'Linha 1' })).toContainText('Maria Exemplo')
  await expect(page.getByRole('listitem', { name: 'Linha 2' })).toContainText(
    'Vinculada a contato que já existia',
  )
  await expect(page.getByRole('listitem', { name: 'Linha 3' })).toContainText(
    'Pulada: dado inválido',
  )
  await expect(page.getByRole('listitem', { name: 'Linha 4' })).toContainText(
    'CNPJ não está na carteira',
  )
  await page.getByRole('link', { name: 'Ver contatos' }).click()
  await expect(page.getByRole('table')).toContainText('Maria Exemplo')

  // ---- Atividades ----
  await page.goto('/atividades')
  await expect(page.getByRole('button', { name: 'Importar planilha' })).toBeVisible()
  await enviar(
    page,
    'atividades',
    'atividades.csv',
    csvDe([
      ['CNPJ', 'Tipo', 'Título', 'Data', 'Hora', 'Situação', 'Resultado', 'E-mail do contato'],
      [
        a,
        'Visita técnica',
        'Visita ao cliente',
        '01/09/2026',
        '10:00',
        'Realizada',
        'Boa conversa',
        'maria@exemplo.com.br',
      ],
      [a, 'Ligação', 'Retorno', '01/10/2026', '09:00', 'Realizada', 'Pediu proposta', ''],
      [b, 'Ligação', 'Retornar', '01/01/2031', '', '', '', ''],
      [b, 'Almoço', 'Almoço de negócios', '02/09/2026', '', 'Realizada', 'ok', ''],
    ]),
  )
  // cada valor da coluna Tipo: "Ligação" casa sozinho; "Visita técnica" eu aponto; "Almoço" fica sem tipo
  const tipos = page.getByRole('region', { name: 'Tipos de atividade' })
  await expect(tipos.getByRole('listitem', { name: 'Tipo Visita técnica' })).toContainText(
    '1 linha',
  )
  await expect(tipos.getByLabel('Tipo para Ligação')).toHaveValue(/.+/)
  await tipos.getByLabel('Tipo para Visita técnica').selectOption({ label: 'Visita' })
  await page.getByRole('button', { name: 'Ver a prévia' }).click()
  const previaAtiv = page.getByRole('list', { name: 'Resumo da prévia' })
  await expect(previaAtiv).toContainText('Atividade criada')
  await expect(previaAtiv).toContainText('Pulada: tipo de atividade sem correspondência')
  await page.getByRole('button', { name: /^Importar 3 atividades$/ }).click()
  await expect(page.getByRole('list', { name: 'Resumo do relatório' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('list', { name: 'Resumo do relatório' })).toContainText(
    'Atividades criadas',
  )
  await expect(page.getByRole('listitem', { name: 'Linha 4' })).toContainText('sem correspondência')

  // A carteira da empresa A foi atualizada como se as atividades tivessem sido registradas à mão
  const empresaA = async () => {
    const lista = (await (await api.get(`/v1/carteira/empresas?busca=${a}`)).json()) as {
      itens: { id: string }[]
    }
    return (await (await api.get(`/v1/carteira/empresas/${lista.itens[0]!.id}`)).json()) as {
      ultimaVisitaEm: string | null
      ultimoContatoEm: string | null
      tags: { nome: string }[]
    }
  }
  const depois = await empresaA()
  expect(depois.ultimaVisitaEm).not.toBeNull()
  expect(depois.ultimoContatoEm).not.toBeNull()
  expect(depois.tags.map((t) => t.nome)).toEqual(expect.arrayContaining(['Visitada', 'Contactada']))

  // Desfazer: tudo o que o lote criou sai e a carteira volta a ficar sem visita e sem contato
  await page.getByRole('button', { name: 'Desfazer importação' }).first().click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toContainText('a carteira das empresas afetadas é recalculada')
  await dialogo.getByRole('button', { name: 'Desfazer importação' }).click()
  await expect(page.getByText('Importação desfeita').first()).toBeVisible()
  const antes = await empresaA()
  expect(antes.ultimaVisitaEm).toBeNull()
  expect(antes.ultimoContatoEm).toBeNull()
  expect(antes.tags.map((t) => t.nome)).not.toContain('Visitada')

  // A lista de importações mostra os três lotes, com o tipo de cada um
  await page.goto('/importacao')
  const lista = page.getByRole('list', { name: 'Importações' })
  await expect(lista.getByRole('listitem')).toHaveCount(3)
  await page
    .getByRole('group', { name: 'Tipo de importação' })
    .getByRole('button', { name: 'Atividades' })
    .click()
  await expect(lista.getByRole('listitem')).toHaveCount(1)
})

test('importação: a página não rola e o assistente cabe no celular (390×844)', async ({ page }) => {
  await sessao(page, 'impcel')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/importacao/nova?tipo=atividades')
  await expect(page.getByRole('heading', { name: 'Importar planilha', level: 1 })).toBeVisible()
  const grupo = page.getByRole('group', { name: 'O que importar' })
  await expect(grupo.getByRole('button', { name: 'Atividades' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const medidas = await page.evaluate(() => {
    const e = document.scrollingElement!
    return { v: e.scrollHeight === e.clientHeight, h: e.scrollWidth === e.clientWidth }
  })
  expect(medidas).toEqual({ v: true, h: true })
})
