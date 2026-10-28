import type { KanbanDeOportunidades } from '@leadtogo/api-client'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'
import { id, meComPapel } from '@/telas/contatos/fixtures'

import { FASES, FUNIL, kanban, oportunidade } from './fixtures'

const MOTIVO_PERDIDO = {
  id: id(970),
  nome: 'Preço',
  aplicaA: ['perdido' as const],
  ativo: true,
  ordem: 0,
}

function servicos(
  quadro: KanbanDeOportunidades = kanban(),
  papel: 'admin' | 'gestor' | 'vendedor' = 'admin',
) {
  const base = servicosFalsos()
  const kanbanFn = vi.fn(async (_c: Record<string, unknown>) => ok(quadro))
  const mover = vi.fn(async (_id: string, faseId: string) =>
    ok({
      oportunidade: oportunidade(1, { probabilidade: 25 }),
      avisoDeProbabilidade: null,
      faseId,
    }),
  )
  const fechar = vi.fn(async (_id: string, _d: Record<string, unknown>) => ok(oportunidade(1)))
  const reabrir = vi.fn(async (_id: string) => ok(oportunidade(1)))
  const excluir = vi.fn(async (_id: string) => ok(undefined))
  const listar = vi.fn(async (_c: Record<string, unknown>) =>
    ok({
      itens: [
        oportunidade(1),
        oportunidade(2, {
          status: 'perdido',
          faseParouEm: { id: FASES[1]!.id, nome: 'Diagnóstico', cor: 'blue' as const },
        }),
      ],
      total: 2,
      pagina: 1,
      porPagina: 25,
      somas: { total: 16000, mensal: 1000, ponderado: 1600 },
    }),
  )
  const s = servicosFalsos({
    me: async () => meComPapel(papel),
    oportunidades: {
      ...base.oportunidades,
      kanban: kanbanFn,
      mover: mover,
      fechar,
      reabrir,
      excluir,
      listar: listar,
    },
    funis: {
      ...base.funis,
      listar: vi.fn(async () =>
        ok([
          {
            id: FUNIL.id,
            nome: FUNIL.nome,
            padrao: true,
            ativo: true,
            ordem: 0,
            fases: FASES.map((f, i) => ({ ...f, funilId: FUNIL.id, ativo: true, ordem: i })),
          },
        ]),
      ),
    },
    cadastros: {
      ...base.cadastros,
      motivos: { ...base.cadastros.motivos, listar: vi.fn(async () => ok([MOTIVO_PERDIDO])) },
    },
  })
  return { s, kanbanFn, mover, fechar, reabrir, excluir, listar }
}

const abrir = async (x: ReturnType<typeof servicos>, rota = '/oportunidades') => {
  const r = renderizar(x.s, rota)
  await screen.findByRole('heading', { name: 'Oportunidades', level: 1 })
  return r
}

