import type {
  AndamentoDaImportacao,
  LinhasDaImportacao,
  LoteDeImportacao,
  Origem,
  PreviaDaImportacao,
  TagGrupo,
} from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const LOTE = id(100)
const VENDEDOR = id(5)

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

const grupos: TagGrupo[] = [
  {
    id: id(1),
    nome: 'Status',
    selecao: 'unica',
    obrigatorio: true,
    sistema: true,
    automatico: false,
    ativo: true,
    ordem: 0,
    tags: [
      {
        id: id(11),
        tagGrupoId: id(1),
        nome: 'Lead',
        cor: 'teal',
        ativo: true,
        ordem: 0,
        chaveSistema: 'lead',
        apareceNoMapa: true,
        visivelAoAbrir: true,
      },
      {
        id: id(13),
        tagGrupoId: id(1),
        nome: 'Cliente',
        cor: 'green',
        ativo: true,
        ordem: 2,
        chaveSistema: 'cliente',
        apareceNoMapa: true,
        visivelAoAbrir: true,
      },
    ],
  },
]
const origens: Origem[] = [
  { id: id(21), nome: 'Indicação', ativo: true, ordem: 0, chaveSistema: null },
  { id: id(22), nome: 'Importação', ativo: true, ordem: 1, chaveSistema: 'importacao' },
]

const lote = (extra: Partial<LoteDeImportacao> = {}): LoteDeImportacao => ({
  id: LOTE,
  nome: 'clientes_serra',
  tipo: 'empresas',
  nomeArquivo: 'clientes_serra.xlsx',
  situacao: 'rascunho',
  totalLinhas: 40,
  colunas: ['CNPJ', 'Empresa', 'Cidade'],
  amostra: [{ CNPJ: '11.222.333/0001-81', Empresa: 'Café Montanhas', Cidade: 'Venda Nova' }],
  campos: {},
  sugestao: { documento: 'CNPJ', razaoSocial: 'Empresa' },
  fonteDados: 'planilha',
  perfilId: null,
  vendedorId: null,
  statusTagId: null,
  origemId: null,
  verticalId: null,
  tiposDeAtividade: {},
  funilId: null,
  clienteAoConquistar: false,
  valoresDeCampo: {},
  pendencias: ['Escolha o vendedor.'],
  criadoEm: '2026-10-15T12:00:00.000Z',
  concluidoEm: null,
  desfazerAte: null,
  desfeito: null,
  ...extra,
})

const previa = (extra: Partial<PreviaDaImportacao> = {}): PreviaDaImportacao => ({
  totalLinhas: 40,
  aImportar: 31,
  semCnpjValido: 3,
  repetidasNaPlanilha: 2,
  jaNaCarteira: 4,
  consultaAReceita: true,
  consultasNecessarias: 31,
  estimativaSegundos: 93,
  problemas: [{ numero: 7, motivo: 'CNPJ inválido' }],
  ...extra,
})

const andamento = (extra: Partial<AndamentoDaImportacao> = {}): AndamentoDaImportacao => ({
  situacao: 'em_andamento',
  totalLinhas: 40,
  processadas: 10,
  porResultado: { criada: 10, pendente: 30 },
  estimativaRestanteSegundos: 90,
  iniciadoEm: '2026-10-15T12:00:00.000Z',
  concluidoEm: null,
  ...extra,
})

const linhas = (extra: Partial<LinhasDaImportacao> = {}): LinhasDaImportacao => ({
  itens: [],
  total: 0,
  pagina: 1,
  porPagina: 50,
  colunas: ['CNPJ', 'Empresa', 'Cidade'],
  ...extra,
})

