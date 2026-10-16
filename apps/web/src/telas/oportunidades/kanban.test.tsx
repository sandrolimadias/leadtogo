import type { Preferencias } from '@leadtogo/api-client'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { id, meComPapel } from '@/telas/contatos/fixtures'
import { ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { FASES, FUNIL, kanban, oportunidade } from './fixtures'

const PREFS: Preferencias = {
  tema: 'sistema',
  menuRecolhido: false,
  visaoDashboard: 'minha',
  filtroPadrao: {},
  porPagina: {},
  kanbanColapsadas: {},
}

function servicos(colapsadas: Record<string, string[]> = {}, contatosDaEmpresa = [] as never[]) {
  const base = servicosFalsos()
  const guardadas: Preferencias = { ...PREFS, kanbanColapsadas: colapsadas }
  const preferencias = vi.fn(async () => guardadas)
  const alterarPreferencias = vi.fn(async (patch: Record<string, unknown>) => {
    const novo = patch['kanbanColapsadas'] as Record<string, string[] | null> | undefined
    const proximo: Preferencias = {
      ...guardadas,
      kanbanColapsadas: { ...guardadas.kanbanColapsadas },
    }
    for (const [f, lista] of Object.entries(novo ?? {})) {
      if (lista === null) delete proximo.kanbanColapsadas[f]
      else proximo.kanbanColapsadas[f] = lista
    }
    return ok(proximo)
  })
  const criar = vi.fn(async (_c: Record<string, unknown>) => ok(oportunidade(9)))
  const s = servicosFalsos({
    me: async () => meComPapel('admin'),
    preferencias,
    alterarPreferencias: alterarPreferencias,
    oportunidades: {
      ...base.oportunidades,
      kanban: vi.fn(async () => ok(kanban())),
      criar,
    },
    contatos: { ...base.contatos, daEmpresa: vi.fn(async () => ok(contatosDaEmpresa)) },
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
  })
  return { s, alterarPreferencias, criar }
}

function largura(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}
afterEach(() => largura(1280))

const abrir = async (x: ReturnType<typeof servicos>) => {
  renderizar(x.s, '/oportunidades')
  await screen.findByRole('heading', { name: 'Oportunidades', level: 1 })
  await screen.findByRole('region', { name: /Quadro do funil Vendas/ })
}

describe('Kanban: layout e colunas recolhíveis', () => {
  it('o quadro divide a largura entre as colunas abertas, sem rolagem horizontal, e cada coluna rola os cards', async () => {
    await abrir(servicos())
    const quadro = screen.getByRole('region', { name: /Quadro do funil Vendas/ })
    expect(quadro.className).not.toContain('overflow-x')
    for (const nome of ['Qualificação', 'Diagnóstico', 'Proposta']) {
      const coluna = screen.getByRole('region', { name: `Fase ${nome}` })
      expect(coluna.className).toContain('flex-1')
      expect(coluna.className).toContain('min-w-0')
      // os cards rolam por dentro da coluna, que tem a altura do quadro
      const cards = coluna.querySelector('.overflow-y-auto')
      expect(cards).not.toBeNull()
    }
    // a página ganha o marcador do quadro (a casca tira o limite de 1440 px e dá a altura toda)
    expect(screen.getByRole('main')).toHaveAttribute('data-quadro')
  })

  it('recolher vira uma faixa com o nome, a quantidade e o total; o estado vai para a conta; abrir volta', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Recolher a fase Qualificação' }))
    const faixa = await screen.findByRole('region', { name: 'Fase Qualificação (recolhida)' })
    expect(faixa).toHaveTextContent('Qualificação')
    expect(faixa).toHaveTextContent('2') // a quantidade
    expect(faixa).toHaveTextContent('R$ 16.000') // a soma
    expect(screen.queryByRole('region', { name: 'Fase Qualificação' })).toBeNull()
    await waitFor(() =>
      expect(x.alterarPreferencias).toHaveBeenCalledWith({
        kanbanColapsadas: { [FUNIL.id]: [FASES[0]!.id] },
      }),
    )
    // as outras ficam com o espaço liberado
    expect(screen.getByRole('region', { name: 'Fase Diagnóstico' }).className).toContain('flex-1')

    await userEvent.click(within(faixa).getByRole('button', { name: 'Abrir a fase Qualificação' }))
    expect(await screen.findByRole('region', { name: 'Fase Qualificação' })).toBeInTheDocument()
    await waitFor(() =>
      expect(x.alterarPreferencias).toHaveBeenLastCalledWith({
        kanbanColapsadas: { [FUNIL.id]: null },
      }),
    )
  })

  it('o estado recolhido vem da conta (outro aparelho) e vale só para aquele funil', async () => {
    await abrir(servicos({ [FUNIL.id]: [FASES[1]!.id], [id(777)]: [FASES[2]!.id] }))
    expect(
      await screen.findByRole('region', { name: 'Fase Diagnóstico (recolhida)' }),
    ).toBeInTheDocument()
    // a fase recolhida de OUTRO funil não afeta este
    expect(screen.getByRole('region', { name: 'Fase Proposta' })).toBeInTheDocument()
  })

  it('a última fase aberta não tem o botão de recolher (o quadro nunca fica vazio)', async () => {
    await abrir(servicos({ [FUNIL.id]: [FASES[0]!.id, FASES[1]!.id] }))
    await screen.findByRole('region', { name: 'Fase Qualificação (recolhida)' })
    expect(screen.queryByRole('button', { name: 'Recolher a fase Proposta' })).toBeNull()
  })

  it('fase recolhida que não existe mais no funil é ignorada', async () => {
    await abrir(servicos({ [FUNIL.id]: [id(999)] }))
    expect(screen.getAllByRole('button', { name: /^Recolher a fase/ })).toHaveLength(3)
  })
})

