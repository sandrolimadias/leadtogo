import type {
  AndamentoDaImportacao,
  LinhasDaImportacao,
  LoteDeImportacao,
  PreviaDaImportacao,
  ValoresDoTipoDaImportacao,
} from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

// Importação de oportunidades: o funil, a chave "vira Cliente", os valores das colunas, a prévia e o
// relatório (docs/plano_importacao_oportunidades.md, seção 7).

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const me = () =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel: 'admin',
        situacao: 'ativo' as const,
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })
const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const LOTE = id(100)
const PADRAO = id(201)
const RENOVACAO = id(202)
const PROPOSTA = id(301)
const NEGOCIACAO = id(302)
const CONTATO = id(303)
const PRECO = id(401)
const INDICACAO = id(501)

const fase = (fid: string, nome: string, funilId: string, ordem: number) => ({
  id: fid,
  funilId,
  nome,
  ordem,
  cor: 'blue',
  probabilidadePadrao: 50,
  diasAlertaParada: null,
  ativo: true,
})
const FUNIS = [
  {
    id: PADRAO,
    nome: 'Vendas',
    padrao: true,
    ativo: true,
    ordem: 0,
    fases: [fase(PROPOSTA, 'Proposta', PADRAO, 0), fase(NEGOCIACAO, 'Negociação', PADRAO, 1)],
  },
  {
    id: RENOVACAO,
    nome: 'Renovação',
    padrao: false,
    ativo: true,
    ordem: 1,
    fases: [fase(CONTATO, 'Contato', RENOVACAO, 0)],
  },
]

const lote = (extra: Partial<LoteDeImportacao> = {}): LoteDeImportacao => ({
  id: LOTE,
  nome: 'crm_antigo',
  tipo: 'oportunidades',
  nomeArquivo: 'oportunidades.xlsx',
  situacao: 'rascunho',
  totalLinhas: 40,
  colunas: ['CNPJ', 'Título', 'Etapa', 'Status', 'Motivo'],
  amostra: [
    {
      CNPJ: '11.222.333/0001-81',
      Título: 'Contrato 2027',
      Etapa: 'Em proposta',
      Status: 'Perdida',
      Motivo: 'caro',
    },
  ],
  campos: {},
  sugestao: {
    documento: 'CNPJ',
    titulo: 'Título',
    fase: 'Etapa',
    status: 'Status',
    motivo: 'Motivo',
  },
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
  pendencias: [],
  criadoEm: '2026-10-28T12:00:00.000Z',
  concluidoEm: null,
  desfazerAte: null,
  desfeito: null,
  ...extra,
})

const VALORES: Record<string, ValoresDoTipoDaImportacao> = {
  fase: {
    itens: [
      {
        valor: 'Em proposta',
        chave: 'em proposta',
        linhas: 12,
        tipoId: null,
        origem: 'sem_correspondencia',
      },
      {
        valor: 'Negociação',
        chave: 'negociacao',
        linhas: 8,
        tipoId: NEGOCIACAO,
        origem: 'automatico',
      },
    ],
  },
  motivo: {
    itens: [
      { valor: 'caro', chave: 'caro', linhas: 5, tipoId: null, origem: 'sem_correspondencia' },
    ],
  },
}

function servicos(
  extra: { lote?: Partial<LoteDeImportacao>; lotes?: Record<string, unknown> } = {},
) {
  const base = servicosFalsos()
  let atual = lote(extra.lote)
  const lotes = {
    ...base.importacao.lotes,
    detalhar: vi.fn(async () => ok(atual)),
    alterar: vi.fn(async (_id: string, dados: Record<string, unknown>) => {
      atual = { ...atual, situacao: 'pronta', ...(dados as Partial<LoteDeImportacao>) }
      return ok(atual)
    }),
    previa: vi.fn(async () => ok(previa())),
    valoresDoTipo: vi.fn(async (_id: string, _coluna?: string, campo?: string) =>
      ok(VALORES[campo ?? ''] ?? { itens: [] }),
    ),
    iniciar: vi.fn(async () => ok(lote({ situacao: 'em_andamento' }))),
    ...extra.lotes,
  }
  const cadastro = (itens: unknown[]) => ({ listar: vi.fn(async () => ok(itens as never)) })
  const s = servicosFalsos({
    me: async () => me(),
    importacao: { ...base.importacao, lotes },
    funis: { ...base.funis, listar: vi.fn(async () => ok(FUNIS as never)) },
    cadastros: {
      ...base.cadastros,
      motivos: {
        ...base.cadastros.motivos,
        ...cadastro([{ id: PRECO, nome: 'Preço', ativo: true, ordem: 0, aplicaA: ['perdido'] }]),
      },
      origens: {
        ...base.cadastros.origens,
        ...cadastro([
          { id: INDICACAO, nome: 'Indicação', ativo: true, ordem: 0, chaveSistema: null },
        ]),
      },
      solucoes: { ...base.cadastros.solucoes, ...cadastro([]) },
    },
  })
  return { s, lotes }
}

const previa = (extra: Partial<PreviaDaImportacao> = {}): PreviaDaImportacao => ({
  totalLinhas: 40,
  aImportar: 30,
  semCnpjValido: 0,
  repetidasNaPlanilha: 0,
  jaNaCarteira: 0,
  consultaAReceita: false,
  consultasNecessarias: 0,
  estimativaSegundos: 0,
  problemas: [{ numero: 4, motivo: 'Oportunidade Perdida exige o Motivo.' }],
  previsao: { criada: 30, pulada_duplicada: 4, pulada_invalida: 6, fechadas: 9 },
  comAviso: 2,
  ...extra,
})

