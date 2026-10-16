import type { Funil } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const meComPapel = (papel: 'admin' | 'gestor' | 'vendedor') =>
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

const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const fase = (
  n: number,
  funil: number,
  nome: string,
  extra: Partial<Funil['fases'][number]> = {},
): Funil['fases'][number] => ({
  id: id(n),
  funilId: id(funil),
  nome,
  cor: 'gray',
  probabilidadePadrao: 0,
  diasAlertaParada: null,
  ativo: true,
  ordem: n,
  ...extra,
})

const dados = (): Funil[] => [
  {
    id: id(1),
    nome: 'Vendas',
    padrao: true,
    ativo: true,
    ordem: 0,
    fases: [
      fase(11, 1, 'Qualificação', { cor: 'teal', probabilidadePadrao: 10, diasAlertaParada: 14 }),
      fase(12, 1, 'Proposta', { cor: 'indigo', probabilidadePadrao: 50, diasAlertaParada: 1 }),
      fase(13, 1, 'Negociação', { cor: 'amber', probabilidadePadrao: 75 }),
    ],
  },
  {
    id: id(2),
    nome: 'Renovação',
    padrao: false,
    ativo: true,
    ordem: 1,
    fases: [fase(21, 2, 'Contato', { probabilidadePadrao: 30, diasAlertaParada: 7 })],
  },
  {
    id: id(3),
    nome: 'Antigo',
    padrao: false,
    ativo: false,
    ordem: 2,
    fases: [fase(31, 3, 'Única')],
  },
]

function servicosDeFunis(funis: Funil[] = dados(), extra: Record<string, unknown> = {}) {
  const f = {
    listar: vi.fn(async () => ok(funis)),
    criar: vi.fn(async () => ok(funis[0] as Funil)),
    alterar: vi.fn(async () => ok(funis[0] as Funil)),
    excluir: vi.fn(async () => ok(undefined)),
    reordenar: vi.fn(async () => ok(funis)),
    criarFase: vi.fn(async () => ok(funis[0] as Funil)),
    alterarFase: vi.fn(async () => ok(funis[0] as Funil)),
    excluirFase: vi.fn(async () => ok(funis[0] as Funil)),
    reordenarFases: vi.fn(async () => ok(funis[0] as Funil)),
    ...extra,
  }
  return servicosFalsos({ me: async () => meComPapel('admin'), funis: f })
}

const abrir = async (servicos = servicosDeFunis()) => {
  const r = renderizar(servicos, '/configuracoes/funis')
  await screen.findByRole('heading', { name: 'Funis e fases' })
  await screen.findByRole('region', { name: 'Vendas' })
  return r
}
const funil = (nome: string) => screen.getByRole('region', { name: nome })
const fasedo = (f: string, nome: string) => within(funil(f)).getByRole('listitem', { name: nome })