describe('Oportunidades: Kanban', () => {
  it('uma coluna por fase ativa, com contagem e soma, e os cards com valor, previsão e próxima atividade', async () => {
    const x = servicos(
      kanban([
        [
          oportunidade(1, { dataPrevistaFechamento: null }),
          oportunidade(2, { parada: true, diasParada: 20, valorMensal: 0, valorTotal: 1000 }),
        ],
        [],
        [oportunidade(3)],
      ]),
    )
    await abrir(x)
    const q = await screen.findByRole('region', { name: 'Fase Qualificação' })
    expect(within(q).getByRole('heading', { name: 'Qualificação' })).toBeInTheDocument()
    expect(within(q).getByLabelText('Soma da fase')).toHaveTextContent('R$ 9.000')
    const card = within(q).getByRole('article', { name: 'Oportunidade 1' })
    expect(within(card).getByText(/R\$\s8\.000,00/)).toBeInTheDocument()
    expect(within(card).getByText(/R\$\s500,00\/mês/)).toBeInTheDocument()
    expect(within(card).getByText('Sem previsão')).toBeInTheDocument()
    expect(within(card).getByText('Sem próxima atividade')).toBeInTheDocument()
    // alerta de parada, com a frase (não só a cor)
    expect(
      within(within(q).getByRole('article', { name: 'Oportunidade 2' })).getByText(
        'Parada há 20 dias nesta fase',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Fase Diagnóstico' })).getByText(
        'Nenhuma oportunidade nesta fase.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/3 ativas · Total/)).toBeInTheDocument()
  })

  it('a página e a coluna não rolam; os cards rolam dentro da coluna (layout em kanban.test.tsx)', async () => {
    const x = servicos()
    await abrir(x)
    const quadro = await screen.findByRole('region', { name: /Quadro do funil Vendas/ })
    expect(quadro.className).not.toContain('overflow-x')
    expect(screen.getByRole('main').className).not.toContain('overflow')
  })

  it('"Suspensas · N" mostra a contagem e abre a lista com "Retomar em" e Reabrir', async () => {
    const x = servicos(kanban(undefined, { suspensas: 2 }))
    x.listar.mockResolvedValueOnce(
      ok({
        itens: [
          oportunidade(7, {
            status: 'suspenso',
            suspensaAte: '2026-12-01',
            motivo: { id: id(971), nome: 'Sem orçamento' },
          }),
        ],
        total: 1,
        pagina: 1,
        porPagina: 100,
        somas: { total: 8000, mensal: 500, ponderado: 800 },
      }),
    )
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Suspensas · 2' }))
    const janela = await screen.findByRole('dialog', { name: 'Oportunidades suspensas' })
    expect(await within(janela).findByText(/Retomar em 01\/12\/2026/)).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Reabrir' }))
    await waitFor(() => expect(x.reabrir).toHaveBeenCalledWith(oportunidade(7).id))
  })

  it('o menu do card move de fase (e mostra a probabilidade da nova fase)', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Oportunidade 1' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Proposta' }))
    await waitFor(() => expect(x.mover).toHaveBeenCalledWith(oportunidade(1).id, FASES[2]!.id))
    expect(await screen.findByText('Movida para Proposta')).toBeInTheDocument()
  })

  it('probabilidade editada à mão: o aviso diz que ficou e qual é a sugerida', async () => {
    const x = servicos()
    x.mover.mockResolvedValueOnce(
      ok({
        oportunidade: oportunidade(1, { probabilidade: 90, probabilidadeManual: true }),
        avisoDeProbabilidade: { atual: 90, sugerida: 50 },
      }) as never,
    )
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Oportunidade 1' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Proposta' }))
    expect(
      await screen.findByText(/continua em 90% \(editada por você\)\. A sugerida desta fase é 50%/),
    ).toBeInTheDocument()
  })

  it('o vendedor não vê as ações da oportunidade de outra carteira', async () => {
    const x = servicos(
      kanban([[oportunidade(1, { editavel: false, excluivel: false })], [], []]),
      'vendedor',
    )
    await abrir(x)
    await screen.findByRole('article', { name: 'Oportunidade 1' })
    expect(screen.queryByRole('button', { name: 'Ações de Oportunidade 1' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Arrastar Oportunidade 1' })).toBeNull()
  })

  it('"Importar planilha" só para quem importa (administrador e gestor)', async () => {
    await abrir(servicos(kanban([[], [], []])))
    expect(await screen.findByRole('button', { name: 'Importar planilha' })).toBeInTheDocument()
    cleanup()
    await abrir(servicos(kanban([[], [], []]), 'vendedor'))
    expect(screen.queryByRole('button', { name: 'Importar planilha' })).toBeNull()
  })

  it('erro da API aparece como alerta', async () => {
    const x = servicos()
    x.kanbanFn.mockResolvedValueOnce(falha('erro_interno', 'Falhou.', 500))
    await abrir(x)
    expect(await screen.findByText('Falhou.')).toBeInTheDocument()
  })
})

describe('Fechar oportunidade', () => {
  const abrirFechamento = async (x: ReturnType<typeof servicos>, item: string) => {
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Oportunidade 1' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: item }))
    return screen.findByRole('dialog', { name: 'Fechar oportunidade' })
  }

  it('Perdida exige o motivo (da lista do status) e manda a fase em que parou ao servidor', async () => {
    const x = servicos()
    const j = await abrirFechamento(x, 'Perdida')
    await userEvent.click(within(j).getByRole('button', { name: 'Marcar como perdida' }))
    expect(await within(j).findByText('Escolha o motivo.')).toBeInTheDocument()
    expect(x.fechar).not.toHaveBeenCalled()
    await userEvent.selectOptions(within(j).getByLabelText(/Motivo/), 'Preço')
    await userEvent.click(within(j).getByRole('button', { name: 'Marcar como perdida' }))
    await waitFor(() => expect(x.fechar).toHaveBeenCalled())
    expect(x.fechar.mock.calls[0]?.[1]).toMatchObject({
      status: 'perdido',
      motivoId: MOTIVO_PERDIDO.id,
    })
  })

  it('Conquistada mostra os valores e o interruptor "empresa vira Cliente" (ligado como a empresa configurou)', async () => {
    const x = servicos()
    const j = await abrirFechamento(x, 'Conquistada')
    expect(within(j).getByText(/R\$\s8\.000,00/)).toBeInTheDocument()
    const chave = within(j).getByRole('switch', { name: 'Mudar o Status da empresa para Cliente' })
    expect(chave).toBeChecked()
    await userEvent.click(chave)
    await userEvent.click(within(j).getByRole('button', { name: 'Marcar como conquistada' }))
    await waitFor(() => expect(x.fechar).toHaveBeenCalled())
    expect(x.fechar.mock.calls[0]?.[1]).toEqual({
      status: 'conquistado',
      empresaViraCliente: false,
    })
  })

  it('Suspensa pede o motivo e "Retomar em" (não no passado)', async () => {
    const x = servicos()
    const j = await abrirFechamento(x, 'Suspensa')
    await userEvent.click(within(j).getByRole('button', { name: 'Suspender oportunidade' }))
    expect(await within(j).findByText('Informe quando retomar.')).toBeInTheDocument()
    expect(x.fechar).not.toHaveBeenCalled()
  })
})

describe('Oportunidades: Lista', () => {
  it('a lista usa a paginação de 25, 50 ou 100 (lembrada na tabela "oportunidades"), sem rolagem própria', async () => {
    const x = servicos()
    await abrir(x, '/oportunidades?visao=lista')
    const tabela = await screen.findByRole('table')
    for (const th of within(tabela).getAllByRole('columnheader')) {
      expect(th.className).toContain('sticky')
    }
    expect(within(tabela).getByText('Parou em Diagnóstico')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Linhas por página' }), '50')
    await waitFor(() =>
      expect(x.s.alterarPreferencias).toHaveBeenCalledWith({ porPagina: { oportunidades: 50 } }),
    )
  })
})