describe('Kanban no celular: uma coluna por vez', () => {
  it('cada coluna ocupa a largura toda e encaixa; sem recolher; indicador "N de M" e pontos', async () => {
    largura(390)
    await abrir(servicos())
    const quadro = screen.getByRole('region', { name: /Quadro do funil Vendas/ })
    expect(quadro.className).toContain('snap-x')
    expect(quadro.className).toContain('snap-mandatory')
    const coluna = screen.getByRole('region', { name: 'Fase Qualificação' })
    expect(coluna.className).toContain('w-full')
    expect(coluna.className).toContain('snap-center')
    expect(screen.queryByRole('button', { name: /^Recolher a fase/ })).toBeNull()

    const indicador = screen.getByRole('group', { name: 'Posição no funil' })
    expect(indicador).toHaveTextContent('1 de 3')
    const pontos = within(indicador).getAllByRole('button')
    expect(pontos).toHaveLength(3)
    expect(pontos[0]).toHaveAttribute('aria-current', 'true')

    // arrastar o dedo para o lado: a rolagem passa para a coluna seguinte e o indicador acompanha
    Object.defineProperty(quadro, 'clientWidth', { value: 390, configurable: true })
    quadro.scrollLeft = 390
    fireEvent.scroll(quadro)
    await waitFor(() => expect(indicador).toHaveTextContent('2 de 3'))
    // e os pontos levam à fase
    await userEvent.click(
      within(indicador).getByRole('button', { name: 'Ir para a fase Proposta' }),
    )
    expect(indicador).toHaveTextContent('3 de 3')
  })

  it('o card continua com a alça de arrastar (para as zonas) e com o menu', async () => {
    largura(390)
    await abrir(servicos())
    expect(screen.getByRole('button', { name: 'Arrastar Oportunidade 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ações de Oportunidade 1' })).toBeInTheDocument()
  })
})

describe('Kanban: zonas de fechamento no topo', () => {
  const pegarComOTeclado = async (nome = 'Oportunidade 1') => {
    const alca = await screen.findByRole('button', { name: `Arrastar ${nome}` })
    alca.focus()
    await userEvent.keyboard(' ')
  }
  const verZonasNoTopo = async () => {
    const grupo = await screen.findByRole('group', {
      name: /Soltar aqui para marcar como conquistada/,
    })
    const zonas = grupo.parentElement as HTMLElement
    // sobre o quadro (posição absoluta, colada no topo), antes das colunas na ordem do documento
    expect(zonas.className).toContain('absolute')
    expect(zonas.className).toContain('top-0')
    expect(zonas.className).not.toContain('bottom-0')
    const quadro = screen.getByRole('region', { name: /Quadro do funil Vendas/ })
    expect(zonas.compareDocumentPosition(quadro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const z of ['conquistada', 'perdida', 'cancelada', 'suspensa']) {
      expect(
        within(zonas).getByRole('group', { name: `Soltar aqui para marcar como ${z}` }),
      ).toBeInTheDocument()
    }
  }

  it('no computador, as quatro zonas aparecem no topo do quadro só enquanto se arrasta', async () => {
    await abrir(servicos())
    expect(screen.queryByRole('group', { name: /Soltar aqui para marcar como/ })).toBeNull()
    await pegarComOTeclado()
    await verZonasNoTopo()
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /Soltar aqui para marcar como/ })).toBeNull(),
    )
  })

  it('no celular, também no topo', async () => {
    largura(390)
    await abrir(servicos())
    await pegarComOTeclado()
    await verZonasNoTopo()
  })
})

