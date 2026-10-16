import type {
  AndamentoDaImportacao,
  LinhasDaImportacao,
  ListaDeLotesDeImportacao,
  LoteDeImportacao,
  PreviaDaImportacao,
  ValoresDoTipoDaImportacao,
} from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

// Importação de contatos e de atividades: os passos, a alternância do primeiro passo e o relatório.

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const LOTE = id(100)
const VISITA = id(301)
const LIGACAO = id(302)

const me = (papel: 'admin' | 'gestor' | 'vendedor' = 'admin') =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel,
        situacao: 'ativo' as const,
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

const lote = (
  tipo: 'contatos' | 'atividades',
  extra: Partial<LoteDeImportacao> = {},
): LoteDeImportacao => ({
  id: LOTE,
  nome: tipo === 'contatos' ? 'contatos_serra' : 'visitas_2026',
  tipo,
  nomeArquivo: `${tipo}.xlsx`,
  situacao: 'rascunho',
  totalLinhas: 40,
  colunas: tipo === 'contatos' ? ['CNPJ', 'Nome', 'E-mail'] : ['CNPJ', 'Tipo', 'Data'],
  amostra: [
    tipo === 'contatos'
      ? { CNPJ: '11.222.333/0001-81', Nome: 'Maria Exemplo', 'E-mail': 'maria@exemplo.com.br' }
      : { CNPJ: '11.222.333/0001-81', Tipo: 'Visita técnica', Data: '05/03/2026' },
  ],
  campos: {},
  sugestao:
    tipo === 'contatos'
      ? { documento: 'CNPJ', nome: 'Nome', email: 'E-mail' }
      : { documento: 'CNPJ', tipo: 'Tipo', data: 'Data' },
  fonteDados: 'planilha',
  perfilId: null,
  vendedorId: null,
  statusTagId: null,
  origemId: null,
  verticalId: null,
  tiposDeAtividade: {},
  pendencias: [],
  criadoEm: '2026-10-16T12:00:00.000Z',
  concluidoEm: null,
  desfazerAte: null,
  desfeito: null,
  ...extra,
})

const previa = (extra: Partial<PreviaDaImportacao> = {}): PreviaDaImportacao => ({
  totalLinhas: 40,
  aImportar: 30,
  semCnpjValido: 1,
  repetidasNaPlanilha: 0,
  jaNaCarteira: 0,
  consultaAReceita: false,
  consultasNecessarias: 0,
  estimativaSegundos: 0,
  problemas: [{ numero: 7, motivo: 'E-mail inválido: maria@' }],
  previsao: {
    criada: 25,
    vinculada: 5,
    ja_vinculada: 2,
    pulada_invalida: 5,
    pulada_empresa_inexistente: 2,
    pulada_sem_cnpj: 1,
  },
  comAviso: 4,
  ...extra,
})

const valores = (): ValoresDoTipoDaImportacao => ({
  itens: [
    {
      valor: 'Visita técnica',
      chave: 'visita tecnica',
      linhas: 12,
      tipoId: null,
      origem: 'sem_correspondencia',
    },
    { valor: 'Ligação', chave: 'ligacao', linhas: 20, tipoId: LIGACAO, origem: 'automatico' },
  ],
})

function servicos(
  tipo: 'contatos' | 'atividades',
  extra: {
    lote?: Partial<LoteDeImportacao>
    lotes?: Record<string, unknown>
    papel?: 'admin' | 'gestor' | 'vendedor'
  } = {},
) {
  const base = servicosFalsos()
  const lotes = {
    ...base.importacao.lotes,
    detalhar: vi.fn(async () => ok(lote(tipo, extra.lote))),
    alterar: vi.fn(async (_id: string, dados: Record<string, unknown>) =>
      ok(
        lote(tipo, { ...extra.lote, situacao: 'pronta', ...(dados as Partial<LoteDeImportacao>) }),
      ),
    ),
    previa: vi.fn(async () => ok(previa())),
    valoresDoTipo: vi.fn(async () => ok(valores())),
    iniciar: vi.fn(async () => ok(lote(tipo, { situacao: 'em_andamento' }))),
    ...extra.lotes,
  }
  const s = servicosFalsos({
    me: async () => me(extra.papel),
    importacao: { ...base.importacao, lotes: lotes },
    cadastros: {
      ...base.cadastros,
      tiposAtividade: {
        ...base.cadastros.tiposAtividade,
        listar: vi.fn(async () =>
          ok([
            {
              id: VISITA,
              nome: 'Visita',
              icone: 'map-pin',
              cor: 'blue',
              contaComo: 'visita',
              exigeEmpresa: true,
              sincronizaAgenda: false,
              chaveSistema: 'visita',
              ativo: true,
              ordem: 0,
            },
            {
              id: LIGACAO,
              nome: 'Ligação',
              icone: 'phone',
              cor: 'green',
              contaComo: 'contato',
              exigeEmpresa: true,
              sincronizaAgenda: false,
              chaveSistema: 'ligacao',
              ativo: true,
              ordem: 1,
            },
          ] as never),
        ),
      },
    },
  })
  return { s, lotes }
}

