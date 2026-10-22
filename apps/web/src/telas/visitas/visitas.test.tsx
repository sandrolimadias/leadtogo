import type { ModeloDeVisita, ResultadoDeVisita, TagGrupo } from '@leadtogo/api-client'
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

const modeloDeFabrica = (extra: Partial<ModeloDeVisita> = {}): ModeloDeVisita => ({
  id: id(1),
  nome: 'Relatório de visita',
  padrao: true,
  ativo: true,
  ordem: 0,
  resultados: 6,
  emUso: false,
  versaoAtual: {
    id: id(2),
    numero: 1,
    criadoEm: '2026-10-22T12:00:00.000Z',
    campos: [
      { id: id(10), rotulo: 'Contato', tipo: 'contato', obrigatorio: false },
      {
        id: id(11),
        rotulo: 'Interesse',
        tipo: 'escolha_unica',
        obrigatorio: false,
        opcoes: [
          { id: id(20), rotulo: 'Alto' },
          { id: id(21), rotulo: 'Baixo' },
        ],
      },
    ],
  },
  ...extra,
})

const resultados = (): ResultadoDeVisita[] => [
  {
    id: id(30),
    nome: 'Visita realizada',
    chaveSistema: null,
    modeloId: id(1),
    ativo: true,
    ordem: 0,
  },
  {
    id: id(31),
    nome: 'Não localizada',
    chaveSistema: 'nao_localizada',
    modeloId: id(1),
    ativo: true,
    ordem: 1,
  },
]

const grupos = (): TagGrupo[] => [
  {
    id: id(40),
    nome: 'Interesse',
    selecao: 'multipla',
    obrigatorio: false,
    sistema: false,
    automatico: false,
    ativo: true,
    ordem: 0,
    tags: [
      {
        id: id(41),
        tagGrupoId: id(40),
        nome: 'Quer demonstração',
        cor: 'blue',
        ativo: true,
        ordem: 0,
        chaveSistema: null,
        apareceNoMapa: true,
        visivelAoAbrir: true,
      },
    ],
  },
  {
    id: id(50),
    nome: 'Visitação',
    selecao: 'multipla',
    obrigatorio: false,
    sistema: true,
    automatico: true,
    ativo: true,
    ordem: 1,
    tags: [
      {
        id: id(51),
        tagGrupoId: id(50),
        nome: 'Visitada',
        cor: 'orange',
        ativo: true,
        ordem: 0,
        chaveSistema: 'visitada',
        apareceNoMapa: true,
        visivelAoAbrir: true,
      },
    ],
  },
]

function servicosDeVisitas(troca: Record<string, unknown> = {}) {
  const base = servicosFalsos()
  const modelos = { ...base.visitas.modelos, listar: vi.fn(async () => ok([modeloDeFabrica()])) }
  const rs = { ...base.visitas.resultados, listar: vi.fn(async () => ok(resultados())) }
  const visitas = { ...base.visitas, modelos, resultados: rs, ...troca }
  return {
    servicos: servicosFalsos({
      me: async () => meComPapel('admin'),
      visitas,
      tags: { ...base.tags, listar: vi.fn(async () => ok(grupos())) },
    }),
    visitas,
  }
}

const abrirAba = async (nome: string) => {
  await userEvent.click(await screen.findByRole('tab', { name: nome }))
}