describe('Importar oportunidades: mapear colunas', () => {
  it('mostra o funil (padrão marcado) e a chave "vira Cliente" desligada; trocar o funil vale na hora', async () => {
    const { s, lotes } = servicos()
    renderizar(s, `/importacao/${LOTE}`)
    const bloco = await screen.findByRole('region', { name: 'Funil e fechamento' })
    const funil = await within(bloco).findByLabelText('Funil')
    expect(funil).toHaveValue(PADRAO)
    const chave = within(bloco).getByRole('switch', {
      name: 'Conquistadas mudam o Status da empresa para Cliente',
    })
    expect(chave).not.toBeChecked()

    await userEvent.selectOptions(funil, RENOVACAO)
    await waitFor(() => expect(lotes.alterar).toHaveBeenCalledWith(LOTE, { funilId: RENOVACAO }))
    await userEvent.click(chave)
    await waitFor(() =>
      expect(lotes.alterar).toHaveBeenCalledWith(LOTE, { clienteAoConquistar: true }),
    )
  })

  it('lista os valores de Fase e Motivo, sugere pelo nome e manda só o que a pessoa escolheu', async () => {
    const { s, lotes } = servicos()
    renderizar(s, `/importacao/${LOTE}`)
    const fases = await screen.findByRole('region', { name: 'Fases' })
    await waitFor(() => expect(lotes.valoresDoTipo).toHaveBeenCalledWith(LOTE, 'Etapa', 'fase'))
    const proposta = await within(fases).findByRole('listitem', { name: 'Fases: Em proposta' })
    expect(within(proposta).getByText('12 linhas')).toBeInTheDocument()
    expect(within(proposta).getByText(/Sem fase escolhida/)).toBeInTheDocument()
    expect(within(fases).getByLabelText('Cadastro para Negociação')).toHaveValue(NEGOCIACAO)
    await userEvent.selectOptions(
      within(fases).getByLabelText('Cadastro para Em proposta'),
      PROPOSTA,
    )

    const motivos = await screen.findByRole('region', { name: 'Motivos' })
    const caro = await within(motivos).findByLabelText('Cadastro para caro')
    // o motivo mostra para quais status vale
    expect(within(motivos).getByRole('option', { name: 'Preço (Perdida)' })).toBeInTheDocument()
    await userEvent.selectOptions(caro, 'pular')
    // sem coluna de Origem nem de Solução: esses blocos não aparecem
    expect(screen.queryByRole('region', { name: 'Origens' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ver a prévia' }))
    await waitFor(() =>
      expect(lotes.alterar).toHaveBeenCalledWith(LOTE, {
        campos: {
          documento: 'CNPJ',
          titulo: 'Título',
          fase: 'Etapa',
          status: 'Status',
          motivo: 'Motivo',
        },
        valoresDeCampo: { fase: { 'em proposta': PROPOSTA }, motivo: { caro: null } },
      }),
    )
  })
})

describe('Importar oportunidades: prévia e relatório', () => {
  it('a prévia conta as que entram fechadas e o botão diz quantas oportunidades', async () => {
    const { s } = servicos({ lote: { situacao: 'pronta', campos: { documento: 'CNPJ' } } })
    renderizar(s, `/importacao/${LOTE}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver a prévia' }))
    expect(await screen.findByText(/9 oportunidades entram já fechadas/)).toBeInTheDocument()
    expect(screen.getByText('Oportunidade criada')).toBeInTheDocument()
    expect(screen.getByText('Pulada: oportunidade igual já existe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar 30 oportunidades' })).toBeEnabled()
  })

  it('o relatório mostra o título criado, o resumo próprio e o desfazer das oportunidades', async () => {
    const andamento: AndamentoDaImportacao = {
      situacao: 'concluida',
      totalLinhas: 3,
      processadas: 3,
      porResultado: { criada: 2, pulada_duplicada: 1 },
      estimativaRestanteSegundos: 0,
      iniciadoEm: '2026-10-28T12:00:00.000Z',
      concluidoEm: '2026-10-28T12:01:00.000Z',
    }
    const item = (
      n: number,
      extra: Partial<LinhasDaImportacao['itens'][number]>,
    ): LinhasDaImportacao['itens'][number] => ({
      id: id(600 + n),
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
      oportunidadeId: id(700 + n),
      oportunidadeTitulo: null,
      avisos: [],
      dados: { CNPJ: '1' },
      ...extra,
    })
    const { s, lotes } = servicos({
      lote: {
        situacao: 'concluida',
        desfazerAte: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      },
      lotes: {
        andamento: vi.fn(async () => ok(andamento)),
        linhas: vi.fn(async () =>
          ok({
            itens: [
              item(1, { oportunidadeTitulo: 'Contrato 2027' }),
              item(2, { resultado: 'pulada_duplicada', oportunidadeTitulo: 'Renovação' }),
            ],
            total: 2,
            pagina: 1,
            porPagina: 50,
            colunas: ['CNPJ'],
          }),
        ),
        desfazer: vi.fn(async () =>
          ok(lote({ situacao: 'desfeita', desfeito: { removidas: 2, mantidas: 0 } })),
        ),
      },
    })
    renderizar(s, `/importacao/${LOTE}`)
    const resumo = await screen.findByRole('list', { name: 'Resumo do relatório' })
    expect(within(resumo).getByText('Oportunidades criadas')).toBeInTheDocument()
    expect(await screen.findByText('Contrato 2027')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver oportunidades' })).toHaveAttribute(
      'href',
      '/oportunidades',
    )
    expect(screen.getByText(/junto com a atividade de retomada das suspensas/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer importação' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/O Status das empresas não volta/)).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desfazer importação' }))
    await waitFor(() => expect(lotes.desfazer).toHaveBeenCalledWith(LOTE))
    expect(await screen.findByText(/2 oportunidades desfeitas/)).toBeInTheDocument()
  })
})
