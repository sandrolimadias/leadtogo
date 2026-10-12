import type { Motivo, Origem, Solucao, TipoAtividade, Vertical } from '@leadtogo/api-client'
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

/** Um serviço de cadastro de mentira, com os dados dados; o que o teste quiser trocar entra em `extra`. */
function cadastro<T extends { id: string }>(itens: T[], extra: Record<string, unknown> = {}) {
  return {
    listar: vi.fn(async () => ok(itens)),
    criar: vi.fn(async () => ok(itens[0] as T)),
    alterar: vi.fn(async () => ok(itens[0] as T)),
    excluir: vi.fn(async () => ok(undefined)),
    reordenar: vi.fn(async () => ok(itens)),
    ...extra,
  }
}
type Cadastro = ReturnType<typeof cadastro>
function servicosCom(cadastros: Record<string, Cadastro>) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComPapel('admin'),
    cadastros: { ...base.cadastros, ...cadastros },
  })
}

/** A seção já carregada (sem o esqueleto): clicar antes disso acerta um botão que logo sai da tela. */
const secao = async (nome: string) => {
  const regiao = await screen.findByRole('region', { name: nome })
  await waitFor(() => expect(within(regiao).queryByRole('status')).toBeNull())
  return regiao
}
const linha = (regiao: HTMLElement, nome: string) =>
  within(regiao).getByRole('listitem', { name: nome })

describe('Configurações: menu e acesso das telas de cadastros', () => {
  it('o menu interno traz as telas novas', async () => {
    renderizar(servicosCom({}), '/configuracoes/tags')
    const menu = await screen.findByRole('navigation', { name: 'Configurações' })
    for (const nome of [/Tipos de atividade/, /Origens e motivos/, /Verticais e soluções/]) {
      expect(within(menu).getByRole('link', { name: nome })).toBeInTheDocument()
    }
  })

  it.each([
    '/configuracoes/tipos-de-atividade',
    '/configuracoes/origens-e-motivos',
    '/configuracoes/verticais-e-solucoes',
  ])('gestor e vendedor voltam para o início ao abrir %s', async (rota) => {
    for (const papel of ['gestor', 'vendedor'] as const) {
      const { historico, unmount } = renderizar(
        servicosFalsos({ me: async () => meComPapel(papel) }),
        rota,
      )
      await waitFor(() => expect(historico.location.pathname).toBe('/'))
      unmount()
    }
  })
})