function servicos(
  extra: {
    papel?: 'admin' | 'gestor' | 'vendedor'
    lote?: Partial<LoteDeImportacao>
    lotes?: Record<string, unknown>
  } = {},
) {
  const base = servicosFalsos()
  const lotes = {
    ...base.importacao.lotes,
    detalhar: vi.fn(async () => ok(lote(extra.lote))),
    alterar: vi.fn(async (_id: string, dados: Record<string, unknown>) =>
      ok(lote({ ...extra.lote, ...(dados as Partial<LoteDeImportacao>), pendencias: [] })),
    ),
    previa: vi.fn(async () => ok(previa())),
    ...extra.lotes,
  }
  const s = servicosFalsos({
    me: async () => me(extra.papel),
    importacao: { ...base.importacao, lotes: lotes },
    carteira: {
      ...base.carteira,
      opcoes: vi.fn(async () =>
        ok({
          vendedores: [{ id: VENDEDOR, nome: 'Alessandro Dias' }],
          unicoMembro: true,
          cidades: [],
          diasAlertaDeContato: 60,
        }),
      ),
    },
    tags: { ...base.tags, listar: vi.fn(async () => ok(grupos)) },
    cadastros: {
      ...base.cadastros,
      origens: { ...base.cadastros.origens, listar: vi.fn(async () => ok(origens)) },
    },
  })
  return { s, lotes }
}

const abrir = (s: ReturnType<typeof servicos>, rota = `/importacao/${LOTE}`) =>
  renderizar(s.s, rota)

/** Sem rolagem vertical própria: nenhum ancestral (até o <main>) vira contêiner de rolagem, senão o `sticky` do cabeçalho não gruda na área central */
function temRolagemPropria(el: Element): boolean {
  for (let a = el.parentElement; a && a.tagName !== 'MAIN'; a = a.parentElement) {
    if (/(^|\s)overflow-(y-)?(auto|scroll|hidden)(\s|$)/.test(a.className)) return true
  }
  return false
}