describe('Configurações → Visitas', () => {
  it('aparece no menu para o admin; gestor e vendedor voltam para o início', async () => {
    const { servicos } = servicosDeVisitas()
    const { unmount } = renderizar(servicos, '/configuracoes/visitas')
    const menu = await screen.findByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Visitas/ })).toBeInTheDocument()
    unmount()
    for (const papel of ['gestor', 'vendedor'] as const) {
      const r = renderizar(
        servicosFalsos({ me: async () => meComPapel(papel) }),
        '/configuracoes/visitas',
      )
      await waitFor(() => expect(r.historico.location.pathname).toBe('/'))
      r.unmount()
    }
  })

  it('Resultados: lista com o modelo e protege os de sistema (sem excluir, com a nota)', async () => {
    const { servicos } = servicosDeVisitas()
    renderizar(servicos, '/configuracoes/visitas')
    const regiao = await screen.findByRole('region', { name: 'Resultados da visita' })
    const naoLocalizada = await within(regiao).findByRole('listitem', { name: 'Não localizada' })
    expect(naoLocalizada).toHaveTextContent('Relatório de visita')
    expect(naoLocalizada).toHaveTextContent('Sistema')
    expect(naoLocalizada).toHaveTextContent('não marca a empresa como visitada')
    expect(within(naoLocalizada).queryByRole('button', { name: /Excluir/ })).not.toBeInTheDocument()
    const realizada = within(regiao).getByRole('listitem', { name: 'Visita realizada' })
    expect(within(realizada).getByRole('button', { name: /Excluir/ })).toBeInTheDocument()
  })

  it('Modelos: lista com padrão, campos e versão; o construtor mostra a prévia e cria campo novo', async () => {
    const criado = modeloDeFabrica({ id: id(3), nome: 'Visita técnica', padrao: false })
    const { servicos, visitas } = servicosDeVisitas()
    visitas.modelos.criar = vi.fn(async () => ok(criado))
    renderizar(servicos, '/configuracoes/visitas')
    await abrirAba('Modelos')
    const item = await screen.findByRole('listitem', { name: 'Relatório de visita' })
    expect(item).toHaveTextContent('Padrão')
    expect(item).toHaveTextContent('2 campos · versão 1 · usado por 6 resultados')

    await userEvent.click(screen.getByRole('button', { name: 'Novo modelo' }))
    const form = await screen.findByRole('form', { name: 'Construtor do modelo' })
    await userEvent.type(within(form).getByLabelText(/Nome do modelo/), 'Visita técnica')
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar campo' }))
    await userEvent.type(within(form).getByLabelText('Pergunta'), 'Quantos turnos?')
    await userEvent.selectOptions(within(form).getByLabelText('Tipo'), 'numero')
    const previa = within(form).getByRole('complementary', { name: 'Prévia do relatório' })
    expect(within(previa).getByLabelText(/Quantos turnos\?/)).toBeInTheDocument()
    expect(within(previa).getByLabelText(/Resultado da visita/)).toBeInTheDocument()

    await userEvent.click(within(form).getByRole('button', { name: 'Salvar modelo' }))
    await waitFor(() => expect(visitas.modelos.criar).toHaveBeenCalled())
    const [dados] = vi.mocked(visitas.modelos.criar).mock.calls[0] as unknown as [
      { nome: string; campos: { rotulo: string; tipo: string }[] },
    ]
    expect(dados.nome).toBe('Visita técnica')
    expect(dados.campos).toMatchObject([{ rotulo: 'Quantos turnos?', tipo: 'numero' }])
  })

  it('construtor: campo tag só oferece tags de grupo não automático; erro de validação aparece', async () => {
    const { servicos, visitas } = servicosDeVisitas()
    renderizar(servicos, '/configuracoes/visitas')
    await abrirAba('Modelos')
    await userEvent.click(await screen.findByRole('button', { name: 'Novo modelo' }))
    const form = await screen.findByRole('form', { name: 'Construtor do modelo' })
    await userEvent.type(within(form).getByLabelText(/Nome do modelo/), 'Com tag')
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar campo' }))
    await userEvent.selectOptions(within(form).getByLabelText('Tipo'), 'tag')
    const tag = within(form).getByLabelText(/Tag aplicada/)
    const opcoes = within(tag)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opcoes).toContain('Interesse: Quer demonstração')
    expect(opcoes.join()).not.toContain('Visitada')

    // sem rótulo nem tag: não envia e diz o que falta
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar modelo' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Campo 1')
    expect(visitas.modelos.criar).not.toHaveBeenCalled()
  })

  it('modelo em uso: avisa que salvar publica a versão seguinte', async () => {
    const { servicos } = servicosDeVisitas({
      modelos: {
        ...servicosFalsos().visitas.modelos,
        listar: vi.fn(async () => ok([modeloDeFabrica({ emUso: true })])),
      },
    })
    renderizar(servicos, '/configuracoes/visitas')
    await abrirAba('Modelos')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar modelo Relatório de visita' }),
    )
    expect(await screen.findByText(/publica a versão 2/)).toBeInTheDocument()
  })

  it('Check-in: carrega o padrão, valida o limite e salva', async () => {
    const alterarConfiguracao = vi.fn(async () =>
      ok({
        checkinModo: 'bloquear' as const,
        checkinLimiteM: 150,
        lembreteRelatoriosHora: '18:00',
      }),
    )
    const { servicos } = servicosDeVisitas({ alterarConfiguracao })
    renderizar(servicos, '/configuracoes/visitas')
    await abrirAba('Check-in')
    const limite = await screen.findByLabelText(/Limite de distância/)
    expect(limite).toHaveValue('300')
    await userEvent.click(screen.getByRole('radio', { name: /Bloquear/ }))
    await userEvent.clear(limite)
    await userEvent.type(limite, '5')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('use ao menos 10 m')).toBeInTheDocument()
    expect(alterarConfiguracao).not.toHaveBeenCalled()

    await userEvent.clear(limite)
    await userEvent.type(limite, '150')
    const hora = screen.getByLabelText(/Lembrete dos relatórios/)
    await userEvent.clear(hora)
    await userEvent.type(hora, '18:00')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(alterarConfiguracao).toHaveBeenCalledWith({
        checkinModo: 'bloquear',
        checkinLimiteM: 150,
        lembreteRelatoriosHora: '18:00',
      }),
    )
  })

  it('erro ao carregar os modelos: mostra o motivo', async () => {
    const { servicos } = servicosDeVisitas({
      modelos: {
        ...servicosFalsos().visitas.modelos,
        listar: vi.fn(async () => falha('x', 'Servidor fora do ar.', 503)),
      },
    })
    renderizar(servicos, '/configuracoes/visitas')
    expect(await screen.findByText('Servidor fora do ar.')).toBeInTheDocument()
  })
})