describe('Configurações → Funis e fases: acesso', () => {
  it.each(['gestor', 'vendedor'] as const)('%s volta para o início', async (papel) => {
    const { historico } = renderizar(
      servicosFalsos({ me: async () => meComPapel(papel) }),
      '/configuracoes/funis',
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('administrador: o menu interno traz Funis e fases', async () => {
    await abrir()
    const menu = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Funis e fases/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('Configurações → Funis e fases: estados', () => {
  it('carrega mostrando o esqueleto', async () => {
    renderizar(
      servicosDeFunis([], { listar: () => new Promise(() => undefined) }),
      '/configuracoes/funis',
    )
    expect(await screen.findByRole('status', { name: 'Carregando os funis' })).toBeInTheDocument()
  })

  it('erro ao carregar: mostra o motivo e "Tentar de novo" recarrega', async () => {
    const listar = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Servidor fora do ar.', 503))
      .mockResolvedValue(ok(dados()))
    renderizar(servicosDeFunis([], { listar }), '/configuracoes/funis')
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor fora do ar.')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('region', { name: 'Vendas' })).toBeInTheDocument()
  })

  it('vazio: convida a criar o primeiro funil', async () => {
    renderizar(servicosDeFunis([]), '/configuracoes/funis')
    expect(await screen.findByRole('heading', { name: 'Nenhum funil' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Novo funil' })).toHaveLength(2)
  })

  it('mostra funis e fases com probabilidade, alerta, "padrão" e "inativo"', async () => {
    await abrir()
    const vendas = funil('Vendas')
    expect(within(vendas).getByText('Funil padrão')).toBeInTheDocument()
    expect(within(funil('Renovação')).queryByText('Funil padrão')).toBeNull()
    expect(within(funil('Antigo')).getByText('Inativo')).toBeInTheDocument()

    const q = fasedo('Vendas', 'Qualificação')
    expect(within(q).getByText('Probabilidade 10%')).toBeInTheDocument()
    expect(within(q).getByText('Alerta de parada após 14 dias')).toBeInTheDocument()
    expect(
      within(fasedo('Vendas', 'Proposta')).getByText('Alerta de parada após 1 dia'),
    ).toBeInTheDocument()
    expect(
      within(fasedo('Vendas', 'Negociação')).getByText('Sem alerta de parada'),
    ).toBeInTheDocument()
  })

  it('o funil padrão não se exclui nem se "torna padrão"; a última fase não se exclui', async () => {
    await abrir()
    expect(
      within(funil('Vendas')).queryByRole('button', { name: 'Excluir o funil Vendas' }),
    ).toBeNull()
    expect(within(funil('Vendas')).queryByRole('button', { name: 'Tornar padrão' })).toBeNull()
    expect(
      within(funil('Renovação')).getByRole('button', { name: 'Excluir o funil Renovação' }),
    ).toBeInTheDocument()
    expect(
      within(funil('Renovação')).getByRole('button', { name: 'Tornar padrão' }),
    ).toBeInTheDocument()
    // funil inativo não vira padrão sem reativar
    expect(within(funil('Antigo')).queryByRole('button', { name: 'Tornar padrão' })).toBeNull()
    // funil com uma fase só: sem excluir a fase, com a explicação
    expect(
      within(fasedo('Renovação', 'Contato')).queryByRole('button', { name: /Excluir/ }),
    ).toBeNull()
    expect(
      within(funil('Renovação')).getByText(/a última não pode ser excluída/),
    ).toBeInTheDocument()
    expect(
      within(fasedo('Vendas', 'Proposta')).getByRole('button', { name: 'Excluir a fase Proposta' }),
    ).toBeInTheDocument()
  })
})

describe('Configurações → Funis e fases: funis', () => {
  it('cria um funil com a primeira fase', async () => {
    const s = servicosDeFunis()
    await abrir(s)
    await userEvent.click(screen.getByRole('button', { name: 'Novo funil' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo funil' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome do funil/), '  Pós-venda ')
    await userEvent.type(within(dialogo).getByLabelText(/Primeira fase/), ' Acompanhamento ')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar funil' }))
    await waitFor(() =>
      expect(s.funis.criar).toHaveBeenCalledWith({
        nome: 'Pós-venda',
        fases: [{ nome: 'Acompanhamento' }],
      }),
    )
    expect(await screen.findByText('Funil criado')).toBeInTheDocument()
    expect(s.funis.listar).toHaveBeenCalledTimes(2)
  })

  it('exige o nome do funil e o da primeira fase; nome repetido vai para o campo', async () => {
    const s = servicosDeFunis(dados(), {
      criar: vi.fn(async () => falha('nome_duplicado', 'Já existe um item com esse nome.', 409)),
    })
    await abrir(s)
    await userEvent.click(screen.getByRole('button', { name: 'Novo funil' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar funil' }))
    expect(await within(dialogo).findByText('Informe o nome do funil.')).toBeInTheDocument()
    expect(s.funis.criar).not.toHaveBeenCalled()
    await userEvent.type(within(dialogo).getByLabelText(/Nome do funil/), 'Vendas')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar funil' }))
    expect(await within(dialogo).findByText('Informe o nome da primeira fase.')).toBeInTheDocument()
    await userEvent.type(within(dialogo).getByLabelText(/Primeira fase/), 'Contato')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar funil' }))
    expect(await within(dialogo).findByText('Já existe um item com esse nome.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('edita o nome e inativa; no funil padrão o "ativo" fica travado', async () => {
    const s = servicosDeFunis()
    await abrir(s)
    await userEvent.click(screen.getByRole('button', { name: 'Editar o funil Vendas' }))
    let dialogo = await screen.findByRole('dialog', { name: 'Editar o funil Vendas' })
    expect(within(dialogo).getByRole('switch', { name: 'Funil ativo' })).toBeDisabled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: 'Editar o funil Renovação' }))
    dialogo = await screen.findByRole('dialog', { name: 'Editar o funil Renovação' })
    await userEvent.click(within(dialogo).getByRole('switch', { name: 'Funil ativo' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(s.funis.alterar).toHaveBeenCalledWith(id(2), { nome: 'Renovação', ativo: false }),
    )
  })

  it('"Tornar padrão" age direto e avisa; o erro da API vira aviso', async () => {
    const alterar = vi
      .fn()
      .mockResolvedValueOnce(
        falha('funil_inativo', 'Reative o funil antes de torná-lo o padrão.', 409),
      )
      .mockResolvedValue(ok(dados()[1] as Funil))
    const s = servicosDeFunis(dados(), { alterar })
    await abrir(s)
    await userEvent.click(within(funil('Renovação')).getByRole('button', { name: 'Tornar padrão' }))
    expect(
      await screen.findByText('Reative o funil antes de torná-lo o padrão.'),
    ).toBeInTheDocument()
    await userEvent.click(within(funil('Renovação')).getByRole('button', { name: 'Tornar padrão' }))
    await waitFor(() => expect(alterar).toHaveBeenLastCalledWith(id(2), { padrao: true }))
    expect(await screen.findByText('Renovação agora é o funil padrão')).toBeInTheDocument()
  })

  it('exclui o funil depois de confirmar', async () => {
    const s = servicosDeFunis()
    await abrir(s)
    await userEvent.click(screen.getByRole('button', { name: 'Excluir o funil Renovação' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir o funil Renovação?' })
    expect(s.funis.excluir).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir funil' }))
    await waitFor(() => expect(s.funis.excluir).toHaveBeenCalledWith(id(2)))
    expect(await screen.findByText('Funil Renovação excluído')).toBeInTheDocument()
  })

  it('reordena os funis pelos botões', async () => {
    const s = servicosDeFunis()
    await abrir(s)
    expect(screen.getByRole('button', { name: 'Mover o funil Vendas para cima' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mover o funil Antigo para baixo' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Mover o funil Vendas para baixo' }))
    await waitFor(() => expect(s.funis.reordenar).toHaveBeenCalledWith([id(2), id(1), id(3)]))
  })
})

describe('Configurações → Funis e fases: fases', () => {
  it('cria uma fase com cor, probabilidade e alerta', async () => {
    const s = servicosDeFunis()
    await abrir(s)
    await userEvent.click(screen.getByRole('button', { name: 'Nova fase em Vendas' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova fase em Vendas' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome da fase/), 'Fechamento')
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Verde' }))
    const prob = within(dialogo).getByLabelText(/Probabilidade padrão/)
    await userEvent.clear(prob)
    await userEvent.type(prob, '90')
    await userEvent.type(within(dialogo).getByLabelText(/Alerta de parada/), '21')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar fase' }))
    await waitFor(() =>
      expect(s.funis.criarFase).toHaveBeenCalledWith(id(1), {
        nome: 'Fechamento',
        cor: 'green',
        probabilidadePadrao: 90,
        diasAlertaParada: 21,
      }),
    )
    expect(await screen.findByText('Fase criada')).toBeInTheDocument()
  })

  it('alerta vazio vai como "sem alerta" (nulo)', async () => {
    const s = servicosDeFunis()
    await abrir(s)
    await userEvent.click(
      within(fasedo('Vendas', 'Qualificação')).getByRole('button', {
        name: 'Editar a fase Qualificação',
      }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Editar a fase Qualificação' })
    expect(within(dialogo).getByLabelText(/Alerta de parada/)).toHaveValue('14')
    expect(within(dialogo).getByLabelText(/Probabilidade padrão/)).toHaveValue('10')
    await userEvent.clear(within(dialogo).getByLabelText(/Alerta de parada/))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(s.funis.alterarFase).toHaveBeenCalledWith(id(11), {
        nome: 'Qualificação',
        cor: 'teal',
        probabilidadePadrao: 10,
        diasAlertaParada: null,
      }),
    )
  })

  it('valida probabilidade (0 a 100) e alerta (1 em diante) antes de enviar', async () => {
    const s = servicosDeFunis()
    await abrir(s)
    await userEvent.click(screen.getByRole('button', { name: 'Nova fase em Vendas' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.type(within(dialogo).getByLabelText(/Nome da fase/), 'X')
    const prob = within(dialogo).getByLabelText(/Probabilidade padrão/)
    await userEvent.clear(prob)
    await userEvent.type(prob, '101')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar fase' }))
    expect(
      await within(dialogo).findByText('Informe um número inteiro de 0 a 100.'),
    ).toBeInTheDocument()
    await userEvent.clear(prob)
    await userEvent.type(prob, '50')
    await userEvent.type(within(dialogo).getByLabelText(/Alerta de parada/), '0')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar fase' }))
    expect(
      await within(dialogo).findByText('Informe um número inteiro de 1 em diante, ou deixe vazio.'),
    ).toBeInTheDocument()
    expect(s.funis.criarFase).not.toHaveBeenCalled()
  })

  it('nome de fase repetido no funil vira erro do campo', async () => {
    const s = servicosDeFunis(dados(), {
      criarFase: vi.fn(async () =>
        falha('nome_duplicado', 'Já existe um item com esse nome.', 409),
      ),
    })
    await abrir(s)
    await userEvent.click(screen.getByRole('button', { name: 'Nova fase em Vendas' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.type(within(dialogo).getByLabelText(/Nome da fase/), 'Proposta')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar fase' }))
    expect(
      await within(dialogo).findByText('Já existe uma fase com esse nome neste funil.'),
    ).toBeInTheDocument()
  })

  it('exclui a fase depois de confirmar; o erro da API fica no diálogo', async () => {
    const excluirFase = vi
      .fn()
      .mockResolvedValueOnce(falha('conflito', 'A fase tem oportunidades ativas.', 409))
      .mockResolvedValue(ok(dados()[0] as Funil))
    const s = servicosDeFunis(dados(), { excluirFase })
    await abrir(s)
    await userEvent.click(
      within(fasedo('Vendas', 'Proposta')).getByRole('button', { name: 'Excluir a fase Proposta' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir a fase Proposta?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir fase' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'A fase tem oportunidades ativas.',
    )
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir fase' }))
    await waitFor(() => expect(excluirFase).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Fase Proposta excluída')).toBeInTheDocument()
  })

  it('inativa e reativa a fase (a que já teve oportunidade só se inativa); o erro da API vira aviso', async () => {
    const alterarFase = vi
      .fn()
      .mockResolvedValueOnce(
        falha(
          'fase_com_oportunidades_ativas',
          'A fase tem 2 oportunidades ativas: mova-as antes.',
          409,
        ),
      )
      .mockResolvedValue(ok(dados()[0] as Funil))
    const s = servicosDeFunis(dados(), { alterarFase })
    await abrir(s)
    const botao = () =>
      within(fasedo('Vendas', 'Proposta')).getByRole('button', { name: /Inativar.*Proposta/ })
    await userEvent.click(botao())
    expect(await screen.findByText(/A fase tem 2 oportunidades ativas/)).toBeInTheDocument()
    await userEvent.click(botao())
    await waitFor(() => expect(alterarFase).toHaveBeenCalledTimes(2))
    expect(alterarFase).toHaveBeenLastCalledWith(expect.any(String), { ativo: false })
    expect(await screen.findByText('Fase Proposta inativada')).toBeInTheDocument()
  })

  it('fase inativa aparece como Inativa, com o botão Reativar', async () => {
    const funis = dados()
    const f = funis[0] as Funil
    f.fases = f.fases.map((x) => (x.nome === 'Proposta' ? { ...x, ativo: false } : x))
    await abrir(servicosDeFunis(funis))
    const fase = fasedo('Vendas', 'Proposta')
    expect(within(fase).getByText('Inativa')).toBeInTheDocument()
    expect(within(fase).getByRole('button', { name: /Reativar.*Proposta/ })).toBeInTheDocument()
  })

  it('reordena as fases do funil pelos botões', async () => {
    const s = servicosDeFunis()
    await abrir(s)
    expect(
      within(fasedo('Vendas', 'Qualificação')).getByRole('button', {
        name: 'Mover a fase Qualificação para cima',
      }),
    ).toBeDisabled()
    await userEvent.click(
      within(fasedo('Vendas', 'Qualificação')).getByRole('button', {
        name: 'Mover a fase Qualificação para baixo',
      }),
    )
    await waitFor(() =>
      expect(s.funis.reordenarFases).toHaveBeenCalledWith(id(1), [id(12), id(11), id(13)]),
    )
  })
})