describe('Importar planilha: enviar o arquivo', () => {
  it('o vendedor não importa: volta para o início', async () => {
    const { historico } = abrir(servicos({ papel: 'vendedor' }), '/importacao/nova')
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('escolhe a planilha, envia e abre o assistente do lote criado', async () => {
    const enviar = vi.fn(async (_arquivo: File, _nome?: string) => ok(lote()))
    const { historico } = abrir(servicos({ lotes: { enviar } }), '/importacao/nova')
    await screen.findByRole('heading', { name: 'Importar planilha' })
    expect(screen.getByRole('button', { name: 'Enviar e mapear colunas' })).toBeDisabled()
    expect(screen.getByRole('link', { name: /Baixar modelo/ })).toHaveAttribute(
      'href',
      '/v1/importacao/modelo',
    )

    const arquivo = new File(['x'], 'clientes_serra.xlsx')
    await userEvent.upload(screen.getByLabelText('Arquivo da planilha'), arquivo)
    expect(await screen.findByText('clientes_serra.xlsx')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nome da importação'), 'Serra 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar e mapear colunas' }))

    await waitFor(() => expect(enviar).toHaveBeenCalledWith(arquivo, 'Serra 2026', 'empresas'))
    await waitFor(() => expect(historico.location.pathname).toBe(`/importacao/${LOTE}`))
  })

  it('recusa na tela um arquivo que não é Excel nem CSV', async () => {
    const enviar = vi.fn()
    abrir(servicos({ lotes: { enviar } }), '/importacao/nova')
    await screen.findByRole('heading', { name: 'Importar planilha' })
    await userEvent.upload(
      screen.getByLabelText('Arquivo da planilha'),
      new File(['x'], 'foto.png'),
      { applyAccept: false },
    )
    expect(await screen.findByText(/Envie uma planilha Excel/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar e mapear colunas' })).toBeDisabled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('mostra o erro da API (ex.: arquivo sem cabeçalho) e deixa tentar de novo', async () => {
    const enviar = vi.fn(async () =>
      falha('sem_cabecalho', 'A primeira linha precisa ter os títulos.', 400),
    )
    abrir(servicos({ lotes: { enviar } }), '/importacao/nova')
    await userEvent.upload(
      await screen.findByLabelText('Arquivo da planilha'),
      new File(['x'], 'a.csv'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Enviar e mapear colunas' }))
    expect(await screen.findByText('A primeira linha precisa ter os títulos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar e mapear colunas' })).toBeEnabled()
  })
})

describe('Importar planilha: mapear colunas', () => {
  it('começa pela sugestão dos títulos, mostra exemplos e grava o mapeamento e a fonte', async () => {
    const s = servicos()
    abrir(s)
    const lista = await screen.findByRole('region', { name: 'Colunas da planilha' })
    expect(
      within(lista).getByText('2 de 3 colunas mapeadas. Revise antes de seguir.'),
    ).toBeInTheDocument()
    expect(within(lista).getByText('Ex.: 11.222.333/0001-81')).toBeInTheDocument()
    expect(within(lista).getByLabelText('Campo para a coluna CNPJ')).toHaveValue('documento')
    expect(within(lista).getByLabelText('Campo para a coluna Cidade')).toHaveValue('')

    await userEvent.click(screen.getByRole('radio', { name: /Buscar tudo na Receita/ }))
    await userEvent.selectOptions(
      within(lista).getByLabelText('Campo para a coluna Cidade'),
      'municipio',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ver as regras' }))

    await waitFor(() =>
      expect(s.lotes.alterar).toHaveBeenCalledWith(LOTE, {
        fonteDados: 'receita',
        campos: { documento: 'CNPJ', razaoSocial: 'Empresa', municipio: 'Cidade' },
      }),
    )
    expect(await screen.findByRole('region', { name: 'Regras de importação' })).toBeInTheDocument()
  })

  it('sem a coluna do CNPJ, ou com duas colunas para o mesmo campo, não deixa seguir', async () => {
    abrir(servicos({ lote: { sugestao: {} } }))
    const lista = await screen.findByRole('region', { name: 'Colunas da planilha' })
    expect(screen.getByText('Falta um campo obrigatório')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver as regras' })).toBeDisabled()

    await userEvent.selectOptions(
      within(lista).getByLabelText('Campo para a coluna CNPJ'),
      'documento',
    )
    await userEvent.selectOptions(
      within(lista).getByLabelText('Campo para a coluna Empresa'),
      'documento',
    )
    expect(screen.getAllByText('Repetida')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Ver as regras' })).toBeDisabled()

    await userEvent.selectOptions(within(lista).getByLabelText('Campo para a coluna Empresa'), '')
    expect(screen.getByRole('button', { name: 'Ver as regras' })).toBeEnabled()
  })

  it('o mapeamento que a API recusa aparece na tela', async () => {
    const alterar = vi.fn(async () => falha('mapeamento_invalido', 'A coluna não existe.', 400))
    abrir(servicos({ lotes: { alterar } }))
    await screen.findByRole('region', { name: 'Colunas da planilha' })
    await userEvent.click(screen.getByRole('button', { name: 'Ver as regras' }))
    expect(await screen.findByText('A coluna não existe.')).toBeInTheDocument()
  })
})

describe('Importar planilha: regras, prévia e carteira', () => {
  const perfis = [
    {
      id: id(50),
      nome: 'Metalmecânica ES',
      exigeSituacaoAtiva: true,
      estabelecimento: 'matriz' as const,
      excluirMei: true,
      cnaes: [1, 2, 3],
      aceitarCnaeSecundario: false,
      acaoForaDoPerfil: 'pular' as const,
      ativo: true,
    },
    {
      ...{
        id: id(51),
        nome: 'Antigo',
        exigeSituacaoAtiva: true,
        estabelecimento: 'ambas' as const,
        excluirMei: false,
        cnaes: [],
        aceitarCnaeSecundario: false,
        acaoForaDoPerfil: 'pular' as const,
      },
      ativo: false,
    },
  ]

  const comPerfis = (extra: Parameters<typeof servicos>[0] = {}) => {
    const s = servicos({ ...extra, lote: { campos: { documento: 'CNPJ' }, ...extra.lote } })
    s.s.importacao.perfis.listar = vi.fn(async () => ok(perfis))
    return s
  }

  it('regras: escolhe o perfil (só os ativos) e grava, sem opção de intervalo', async () => {
    const s = comPerfis()
    abrir(s)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver as regras' }))
    const regiao = await screen.findByRole('region', { name: 'Regras de importação' })
    const select = await within(regiao).findByLabelText('Perfil de regras')
    expect(within(select).queryByRole('option', { name: 'Antigo' })).toBeNull()
    await userEvent.selectOptions(select, 'Metalmecânica ES')
    expect(within(regiao).getByText(/Só matriz/)).toBeInTheDocument()

    // o intervalo da Receita é fixo (3 s): não há campo para mudar
    expect(screen.queryByLabelText(/Intervalo/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Ver a prévia' }))

    await waitFor(() =>
      expect(s.lotes.alterar).toHaveBeenLastCalledWith(LOTE, {
        perfilId: id(50),
      }),
    )
    expect(await screen.findByRole('region', { name: 'Tempo estimado' })).toBeInTheDocument()
  })

  it('prévia: contagens, tempo estimado e as linhas com problema', async () => {
    const s = comPerfis()
    abrir(s)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver as regras' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ver a prévia' }))

    const resumo = await screen.findByRole('list', { name: 'Resumo da prévia' })
    const itens = within(resumo)
      .getAllByRole('listitem')
      .map((l) => l.textContent)
    expect(itens).toEqual([
      '31A importar',
      '4Já na carteira',
      '2Repetidas na planilha',
      '3Sem CNPJ válido',
    ])
    expect(screen.getByText(/31 consultas à Receita/)).toBeInTheDocument()
    expect(screen.getByText(/uma a cada 3 segundos/)).toBeInTheDocument()
    expect(screen.getByText('2 min')).toBeInTheDocument()
    const problemas = screen.getByRole('region', { name: 'Linhas com problema' })
    expect(within(problemas).getByText('CNPJ inválido')).toBeInTheDocument()
  })

  it('prévia sem consulta à Receita: avisa que termina em instantes', async () => {
    const s = comPerfis({
      lotes: {
        previa: vi.fn(async () =>
          ok(previa({ consultaAReceita: false, consultasNecessarias: 0, estimativaSegundos: 0 })),
        ),
      },
    })
    abrir(s)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver as regras' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ver a prévia' }))
    expect(await screen.findByText(/não consulta a Receita/)).toBeInTheDocument()
  })

  it('carteira: o único membro, o Lead e a origem Importação já vêm escolhidos; importa e passa ao progresso', async () => {
    const iniciar = vi.fn(async () => ok(lote({ situacao: 'em_andamento' })))
    const s = comPerfis({ lotes: { iniciar, andamento: vi.fn(async () => ok(andamento())) } })
    s.lotes.alterar = vi.fn(async (_id: string, dados: Record<string, unknown>) =>
      ok(lote({ ...(dados as Partial<LoteDeImportacao>), situacao: 'pronta', pendencias: [] })),
    )
    s.s.importacao.lotes.alterar = s.lotes.alterar
    abrir(s)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver as regras' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ver a prévia' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Definir a carteira' }))

    const regiao = await screen.findByRole('region', { name: 'Carteira das empresas novas' })
    await waitFor(() => expect(within(regiao).getByLabelText(/Vendedor/)).toHaveValue(VENDEDOR))
    expect(within(regiao).getByLabelText(/Status/)).toHaveValue(id(11))
    expect(within(regiao).getByLabelText('Origem')).toHaveValue(id(22))
    await userEvent.selectOptions(within(regiao).getByLabelText(/Status/), 'Cliente')
    await userEvent.click(screen.getByRole('button', { name: 'Importar 31 empresas' }))

    await waitFor(() => expect(iniciar).toHaveBeenCalledWith(LOTE))
    expect(s.lotes.alterar).toHaveBeenLastCalledWith(LOTE, {
      vendedorId: VENDEDOR,
      statusTagId: id(13),
      origemId: id(22),
      verticalId: null,
    })
    expect(await screen.findByRole('progressbar', { name: 'Linhas processadas' })).toHaveAttribute(
      'aria-valuenow',
      '10',
    )
  })

  it('carteira: lote que ainda não está pronto mostra o que falta e não inicia', async () => {
    const iniciar = vi.fn()
    const s = comPerfis({ lotes: { iniciar } })
    s.s.importacao.lotes.alterar = vi.fn(async () =>
      ok(lote({ situacao: 'rascunho', pendencias: ['Mapeie a coluna do CNPJ.'] })),
    )
    abrir(s)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver as regras' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ver a prévia' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Definir a carteira' }))
    await userEvent.click(await screen.findByRole('button', { name: /Importar 31/ }))
    expect(await screen.findByText('Mapeie a coluna do CNPJ.')).toBeInTheDocument()
    expect(iniciar).not.toHaveBeenCalled()
  })
})

describe('Importar planilha: andamento e relatório', () => {
  it('acompanha o progresso e, quando termina, mostra o relatório', async () => {
    let terminou = false
    const s = servicos({
      lote: { situacao: 'em_andamento' },
      lotes: {
        andamento: vi.fn(async () =>
          ok(
            terminou
              ? andamento({
                  situacao: 'concluida',
                  processadas: 40,
                  porResultado: { criada: 40 },
                  estimativaRestanteSegundos: 0,
                })
              : andamento(),
          ),
        ),
      },
    })
    s.s.importacao.lotes.detalhar = vi.fn(async () =>
      ok(lote({ situacao: terminou ? 'concluida' : 'em_andamento' })),
    )
    abrir(s)

    const barra = await screen.findByRole('progressbar', { name: 'Linhas processadas' })
    await waitFor(() => expect(barra).toHaveAttribute('aria-valuenow', '10'))
    expect(screen.getByText('10 de 40 linhas')).toBeInTheDocument()
    expect(screen.getByText('Pode sair desta tela')).toBeInTheDocument()
    terminou = true
    await waitFor(() => expect(screen.getByText('Importação concluída')).toBeInTheDocument(), {
      timeout: 6000,
    })
  }, 15_000)

  it('cancela a importação em andamento', async () => {
    const cancelar = vi.fn(async () => ok(lote({ situacao: 'cancelada' })))
    const s = servicos({
      lote: { situacao: 'em_andamento' },
      lotes: {
        andamento: vi.fn(async () => ok(andamento())),
        cancelar,
        linhas: vi.fn(async () => ok(linhas())),
      },
    })
    abrir(s)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar importação' }))
    await waitFor(() => expect(cancelar).toHaveBeenCalledWith(LOTE))
    expect(await screen.findByText('Importação cancelada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
  })

  const item = (
    n: number,
    resultado: LinhasDaImportacao['itens'][number]['resultado'],
    motivo: string | null = null,
  ) => ({
    id: id(200 + n),
    numero: n + 1,
    resultado,
    motivo,
    empresaId: null,
    empresaNome: resultado === 'criada' ? `Empresa ${n}` : null,
    empresaNaCarteira: resultado === 'criada' ? true : null,
    contatoId: null,
    contatoNome: null,
    atividadeId: null,
    atividadeTitulo: null,
    oportunidadeId: null,
    oportunidadeTitulo: null,
    avisos: [],
    dados: { CNPJ: `000${n}`, Empresa: `Empresa ${n}`, Cidade: 'Vitória' },
  })
  const concluido = (extra: Parameters<typeof servicos>[0] = {}) =>
    servicos({
      ...extra,
      lote: { situacao: 'concluida', ...extra.lote },
      lotes: {
        andamento: vi.fn(async () =>
          ok(
            andamento({
              situacao: 'concluida',
              processadas: 40,
              porResultado: { criada: 30, fora_do_perfil: 6, pulada_sem_cnpj: 3, erro: 1 },
              estimativaRestanteSegundos: 0,
            }),
          ),
        ),
        linhas: vi.fn(async (_id: string, consulta?: { resultado?: string }) =>
          ok(
            consulta?.resultado === 'fora_do_perfil'
              ? linhas({
                  itens: [
                    item(1, 'fora_do_perfil', 'Fora do perfil: CNAE.'),
                    item(2, 'fora_do_perfil', 'Fora do perfil: MEI.'),
                  ],
                  total: 6,
                })
              : linhas({
                  itens: [item(0, 'criada'), item(1, 'fora_do_perfil', 'Fora do perfil: CNAE.')],
                  total: 40,
                }),
          ),
        ),
        ...extra.lotes,
      },
    })

  it('relatório: resumo por resultado, linhas com o motivo e o CSV do que não entrou', async () => {
    abrir(concluido())
    expect(await screen.findByText('Importação concluída')).toBeInTheDocument()
    const resumo = await screen.findByRole('list', { name: 'Resumo do relatório' })
    expect(
      within(resumo)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['Importadas30', 'Fora do perfil6', 'Puladas3', 'Com erro1'])
    const linha = await screen.findByRole('listitem', { name: 'Linha 2' })
    expect(within(linha).getByText('Fora do perfil: CNAE.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Baixar o que não entrou/ })).toHaveAttribute(
      'href',
      `/v1/importacao/lotes/${LOTE}/problemas.csv`,
    )
    expect(screen.getByRole('link', { name: /Ver empresas importadas/ })).toBeInTheDocument()
  })

  it('relatório: linhas por página lembradas por tabela, sem rolagem própria', async () => {
    const guardar = vi.fn(async () =>
      ok({
        tema: 'sistema' as const,
        menuRecolhido: false,
        visaoDashboard: 'minha' as const,
        filtroPadrao: {},
        porPagina: { importacao_linhas: 100 },
      }),
    )
    const s = concluido()
    s.s.alterarPreferencias = guardar as never
    abrir(s)
    const linha = await screen.findByRole('listitem', { name: 'Linha 1' })
    expect(s.lotes.linhas).toHaveBeenLastCalledWith(LOTE, { pagina: 1, porPagina: 25 })
    expect(temRolagemPropria(linha)).toBe(false)
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Linhas por página' }),
      '100',
    )
    await waitFor(() =>
      expect(guardar).toHaveBeenCalledWith({ porPagina: { importacao_linhas: 100 } }),
    )
    await waitFor(() =>
      expect(s.lotes.linhas).toHaveBeenLastCalledWith(LOTE, { pagina: 1, porPagina: 100 }),
    )
  })

  it('relatório: filtra por resultado e importa mesmo assim só as linhas marcadas (ou todas)', async () => {
    const importarForaDoPerfil = vi.fn(async () => ok(lote({ situacao: 'em_andamento' })))
    const s = concluido({ lotes: { importarForaDoPerfil } })
    abrir(s)
    await userEvent.click(await screen.findByRole('button', { name: /Fora do perfil · 6/ }))
    await waitFor(() =>
      expect(s.lotes.linhas).toHaveBeenLastCalledWith(LOTE, {
        pagina: 1,
        porPagina: 25,
        resultado: 'fora_do_perfil',
      }),
    )
    await userEvent.click(await screen.findByLabelText('Importar a linha 3'))
    await userEvent.click(screen.getByRole('button', { name: 'Importar mesmo assim (1 marcadas)' }))
    await waitFor(() => expect(importarForaDoPerfil).toHaveBeenCalledWith(LOTE, [id(202)]))
  })

  it('relatório: sem marcar nada, importa todas as fora do perfil', async () => {
    const importarForaDoPerfil = vi.fn(async () => ok(lote({ situacao: 'em_andamento' })))
    abrir(concluido({ lotes: { importarForaDoPerfil } }))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Importar mesmo assim (todas as 6)' }),
    )
    await waitFor(() => expect(importarForaDoPerfil).toHaveBeenCalledWith(LOTE, undefined))
  })

  const noPrazo = () => new Date(Date.now() + 6 * 86_400_000).toISOString()

  it('relatório: desfaz a importação (com confirmação) dentro do prazo de 7 dias', async () => {
    const desfazer = vi.fn(async () =>
      ok(
        lote({
          situacao: 'desfeita',
          concluidoEm: null,
          desfazerAte: null,
          desfeito: { removidas: 28, mantidas: 2 },
        }),
      ),
    )
    abrir(
      concluido({
        lote: { concluidoEm: '2026-10-15T12:00:00.000Z', desfazerAte: noPrazo() },
        lotes: { desfazer },
      }),
    )
    const secao = await screen.findByRole('region', { name: 'Desfazer a importação' })
    expect(within(secao).getByText(/Disponível até/)).toBeInTheDocument()
    expect(within(secao).getByText(/7 dias depois de terminar/)).toBeInTheDocument()
    await userEvent.click(within(secao).getByRole('button', { name: 'Desfazer importação' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Desfazer esta importação?')).toBeInTheDocument()
    expect(desfazer).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desfazer importação' }))
    await waitFor(() => expect(desfazer).toHaveBeenCalledWith(LOTE))
    expect(await screen.findByText('Importação desfeita', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/28 empresas saíram da carteira/)).toBeInTheDocument()
    expect(screen.getByText(/2 ficaram porque alguém alterou depois/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Desfazer a importação' })).toBeNull()
  })

  it('relatório: o erro do desfazer (ex.: prazo vencido) aparece no diálogo e nada muda', async () => {
    const desfazer = vi.fn(async () =>
      falha('prazo_de_desfazer_vencido', 'O prazo de 7 dias para desfazer já passou.', 409),
    )
    abrir(
      concluido({
        lote: { concluidoEm: '2026-10-15T12:00:00.000Z', desfazerAte: noPrazo() },
        lotes: { desfazer },
      }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer importação' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desfazer importação' }))
    expect(
      await within(dialogo).findByText('O prazo de 7 dias para desfazer já passou.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Importação concluída')).toBeInTheDocument()
  })

  it('relatório: depois do prazo não oferece desfazer', async () => {
    abrir(
      concluido({
        lote: {
          concluidoEm: '2026-10-13T12:00:00.000Z',
          desfazerAte: new Date(Date.now() - 3_600_000).toISOString(),
        },
      }),
    )
    await screen.findByText('Importação concluída')
    expect(screen.queryByRole('region', { name: 'Desfazer a importação' })).toBeNull()
  })

  it('relatório: o lote cancelado também pode ser desfeito', async () => {
    abrir(
      concluido({
        lote: { situacao: 'cancelada', desfazerAte: noPrazo() },
      }),
    )
    expect(await screen.findByText('Importação cancelada')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Desfazer a importação' })).toBeInTheDocument()
  })

  it('relatório de um lote desfeito: marca o que saiu e o que ficou na carteira', async () => {
    const s = concluido({
      lote: { situacao: 'desfeita', desfeito: { removidas: 1, mantidas: 1 } },
      lotes: {
        linhas: vi.fn(async () =>
          ok(
            linhas({
              itens: [
                { ...item(0, 'criada'), empresaNaCarteira: false },
                { ...item(1, 'criada'), empresaNaCarteira: true },
              ],
              total: 2,
            }),
          ),
        ),
      },
    })
    abrir(s)
    expect(await screen.findByText(/1 empresa saiu da carteira/)).toBeInTheDocument()
    expect(screen.getByText(/1 ficou porque alguém alterou depois/)).toBeInTheDocument()
    const saiu = await screen.findByRole('listitem', { name: 'Linha 1' })
    expect(within(saiu).getByText('Removida')).toBeInTheDocument()
    const ficou = screen.getByRole('listitem', { name: 'Linha 2' })
    expect(within(ficou).getByText('Ficou na carteira')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Desfazer a importação' })).toBeNull()
  })

  it('lote que parou: o relatório oferece Retomar, que reinicia só as pendentes', async () => {
    const iniciar = vi.fn(async () => ok(lote({ situacao: 'em_andamento' })))
    abrir(concluido({ lote: { situacao: 'falhou' }, lotes: { iniciar } }))
    expect(await screen.findByText('A importação parou antes do fim')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retomar' }))
    await waitFor(() => expect(iniciar).toHaveBeenCalledWith(LOTE))
  })

  it('lote que não existe: mostra o erro da API', async () => {
    abrir(
      servicos({
        lotes: {
          detalhar: vi.fn(async () =>
            falha('importacao_nao_encontrada', 'Importação não encontrada.', 404),
          ),
        },
      }),
    )
    expect(await screen.findByText('Importação não encontrada.')).toBeInTheDocument()
  })
})