describe('Importar planilha: a alternância Empresas, Contatos e Atividades', () => {
  it('começa em Empresas, mostra a ordem recomendada e troca o texto e o modelo conforme o tipo', async () => {
    const base = servicosFalsos()
    renderizar(
      servicosFalsos({ me: async () => me(), importacao: base.importacao }),
      '/importacao/nova',
    )
    await screen.findByRole('heading', { name: 'Importar planilha' })
    const grupo = screen.getByRole('group', { name: 'O que importar' })
    expect(within(grupo).getByRole('button', { name: 'Empresas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText(/empresas → contatos → atividades/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Baixar modelo/ })).toHaveAttribute(
      'href',
      '/v1/importacao/modelo',
    )

    await userEvent.click(within(grupo).getByRole('button', { name: 'Contatos' }))
    expect(screen.getByRole('link', { name: /Baixar modelo/ })).toHaveAttribute(
      'href',
      '/v1/importacao/modelo?tipo=contatos',
    )
    expect(screen.getByText(/Cada linha vira um contato/)).toBeInTheDocument()
    expect(screen.getByText(/CNPJ da empresa\*/)).toBeInTheDocument()
    // 5 passos nos tipos novos
    expect(
      within(screen.getByRole('list', { name: 'Passos da importação' })).getAllByRole('listitem'),
    ).toHaveLength(5)

    await userEvent.click(within(grupo).getByRole('button', { name: 'Atividades' }))
    expect(screen.getByRole('link', { name: /Baixar modelo/ })).toHaveAttribute(
      'href',
      '/v1/importacao/modelo?tipo=atividades',
    )
    expect(screen.getByText(/Tipo de atividade\*/)).toBeInTheDocument()
  })

  it('o link das listas (?tipo=atividades) abre já no tipo e envia o arquivo com o tipo escolhido', async () => {
    const enviar = vi.fn(async (_a: File, _n?: string, _t?: string) => ok(lote('atividades')))
    const base = servicosFalsos()
    const { historico } = renderizar(
      servicosFalsos({
        me: async () => me(),
        importacao: { ...base.importacao, lotes: { ...base.importacao.lotes, enviar } },
      }),
      '/importacao/nova?tipo=atividades',
    )
    const grupo = await screen.findByRole('group', { name: 'O que importar' })
    expect(within(grupo).getByRole('button', { name: 'Atividades' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const arquivo = new File(['x'], 'visitas.xlsx')
    await userEvent.upload(screen.getByLabelText('Arquivo da planilha'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Enviar e mapear colunas' }))
    await waitFor(() => expect(enviar).toHaveBeenCalledWith(arquivo, undefined, 'atividades'))
    await waitFor(() => expect(historico.location.pathname).toBe(`/importacao/${LOTE}`))
  })
})

describe('Importar contatos: mapear, prévia e importar', () => {
  it('mapeia pela sugestão, exige CNPJ e Nome e segue direto para a prévia (sem Regras nem Carteira)', async () => {
    const s = servicos('contatos')
    renderizar(s.s, `/importacao/${LOTE}`)
    const lista = await screen.findByRole('region', { name: 'Colunas da planilha' })
    expect(within(lista).getByLabelText('Campo para a coluna Nome')).toHaveValue('nome')
    expect(screen.queryByRole('region', { name: 'Fonte dos dados' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Passos da importação' }).children).toHaveLength(5)

    // tira o Nome: falta campo obrigatório e o botão fica desligado
    await userEvent.selectOptions(within(lista).getByLabelText('Campo para a coluna Nome'), '')
    expect(await screen.findByText(/Mapeie: Nome/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver a prévia' })).toBeDisabled()
    await userEvent.selectOptions(within(lista).getByLabelText('Campo para a coluna Nome'), 'nome')
    await userEvent.click(screen.getByRole('button', { name: 'Ver a prévia' }))
    await waitFor(() =>
      expect(s.lotes.alterar).toHaveBeenCalledWith(LOTE, {
        campos: { documento: 'CNPJ', nome: 'Nome', email: 'E-mail' },
      }),
    )
    // a prévia, com os resultados previstos e o botão de importar
    expect(await screen.findByRole('list', { name: 'Resumo da prévia' })).toBeInTheDocument()
    const resumo = screen.getByRole('list', { name: 'Resumo da prévia' })
    expect(within(resumo).getByText('Contato criado')).toBeInTheDocument()
    expect(within(resumo).getByText('Vinculada a contato que já existia')).toBeInTheDocument()
    expect(within(resumo).getByText('Pulada: dado inválido')).toBeInTheDocument()
    expect(screen.getByText(/4 linhas entram com aviso/)).toBeInTheDocument()
    expect(screen.getByText('E-mail inválido: maria@')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Importar 30 contatos' }))
    await waitFor(() => expect(s.lotes.iniciar).toHaveBeenCalledWith(LOTE))
    expect(
      await screen.findByRole('region', { name: 'Andamento da importação' }),
    ).toBeInTheDocument()
  })
})

describe('Importar atividades: apontar os tipos', () => {
  it('lista cada valor da coluna Tipo, sugere pelo nome, deixa apontar ou pular e manda só as escolhas', async () => {
    const s = servicos('atividades', {
      lote: { campos: { documento: 'CNPJ', tipo: 'Tipo', data: 'Data' } },
    })
    renderizar(s.s, `/importacao/${LOTE}`)
    const bloco = await screen.findByRole('region', { name: 'Tipos de atividade' })
    await waitFor(() => expect(s.lotes.valoresDoTipo).toHaveBeenCalledWith(LOTE, 'Tipo'))
    const visita = await within(bloco).findByRole('listitem', { name: 'Tipo Visita técnica' })
    expect(within(visita).getByText('12 linhas')).toBeInTheDocument()
    expect(within(visita).getByText(/Sem tipo escolhido/)).toBeInTheDocument()
    // "Ligação" já vem com o tipo de mesmo nome
    expect(within(bloco).getByLabelText('Tipo para Ligação')).toHaveValue(LIGACAO)
    // aponta "Visita técnica" para Visita
    await userEvent.selectOptions(within(bloco).getByLabelText('Tipo para Visita técnica'), VISITA)
    await userEvent.click(screen.getByRole('button', { name: 'Ver a prévia' }))
    await waitFor(() =>
      expect(s.lotes.alterar).toHaveBeenCalledWith(LOTE, {
        campos: { documento: 'CNPJ', tipo: 'Tipo', data: 'Data' },
        tiposDeAtividade: { 'visita tecnica': VISITA, ligacao: LIGACAO },
      }),
    )
  })

  it('"Pular essas linhas" vai como nulo; a prévia mostra quantas ficam com quem importa', async () => {
    const s = servicos('atividades', {
      lote: { campos: { documento: 'CNPJ', tipo: 'Tipo', data: 'Data' } },
      lotes: {
        previa: vi.fn(async () =>
          ok(
            previa({
              previsao: { criada: 28, pulada_tipo_inexistente: 12, ficam_com_voce: 28 },
              aImportar: 28,
            }),
          ),
        ),
      },
    })
    renderizar(s.s, `/importacao/${LOTE}`)
    const bloco = await screen.findByRole('region', { name: 'Tipos de atividade' })
    await within(bloco).findByLabelText('Tipo para Visita técnica')
    await userEvent.selectOptions(within(bloco).getByLabelText('Tipo para Visita técnica'), 'pular')
    await userEvent.click(screen.getByRole('button', { name: 'Ver a prévia' }))
    await waitFor(() =>
      expect(s.lotes.alterar).toHaveBeenCalledWith(
        LOTE,
        expect.objectContaining({ tiposDeAtividade: { 'visita tecnica': null, ligacao: LIGACAO } }),
      ),
    )
    expect(
      await screen.findByText(/28 atividades não têm o e-mail do responsável/),
    ).toBeInTheDocument()
    expect(screen.getByText('Atividade criada')).toBeInTheDocument()
    expect(screen.getByText('Pulada: tipo de atividade sem correspondência')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar 28 atividades' })).toBeEnabled()
  })
})

describe('Importar contatos e atividades: o relatório', () => {
  const andamento = (porResultado: Record<string, number>): AndamentoDaImportacao => ({
    situacao: 'concluida',
    totalLinhas: 40,
    processadas: 40,
    porResultado,
    estimativaRestanteSegundos: 0,
    iniciadoEm: '2026-10-16T12:00:00.000Z',
    concluidoEm: '2026-10-16T12:05:00.000Z',
  })
  const linhas = (itens: LinhasDaImportacao['itens']): LinhasDaImportacao => ({
    itens,
    total: itens.length,
    pagina: 1,
    porPagina: 50,
    colunas: ['CNPJ', 'Nome'],
  })
  const item = (
    n: number,
    extra: Partial<LinhasDaImportacao['itens'][number]>,
  ): LinhasDaImportacao['itens'][number] => ({
    id: id(400 + n),
    numero: n,
    resultado: 'criada',
    motivo: null,
    empresaId: id(1),
    empresaNome: 'Empresa A',
    empresaNaCarteira: true,
    contatoId: null,
    contatoNome: null,
    atividadeId: null,
    atividadeTitulo: null,
    avisos: [],
    dados: { CNPJ: '1', Nome: 'x' },
    ...extra,
  })
  const concluido = (
    tipo: 'contatos' | 'atividades',
    porResultado: Record<string, number>,
    itens: LinhasDaImportacao['itens'],
    extra: Partial<LoteDeImportacao> = {},
  ) =>
    servicos(tipo, {
      lote: {
        situacao: 'concluida',
        desfazerAte: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        ...extra,
      },
      lotes: {
        andamento: vi.fn(async () => ok(andamento(porResultado))),
        linhas: vi.fn(async () => ok(linhas(itens))),
        desfazer: vi.fn(async () =>
          ok(lote(tipo, { situacao: 'desfeita', desfeito: { removidas: 3, mantidas: 1 } })),
        ),
      },
    })

  it('contatos: resumo, nome do contato criado, aviso na linha, vinculados e o link para Contatos', async () => {
    const s = concluido(
      'contatos',
      {
        criada: 25,
        vinculada: 5,
        ja_vinculada: 2,
        pulada_invalida: 5,
        pulada_empresa_inexistente: 2,
      },
      [
        item(1, {
          contatoId: id(9),
          contatoNome: 'Maria Exemplo',
          avisos: ['Papel na decisão "Rei" não existe no cadastro: o contato entrou sem papel.'],
        }),
        item(2, {
          resultado: 'vinculada',
          contatoId: id(9),
          contatoNome: 'Maria Exemplo',
          motivo: 'Vinculada a contato que já existia.',
        }),
        item(3, {
          resultado: 'pulada_empresa_inexistente',
          empresaId: null,
          empresaNome: null,
          motivo: 'O CNPJ não está na carteira.',
        }),
      ],
    )
    renderizar(s.s, `/importacao/${LOTE}`)
    const resumo = await screen.findByRole('list', { name: 'Resumo do relatório' })
    expect(within(resumo).getByText('Contatos criados')).toBeInTheDocument()
    expect(within(resumo).getByText('Vinculados')).toBeInTheDocument()
    expect(
      await screen.findByText(/25 contatos criados e 7 linhas que não entraram/),
    ).toBeInTheDocument()
    const primeira = await screen.findByRole('listitem', { name: 'Linha 1' })
    expect(within(primeira).getByText('Maria Exemplo')).toBeInTheDocument()
    expect(within(primeira).getByText('Contato criado')).toBeInTheDocument()
    expect(within(primeira).getByText(/Aviso: Papel na decisão "Rei"/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('listitem', { name: 'Linha 2' })).getByText(
        'Vinculada a contato que já existia',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver contatos' })).toHaveAttribute('href', '/contatos')
    // o desfazer fala de contatos
    expect(
      screen.getByText(/inativa os vínculos que ele criou com contatos que já existiam/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Baixar o que não entrou/ })).toHaveAttribute(
      'href',
      `/v1/importacao/lotes/${LOTE}/problemas.csv`,
    )
  })

  it('atividades: resumo próprio, título criado, "já existiam" e desfazer com o recálculo da carteira', async () => {
    const s = concluido(
      'atividades',
      { criada: 20, pulada_duplicada: 3, pulada_tipo_inexistente: 12, pulada_no_futuro: 2 },
      [
        item(1, { atividadeId: id(8), atividadeTitulo: 'Visita de apresentação' }),
        item(2, { resultado: 'pulada_duplicada', motivo: 'Já existe uma atividade igual.' }),
      ],
    )
    renderizar(s.s, `/importacao/${LOTE}`)
    const resumo = await screen.findByRole('list', { name: 'Resumo do relatório' })
    expect(within(resumo).getByText('Atividades criadas')).toBeInTheDocument()
    expect(within(resumo).getByText('Já existiam')).toBeInTheDocument()
    expect(await screen.findByText('Visita de apresentação')).toBeInTheDocument()
    expect(screen.getByText('Pulada: atividade idêntica já existe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver atividades' })).toHaveAttribute(
      'href',
      '/atividades',
    )
    expect(
      screen.getByText(
        /recalcula a última visita, o último contato, a próxima atividade e as tags/,
      ),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer importação' }))
    const dialogo = await screen.findByRole('dialog')
    expect(
      within(dialogo).getByText(/a carteira das empresas afetadas é recalculada/),
    ).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desfazer importação' }))
    await waitFor(() => expect(s.lotes.desfazer).toHaveBeenCalledWith(LOTE))
    expect(
      await screen.findByText(
        /3 atividades desfeitos|3 atividades desfeitas|3 atividades desfeitos\./,
      ),
    ).toBeInTheDocument()
  })
})

describe('Importações: lista com o tipo', () => {
  it('mostra o tipo de cada lote, filtra por tipo e leva o tipo para "Importar planilha"', async () => {
    const lote = (
      tipo: 'empresas' | 'contatos' | 'atividades',
      n: number,
    ): ListaDeLotesDeImportacao['itens'][number] => ({
      id: id(500 + n),
      nome: `lote ${tipo}`,
      tipo,
      nomeArquivo: `${tipo}.csv`,
      situacao: 'concluida',
      totalLinhas: 10,
      totais: { criada: 8, vinculada: tipo === 'contatos' ? 2 : 0 },
      criadoPor: 'Ale',
      criadoEm: '2026-10-16T12:00:00.000Z',
      concluidoEm: '2026-10-16T12:05:00.000Z',
    })
    const base = servicosFalsos()
    const listar = vi.fn(async (_p?: number, _pp?: number, tipo?: string) => {
      const todos = [lote('empresas', 1), lote('contatos', 2), lote('atividades', 3)]
      const itens = tipo ? todos.filter((l) => l.tipo === tipo) : todos
      return ok({ itens, total: itens.length, pagina: 1, porPagina: 25 })
    })
    const { historico } = renderizar(
      servicosFalsos({
        me: async () => me(),
        importacao: { ...base.importacao, lotes: { ...base.importacao.lotes, listar } },
      }),
      '/importacao',
    )
    const lista = await screen.findByRole('list', { name: 'Importações' })
    const contatos = within(lista).getByRole('listitem', { name: 'lote contatos' })
    expect(within(contatos).getByText('Contatos')).toBeInTheDocument()
    expect(within(contatos).getByText(/8 criados · 2 vinculados/)).toBeInTheDocument()
    expect(within(lista).getByRole('listitem', { name: 'lote atividades' })).toHaveTextContent(
      '8 criadas',
    )

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Tipo de importação' })).getByRole('button', {
        name: 'Atividades',
      }),
    )
    await waitFor(() => expect(listar).toHaveBeenLastCalledWith(1, 25, 'atividades'))
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Importar planilha' })[0] as HTMLElement,
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/importacao/nova'))
    expect(historico.location.search).toContain('tipo=atividades')
  })
})
