import type { OportunidadeDetalhada } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'
import { id, meComPapel } from '@/telas/contatos/fixtures'

import { FASES, gruposDeOportunidade, oportunidade, tagNaOportunidade } from './fixtures'

const detalhada = (extra: Partial<OportunidadeDetalhada> = {}): OportunidadeDetalhada => ({
  ...oportunidade(1, { probabilidade: 80, probabilidadeManual: true, valorPonderado: 6400 }),
  historico: [
    {
      id: id(990),
      em: '2026-10-12T12:00:00.000Z',
      por: { id: id(800), nome: 'Alessandro Dias' },
      acao: 'fase',
      titulo: 'Fase: Qualificação → Diagnóstico',
      detalhe: null,
    },
    {
      id: id(991),
      em: '2026-10-10T12:00:00.000Z',
      por: null,
      acao: 'criada',
      titulo: 'Criada na fase Qualificação',
      detalhe: null,
    },
  ],
  ...extra,
})

function servicos(o: OportunidadeDetalhada = detalhada()) {
  const base = servicosFalsos()
  const detalhar = vi.fn(async (_id: string) => ok(o))
  const definirTags = vi.fn(async (_id: string, _t: string[]) => ok(o))
  const s = servicosFalsos({
    me: async () => meComPapel('admin'),
    oportunidades: { ...base.oportunidades, detalhar, definirTags },
    tags: {
      ...base.tags,
      listar: vi.fn(async (aplicaA?: string) =>
        ok(aplicaA === 'oportunidade' ? gruposDeOportunidade : []),
      ),
    },
    funis: {
      ...base.funis,
      listar: vi.fn(async () =>
        ok([
          {
            id: o.funil.id,
            nome: o.funil.nome,
            padrao: true,
            ativo: true,
            ordem: 0,
            fases: FASES.map((f, i) => ({ ...f, funilId: o.funil.id, ativo: true, ordem: i })),
          },
        ]),
      ),
    },
  })
  return { s, detalhar, definirTags }
}

describe('Ficha da oportunidade', () => {
  it('mostra os valores (único, mensal × meses, total, ponderado) e a probabilidade editada à mão', async () => {
    const x = servicos()
    renderizar(x.s, `/oportunidades/${oportunidade(1).id}`)
    expect(await screen.findByRole('heading', { name: 'Oportunidade 1' })).toBeInTheDocument()
    expect(screen.getByText('Ativa')).toBeInTheDocument()
    const dados = screen.getByText('Valor mensal × duração').parentElement as HTMLElement
    expect(dados).toHaveTextContent(/R\$\s500,00 × 12 meses/)
    expect(screen.getByText('Total do contrato').parentElement).toHaveTextContent(/R\$\s8\.000,00/)
    expect(screen.getByText('Probabilidade').parentElement).toHaveTextContent('80% (editada à mão)')
    expect(screen.getByText('Sem previsão', { selector: 'span' })).toBeInTheDocument()
  })

  it('o histórico traz as mudanças de fase e de status, do mais recente ao mais antigo', async () => {
    const x = servicos()
    renderizar(x.s, `/oportunidades/${oportunidade(1).id}`)
    await screen.findByRole('heading', { name: 'Oportunidade 1' })
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    const lista = await screen.findByRole('list', { name: 'Histórico da oportunidade' })
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual([
      expect.stringContaining('Fase: Qualificação → Diagnóstico'),
      expect.stringContaining('Criada na fase Qualificação'),
    ])
    expect(within(lista).getByText(/Sistema/)).toBeInTheDocument()
  })

  it('fechada mostra o fechamento, a fase em que parou e o motivo; o botão Nova atividade some', async () => {
    const x = servicos(
      detalhada({
        status: 'perdido',
        faseParouEm: { id: FASES[1]!.id, nome: 'Diagnóstico', cor: 'blue' },
        motivo: { id: id(971), nome: 'Preço' },
        dataFechamento: '2026-10-15T12:00:00.000Z',
        motivoDetalhe: 'Foi para o concorrente',
      }),
    )
    renderizar(x.s, `/oportunidades/${oportunidade(1).id}`)
    await screen.findByRole('heading', { name: 'Oportunidade 1' })
    expect(screen.getByText('Perdida')).toBeInTheDocument()
    expect(screen.getByText('Parou na fase').parentElement).toHaveTextContent('Diagnóstico')
    expect(screen.getByText('Motivo').parentElement).toHaveTextContent('Preço')
    expect(screen.getByText('Foi para o concorrente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova atividade' })).toBeNull()
    // o menu oferece Reabrir
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Oportunidade 1' }))
    expect(await screen.findByRole('menuitem', { name: 'Reabrir' })).toBeInTheDocument()
  })

  it('a aba Atividades lista só as da oportunidade', async () => {
    const x = servicos()
    renderizar(x.s, `/oportunidades/${oportunidade(1).id}`)
    await screen.findByRole('heading', { name: 'Oportunidade 1' })
    await userEvent.click(screen.getByRole('tab', { name: 'Atividades' }))
    await waitFor(() =>
      expect(x.s.atividades.listar).toHaveBeenCalledWith(
        expect.objectContaining({ oportunidadeId: oportunidade(1).id }),
      ),
    )
  })

  it('oportunidade inexistente ou de outra carteira: mostra o erro e o caminho de volta', async () => {
    const x = servicos()
    x.detalhar.mockResolvedValueOnce(
      falha('oportunidade_nao_encontrada', 'Oportunidade não encontrada.', 404),
    )
    renderizar(x.s, `/oportunidades/${oportunidade(1).id}`)
    expect(await screen.findByText('Oportunidade não encontrada.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para Oportunidades' })).toBeInTheDocument()
  })

  it('mostra as tags no cabeçalho e "Editar tags" troca as tags da oportunidade', async () => {
    const x = servicos(detalhada({ tags: [tagNaOportunidade(71)] }))
    renderizar(x.s, `/oportunidades/${oportunidade(1).id}`)
    const cabecalho = (
      await screen.findByRole('heading', { name: 'Oportunidade 1', level: 1 })
    ).closest('header') as HTMLElement
    expect(within(cabecalho).getByText('Novo')).toBeInTheDocument()
    await userEvent.click(await within(cabecalho).findByRole('button', { name: 'Editar tags' }))
    const j = await screen.findByRole('dialog', { name: /Editar tags/ })
    await userEvent.click(within(j).getByRole('checkbox', { name: 'Renovação' }))
    await userEvent.click(within(j).getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(x.definirTags).toHaveBeenCalled())
    expect(x.definirTags.mock.calls[0]?.[1]).toEqual([id(71), id(72)])
  })

  it('sem permissão de editar, as tags aparecem mas "Editar tags" não', async () => {
    const x = servicos(detalhada({ tags: [tagNaOportunidade(72)], editavel: false }))
    renderizar(x.s, `/oportunidades/${oportunidade(1).id}`)
    await screen.findByRole('heading', { name: 'Oportunidade 1', level: 1 })
    expect(screen.getByText('Renovação')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar tags' })).toBeNull()
  })
})