describe('Duplicar oportunidade', () => {
  const original = () =>
    oportunidade(1, {
      titulo: 'Contrato anual',
      empresa: { id: id(1), nome: 'Usidantec' },
      contato: { id: id(701), nome: 'Maria' },
      solucao: { id: id(980), nome: 'Licença anual' },
      origem: { id: id(985), nome: 'Indicação' },
      fase: { id: FASES[2]!.id, nome: FASES[2]!.nome, cor: FASES[2]!.cor },
      valorUnico: 1000,
      valorMensal: 200,
      meses: 10,
      probabilidade: 77,
      probabilidadeManual: true,
      dataPrevistaFechamento: '2026-12-10',
      observacoes: 'não copiar',
      status: 'ativo',
    })

  const abrirDuplicar = async (x: ReturnType<typeof servicos>) => {
    ;(x.s.oportunidades.kanban as ReturnType<typeof vi.fn>).mockResolvedValue(
      ok(kanban([[original()], [], []])),
    )
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Contrato anual' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }))
    return screen.findByRole('dialog', { name: 'Duplicar oportunidade' })
  }

  it('abre a Nova oportunidade preenchida, com " (cópia)" no nome, e a cópia nasce Ativa', async () => {
    const x = servicos({}, [{ id: id(701), nome: 'Maria', cargo: null, ativo: true } as never])
    const j = await abrirDuplicar(x)
    expect(within(j).getByLabelText(/Nome da oportunidade/)).toHaveValue('Contrato anual (cópia)')
    expect(within(j).getByText('Usidantec')).toBeInTheDocument()
    expect(within(j).getByLabelText('Valor único (R$)')).toHaveValue('1000')
    expect(within(j).getByLabelText('Valor mensal (R$)')).toHaveValue('200')
    expect(within(j).getByLabelText('Duração (meses)')).toHaveValue('10')
    // a probabilidade editada à mão vai junto (e continua marcada como editada)
    expect(within(j).getByLabelText('Probabilidade (%)')).toHaveValue('77')
    expect(within(j).getByText(/Editada à mão/)).toBeInTheDocument()
    expect(within(j).getByLabelText('Data prevista de fechamento')).toHaveValue('2026-12-10')
    // observações e responsável não são copiados
    expect(within(j).getByLabelText('Observações')).toHaveValue('')

    await userEvent.click(within(j).getByRole('button', { name: 'Criar oportunidade' }))
    await waitFor(() => expect(x.criar).toHaveBeenCalledTimes(1))
    expect(x.criar.mock.calls[0]?.[0]).toEqual({
      titulo: 'Contrato anual (cópia)',
      empresaId: id(1),
      contatoId: id(701),
      solucaoId: id(980),
      origemId: id(985),
      funilId: FUNIL.id,
      faseId: FASES[2]!.id,
      valorUnico: 1000,
      valorMensal: 200,
      meses: 10,
      dataPrevistaFechamento: '2026-12-10',
      observacoes: null,
      probabilidade: 77,
      duplicadaDeId: original().id,
    })
  })

  it('probabilidade que acompanhava a fase não vai como editada à mão', async () => {
    const x = servicos()
    ;(x.s.oportunidades.kanban as ReturnType<typeof vi.fn>).mockResolvedValue(
      ok(kanban([[oportunidade(1, { titulo: 'Simples', probabilidadeManual: false })], [], []])),
    )
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Simples' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }))
    const j = await screen.findByRole('dialog', { name: 'Duplicar oportunidade' })
    expect(within(j).getByLabelText('Probabilidade (%)')).toHaveValue('')
    await userEvent.click(within(j).getByRole('button', { name: 'Criar oportunidade' }))
    await waitFor(() => expect(x.criar).toHaveBeenCalled())
    expect(x.criar.mock.calls[0]?.[0]).not.toHaveProperty('probabilidade')
  })

  it('o contato sem vínculo com a empresa escolhida não é enviado', async () => {
    // a lista de contatos da empresa não traz a Maria: ela não tem vínculo
    const x = servicos({}, [])
    const j = await abrirDuplicar(x)
    await userEvent.click(within(j).getByRole('button', { name: 'Criar oportunidade' }))
    await waitFor(() => expect(x.criar).toHaveBeenCalled())
    expect(x.criar.mock.calls[0]?.[0]).not.toHaveProperty('contatoId')
  })
})