describe('Verticais (a lista genérica: estados, criar, editar, excluir, ordenar)', () => {
  const verticais = (): Vertical[] => [
    { id: id(1), nome: 'Indústria', cor: 'teal', ativo: true, ordem: 0 },
    { id: id(2), nome: 'Saúde', cor: 'green', ativo: false, ordem: 1 },
  ]
  const abrir = async (v: Cadastro) => {
    renderizar(
      servicosCom({ verticais: v, solucoes: cadastro<Solucao>([]) }),
      '/configuracoes/verticais-e-solucoes',
    )
    return secao('Verticais')
  }

  it('carrega mostrando o esqueleto', async () => {
    renderizar(
      servicosCom({
        verticais: cadastro<Vertical>([], { listar: () => new Promise(() => undefined) }),
      }),
      '/configuracoes/verticais-e-solucoes',
    )
    expect(
      await screen.findByRole('status', { name: 'Carregando as verticais' }),
    ).toBeInTheDocument()
  })

  it('erro ao carregar: mostra o motivo e "Tentar de novo" recarrega', async () => {
    const listar = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Servidor fora do ar.', 503))
      .mockResolvedValue(ok(verticais()))
    const regiao = await abrir(cadastro<Vertical>([], { listar }))
    expect(await within(regiao).findByRole('alert')).toHaveTextContent('Servidor fora do ar.')
    await userEvent.click(within(regiao).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(regiao).findByRole('listitem', { name: 'Indústria' })).toBeInTheDocument()
  })

  it('vazio: convida a criar a primeira', async () => {
    const regiao = await abrir(cadastro<Vertical>([]))
    expect(
      await within(regiao).findByRole('heading', { name: 'Nenhuma vertical ainda' }),
    ).toBeInTheDocument()
    expect(within(regiao).getAllByRole('button', { name: 'Nova vertical' })).toHaveLength(2)
  })

  it('lista as verticais, com a palavra "Inativo" na inativada', async () => {
    const regiao = await abrir(cadastro(verticais()))
    expect(
      within(await within(regiao).findByRole('listitem', { name: 'Indústria' })).queryByText(
        'Inativo',
      ),
    ).toBeNull()
    expect(within(linha(regiao, 'Saúde')).getByText('Inativo')).toBeInTheDocument()
  })

  it('cria: nome aparado e cor escolhida; relê a lista', async () => {
    const v = cadastro(verticais())
    const regiao = await abrir(v)
    await userEvent.click(await within(regiao).findByRole('button', { name: 'Nova vertical' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova vertical' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), '  Varejo ')
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Âmbar' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(v.criar).toHaveBeenCalledWith({ nome: 'Varejo', cor: 'amber' }))
    expect(await screen.findByText('Vertical criada')).toBeInTheDocument()
    await waitFor(() => expect(v.listar).toHaveBeenCalledTimes(2))
  })

  it('nome vazio avisa no campo; nome repetido volta como erro do campo e o diálogo fica aberto', async () => {
    const v = cadastro(verticais(), {
      criar: vi.fn(async () => falha('nome_duplicado', 'Já existe um item com esse nome.', 409)),
    })
    const regiao = await abrir(v)
    await userEvent.click(await within(regiao).findByRole('button', { name: 'Nova vertical' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    expect(await within(dialogo).findByText('Informe o nome.')).toBeInTheDocument()
    expect(v.criar).not.toHaveBeenCalled()
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), 'Indústria')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    expect(await within(dialogo).findByText('Já existe um item com esse nome.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('edita e inativa pelo diálogo de edição', async () => {
    const v = cadastro(verticais())
    const regiao = await abrir(v)
    await userEvent.click(
      await within(regiao).findByRole('button', { name: 'Editar vertical Indústria' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Editar vertical Indústria' })
    expect(within(dialogo).getByRole('radio', { name: 'Azul-petróleo' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await userEvent.click(within(dialogo).getByRole('switch', { name: 'Ativo' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(v.alterar).toHaveBeenCalledWith(id(1), {
        nome: 'Indústria',
        cor: 'teal',
        ativo: false,
      }),
    )
    expect(await screen.findByText('Vertical atualizada')).toBeInTheDocument()
  })

  it('exclui depois de confirmar; o erro da API fica no diálogo de confirmação', async () => {
    const excluir = vi
      .fn()
      .mockResolvedValueOnce(falha('conflito', 'A vertical está em uso.', 409))
      .mockResolvedValue(ok(undefined))
    const regiao = await abrir(cadastro(verticais(), { excluir }))
    await userEvent.click(
      await within(regiao).findByRole('button', { name: 'Excluir vertical Indústria' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir vertical Indústria?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('A vertical está em uso.')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(excluir).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Vertical Indústria excluída')).toBeInTheDocument()
  })

  it('reordena pelos botões; o primeiro não sobe e o último não desce', async () => {
    const v = cadastro(verticais())
    const regiao = await abrir(v)
    expect(
      await within(regiao).findByRole('button', { name: 'Mover vertical Indústria para cima' }),
    ).toBeDisabled()
    expect(
      within(regiao).getByRole('button', { name: 'Mover vertical Saúde para baixo' }),
    ).toBeDisabled()
    await userEvent.click(
      within(regiao).getByRole('button', { name: 'Mover vertical Indústria para baixo' }),
    )
    await waitFor(() => expect(v.reordenar).toHaveBeenCalledWith([id(2), id(1)]))
  })
})

describe('Soluções', () => {
  const solucoes = (): Solucao[] => [
    {
      id: id(1),
      nome: 'Monitoramento',
      cor: 'blue',
      descricao: 'Sensores e painéis',
      ativo: true,
      ordem: 0,
    },
  ]
  const abrir = async (s: Cadastro) => {
    renderizar(
      servicosCom({ solucoes: s, verticais: cadastro<Vertical>([]) }),
      '/configuracoes/verticais-e-solucoes',
    )
    return secao('Soluções')
  }

  it('mostra a descrição na linha', async () => {
    const regiao = await abrir(cadastro(solucoes()))
    expect(await within(regiao).findByText('Sensores e painéis')).toBeInTheDocument()
  })

  it('descrição vazia vai como nula; preenchida vai aparada', async () => {
    const s = cadastro(solucoes())
    const regiao = await abrir(s)
    await userEvent.click(await within(regiao).findByRole('button', { name: 'Nova solução' }))
    let dialogo = await screen.findByRole('dialog', { name: 'Nova solução' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), 'Retrofit')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    await waitFor(() =>
      expect(s.criar).toHaveBeenCalledWith({ nome: 'Retrofit', cor: 'gray', descricao: null }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(within(regiao).getByRole('button', { name: 'Nova solução' }))
    dialogo = await screen.findByRole('dialog', { name: 'Nova solução' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), 'Preditiva')
    await userEvent.type(within(dialogo).getByLabelText('Descrição'), '  Manutenção por dados  ')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    await waitFor(() =>
      expect(s.criar).toHaveBeenLastCalledWith({
        nome: 'Preditiva',
        cor: 'gray',
        descricao: 'Manutenção por dados',
      }),
    )
  })
})

describe('Origens', () => {
  const origens = (): Origem[] => [
    { id: id(1), nome: 'Indicação', ativo: true, ordem: 0, chaveSistema: null },
    { id: id(2), nome: 'Importação', ativo: true, ordem: 1, chaveSistema: 'importacao' },
  ]
  const abrir = async (o: Cadastro) => {
    renderizar(
      servicosCom({ origens: o, motivos: cadastro<Motivo>([]) }),
      '/configuracoes/origens-e-motivos',
    )
    return secao('Origens')
  }

  it('a origem do sistema não se exclui nem se inativa, mas se renomeia', async () => {
    const o = cadastro(origens())
    const regiao = await abrir(o)
    const imp = await within(regiao).findByRole('listitem', { name: 'Importação' })
    expect(
      within(imp).getByText('Usada pelo sistema na importação de planilhas'),
    ).toBeInTheDocument()
    expect(within(imp).queryByRole('button', { name: /Excluir/ })).toBeNull()
    expect(
      within(linha(regiao, 'Indicação')).getByRole('button', { name: 'Excluir origem Indicação' }),
    ).toBeInTheDocument()

    await userEvent.click(within(imp).getByRole('button', { name: 'Editar origem Importação' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('switch', { name: 'Ativo' })).toBeDisabled()
    const campo = within(dialogo).getByLabelText(/Nome/)
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Planilha')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(o.alterar).toHaveBeenCalledWith(id(2), { nome: 'Planilha', ativo: true }),
    )
  })

  it('cria uma origem só com o nome', async () => {
    const o = cadastro(origens())
    const regiao = await abrir(o)
    await userEvent.click(await within(regiao).findByRole('button', { name: 'Nova origem' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova origem' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), 'Evento')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(o.criar).toHaveBeenCalledWith({ nome: 'Evento' }))
  })
})

describe('Motivos', () => {
  const motivos = (): Motivo[] => [
    { id: id(1), nome: 'Preço', aplicaA: ['perdido'], ativo: true, ordem: 0 },
    { id: id(2), nome: 'Duplicada', aplicaA: ['cancelado', 'suspenso'], ativo: true, ordem: 1 },
  ]
  const abrir = async (m: Cadastro) => {
    renderizar(
      servicosCom({ motivos: m, origens: cadastro<Origem>([]) }),
      '/configuracoes/origens-e-motivos',
    )
    return secao('Motivos')
  }

  it('mostra em quais status cada motivo vale', async () => {
    const regiao = await abrir(cadastro(motivos()))
    const preco = await within(regiao).findByRole('listitem', { name: 'Preço' })
    expect(within(preco).getByText('Perdido')).toBeInTheDocument()
    const dup = within(regiao).getByRole('listitem', { name: 'Duplicada' })
    expect(within(dup).getByText('Cancelado')).toBeInTheDocument()
    expect(within(dup).getByText('Suspenso')).toBeInTheDocument()
  })

  it('novo motivo já vem para "Perdido"; exige ao menos um status', async () => {
    const m = cadastro(motivos())
    const regiao = await abrir(m)
    await userEvent.click(await within(regiao).findByRole('button', { name: 'Novo motivo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo motivo' })
    const perdido = within(dialogo).getByRole('checkbox', { name: 'Perdido' })
    expect(perdido).toBeChecked()
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), 'Prazo')
    await userEvent.click(perdido)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    expect(await within(dialogo).findByText('Escolha ao menos um status.')).toBeInTheDocument()
    expect(m.criar).not.toHaveBeenCalled()

    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Suspenso' }))
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Cancelado' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    await waitFor(() =>
      expect(m.criar).toHaveBeenCalledWith({ nome: 'Prazo', aplicaA: ['cancelado', 'suspenso'] }),
    )
  })

  it('edita os status de um motivo', async () => {
    const m = cadastro(motivos())
    const regiao = await abrir(m)
    await userEvent.click(
      await within(regiao).findByRole('button', { name: 'Editar motivo Preço' }),
    )
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Cancelado' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(m.alterar).toHaveBeenCalledWith(id(1), {
        nome: 'Preço',
        aplicaA: ['perdido', 'cancelado'],
        ativo: true,
      }),
    )
  })
})

describe('Tipos de atividade', () => {
  const tipos = (): TipoAtividade[] => [
    {
      id: id(1),
      nome: 'Visita',
      icone: 'map-pin',
      cor: 'orange',
      contaComo: 'visita',
      exigeEmpresa: true,
      sincronizaAgenda: false,
      ativo: true,
      ordem: 0,
      chaveSistema: 'visita',
    },
    {
      id: id(2),
      nome: 'Ligação',
      icone: 'phone',
      cor: 'blue',
      contaComo: 'contato',
      exigeEmpresa: true,
      sincronizaAgenda: false,
      ativo: true,
      ordem: 1,
      chaveSistema: 'ligacao',
    },
    {
      id: id(3),
      nome: 'Tarefa',
      icone: 'square-check',
      cor: 'gray',
      contaComo: 'nenhum',
      exigeEmpresa: false,
      sincronizaAgenda: false,
      ativo: true,
      ordem: 2,
      chaveSistema: 'tarefa',
    },
  ]
  const abrir = async (t: Cadastro) => {
    renderizar(servicosCom({ tiposAtividade: t }), '/configuracoes/tipos-de-atividade')
    return secao('Tipos de atividade')
  }

  it('mostra o que cada tipo faz pela carteira', async () => {
    const regiao = await abrir(cadastro(tipos()))
    const visita = await within(regiao).findByRole('listitem', { name: 'Visita' })
    expect(within(visita).getByText('Conta como visita')).toBeInTheDocument()
    expect(within(linha(regiao, 'Ligação')).getByText('Conta como contato')).toBeInTheDocument()
    expect(within(linha(regiao, 'Tarefa')).getByText('Empresa opcional')).toBeInTheDocument()
  })

  it('o tipo Tarefa é do sistema: sem excluir, "Ativo", "Conta como" e "Exige empresa" travados', async () => {
    const t = cadastro(tipos())
    const regiao = await abrir(t)
    const tarefa = await within(regiao).findByRole('listitem', { name: 'Tarefa' })
    expect(within(tarefa).getByText('Tipo interno do sistema')).toBeInTheDocument()
    expect(within(tarefa).queryByRole('button', { name: /Excluir/ })).toBeNull()
    await userEvent.click(within(tarefa).getByRole('button', { name: 'Editar tipo Tarefa' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('switch', { name: 'Ativo' })).toBeDisabled()
    expect(within(dialogo).getByLabelText('Conta como')).toBeDisabled()
    expect(within(dialogo).getByRole('switch', { name: 'Exige empresa' })).toBeDisabled()
    // ainda dá para mudar o ícone
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Maleta' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(t.alterar).toHaveBeenCalledWith(id(3), {
        nome: 'Tarefa',
        icone: 'briefcase',
        cor: 'gray',
        contaComo: 'nenhum',
        exigeEmpresa: false,
        ativo: true,
      }),
    )
  })

  it('cria um tipo com ícone, cor, "conta como" e empresa opcional', async () => {
    const t = cadastro(tipos())
    const regiao = await abrir(t)
    await userEvent.click(await within(regiao).findByRole('button', { name: 'Novo tipo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo tipo' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), 'Visita técnica')
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Local' }))
    expect(within(dialogo).getByRole('radio', { name: 'Local' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Laranja' }))
    await userEvent.selectOptions(within(dialogo).getByLabelText('Conta como'), 'visita')
    await userEvent.click(within(dialogo).getByRole('switch', { name: 'Exige empresa' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }))
    await waitFor(() =>
      expect(t.criar).toHaveBeenCalledWith({
        nome: 'Visita técnica',
        icone: 'map-pin',
        cor: 'orange',
        contaComo: 'visita',
        exigeEmpresa: false,
      }),
    )
  })

  it('tipo comum pode ser excluído; erro da API aparece no diálogo', async () => {
    const t = cadastro(tipos(), {
      excluir: vi.fn(async () => falha('conflito', 'O tipo está em uso.', 409)),
    })
    const regiao = await abrir(t)
    await userEvent.click(
      await within(regiao).findByRole('button', { name: 'Excluir tipo Ligação' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir tipo Ligação?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('O tipo está em uso.')
  })
})
