import type { ListaDeContatos, TagGrupo } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, itemDeContato, itemDeEmpresa, meComPapel, papeis } from './fixtures'

const grupos: TagGrupo[] = [
  {
    id: id(50),
    nome: 'Status',
    selecao: 'unica',
    obrigatorio: true,
    sistema: true,
    automatico: false,
    ativo: true,
    ordem: 0,
    tags: [
      {
        id: id(51),
        tagGrupoId: id(50),
        nome: 'Cliente',
        cor: 'green',
        ativo: true,
        ordem: 0,
        chaveSistema: 'cliente',
      },
      {
        id: id(52),
        tagGrupoId: id(50),
        nome: 'Antiga',
        cor: 'gray',
        ativo: false,
        ordem: 1,
        chaveSistema: null,
      },
    ],
  },
]

const lista = (
  itens = [itemDeContato(1), itemDeContato(2)],
  total = itens.length,
): ListaDeContatos => ({
  itens,
  total,
  pagina: 1,
  porPagina: 25,
})

function servicos(
  resposta: ListaDeContatos = lista(),
  papel: 'admin' | 'gestor' | 'vendedor' = 'admin',
) {
  const base = servicosFalsos()
  const listar = vi.fn(async (_consulta: Record<string, unknown>) => ok(resposta))
  const contatos = {
    ...base.contatos,
    listar,
    opcoes: vi.fn(async () => ok({ cargos: ['Compras', 'Diretor'] })),
  }
  const empresas = vi.fn(async (consulta: Record<string, unknown>) => {
    const todas = [itemDeEmpresa(1, { nome: 'Usidantec' }), itemDeEmpresa(2, { nome: 'Beta' })]
    const termo = typeof consulta['busca'] === 'string' ? consulta['busca'].toLowerCase() : ''
    const itens = termo ? todas.filter((e) => e.nome.toLowerCase().includes(termo)) : todas
    return ok({ itens, total: itens.length, pagina: 1, porPagina: 8 })
  })
  const s = servicosFalsos({
    me: async () => meComPapel(papel),
    contatos: contatos,
    carteira: { ...base.carteira, listar: empresas },
    tags: { ...base.tags, listar: vi.fn(async () => ok(grupos)) },
    cadastros: {
      ...base.cadastros,
      papeisDecisao: { ...base.cadastros.papeisDecisao, listar: vi.fn(async () => ok(papeis)) },
    },
  })
  return { s, listar, empresas }
}

const abrir = async (x: ReturnType<typeof servicos>, rota = '/contatos') => {
  const r = renderizar(x.s, rota)
  await screen.findByRole('heading', { name: 'Contatos' })
  return r
}
const ultimaConsulta = (x: ReturnType<typeof servicos>) =>
  x.listar.mock.calls.at(-1)?.[0] as Record<string, unknown>

function largura(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}
afterEach(() => largura(1280))

describe('Contatos: a lista', () => {
  it('mostra o título, a contagem e as colunas (sem "Última interação")', async () => {
    const x = servicos()
    await abrir(x)
    expect(await screen.findByText('2 contatos na carteira')).toBeInTheDocument()
    const tabela = await screen.findByRole('table')
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Contato', 'Empresas', 'Cargo', 'Telefone', 'E-mail'])
    const linha = within(tabela).getAllByRole('row')[1] as HTMLElement
    expect(within(linha).getByText('Contato 1')).toBeInTheDocument()
    expect(within(linha).getByText('Decisor')).toBeInTheDocument()
    expect(within(linha).getByText('Usidantec')).toBeInTheDocument()
    expect(within(linha).getByText('Diretor')).toBeInTheDocument()
    expect(within(linha).getByText('(27) 99847-2210')).toBeInTheDocument()
    expect(within(linha).getByLabelText('Tem WhatsApp')).toBeInTheDocument()
    expect(within(linha).getByLabelText('Contato principal')).toBeInTheDocument()
    expect(within(linha).getByText('contato1@exemplo.com.br')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Importar planilha/ })).toBeNull()
    expect(ultimaConsulta(x)).toEqual({ pagina: 1, porPagina: 25 })
  })

  it('contagem no singular; vínculo inativo aparece riscado; sem empresa e "Não quer contato"', async () => {
    const x = servicos(
      lista([
        itemDeContato(1, {
          empresas: [
            { id: id(200), nome: 'Ativa', cargo: 'Diretor', principal: false, ativo: true },
            { id: id(201), nome: 'Antiga Ltda', cargo: 'Sócio', principal: false, ativo: false },
          ],
        }),
        itemDeContato(2, {
          empresas: [],
          telefone: null,
          email: null,
          temWhatsapp: false,
          papelDecisao: null,
          naoQuerContato: true,
        }),
      ]),
    )
    await abrir(x)
    const antiga = await screen.findByText('Antiga Ltda')
    expect(antiga).toHaveClass('line-through')
    expect(screen.getByText('(inativo)')).toBeInTheDocument()
    expect(screen.getByText('Ativa')).not.toHaveClass('line-through')
    expect(screen.getByText('Sem empresa')).toBeInTheDocument()
    expect(screen.getByText('Não quer contato')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('1 contato: singular', async () => {
    await abrir(servicos(lista([itemDeContato(1)])))
    expect(await screen.findByText('1 contato na carteira')).toBeInTheDocument()
  })

  it('a busca espera a pausa na digitação, vai para a URL e para a consulta', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    await screen.findByRole('table')
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar contatos' }), 'rogério')
    await waitFor(() => expect(ultimaConsulta(x)).toMatchObject({ busca: 'rogério', pagina: 1 }))
    expect(decodeURIComponent(historico.location.search)).toContain('busca')
    expect(await screen.findByText('2 contatos com estes filtros')).toBeInTheDocument()
  })

  it('filtros: empresa, cargo, papel e tag da empresa (só ativas) vão para a consulta e para a URL', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Empresa' }))
    await userEvent.click(await screen.findByRole('button', { name: /Usidantec/ }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cargo' }), 'Compras')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Papel na decisão' }), id(2))
    const tag = screen.getByRole('combobox', { name: 'Tag da empresa' })
    expect(
      within(tag)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Tag da empresa: todas', 'Status: Cliente'])
    await userEvent.selectOptions(tag, id(51))
    await waitFor(() =>
      expect(ultimaConsulta(x)).toEqual({
        empresaId: id(201),
        cargo: 'Compras',
        papelDecisaoId: id(2),
        tagId: id(51),
        pagina: 1,
        porPagina: 25,
      }),
    )
    expect(historico.location.search).toContain('cargo=Compras')
  })

  it('papéis inativos não são opções do filtro; a URL com filtro já abre filtrada, e "Limpar filtros" limpa tudo', async () => {
    const x = servicos()
    const { historico } = await abrir(x, `/contatos?cargo=Diretor&papel=${id(1)}&busca=ana`)
    await screen.findByRole('table')
    expect(ultimaConsulta(x)).toMatchObject({
      cargo: 'Diretor',
      papelDecisaoId: id(1),
      busca: 'ana',
    })
    expect(screen.getByRole('textbox', { name: 'Buscar contatos' })).toHaveValue('ana')
    const papel = screen.getByRole('combobox', { name: 'Papel na decisão' })
    expect(within(papel).queryByRole('option', { name: 'Técnico' })).toBeNull()
    expect(papel).toHaveValue(id(1))
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(ultimaConsulta(x)).toEqual({ pagina: 1, porPagina: 25 }))
    expect(historico.location.search).toBe('')
    expect(screen.getByRole('textbox', { name: 'Buscar contatos' })).toHaveValue('')
  })

  it('valores inválidos na URL são ignorados', async () => {
    const x = servicos()
    await abrir(x, '/contatos?pagina=abc&empresa=&cargo=%20&inventado=1')
    await screen.findByRole('table')
    expect(ultimaConsulta(x)).toEqual({ pagina: 1, porPagina: 25 })
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  it('Empresa: busca no servidor pelo que se digita (nome ou CNPJ) e mostra só os resultados', async () => {
    const x = servicos()
    await abrir(x)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Empresa' }))
    const lista = await screen.findByRole('list', { name: 'Empresas encontradas' })
    expect(within(lista).getAllByRole('button')).toHaveLength(2)
    expect(x.empresas).toHaveBeenLastCalledWith({ porPagina: 8, ordem: 'nome' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar empresa' }), 'usid')
    await waitFor(() =>
      expect(x.empresas).toHaveBeenLastCalledWith({ busca: 'usid', porPagina: 8, ordem: 'nome' }),
    )
    await waitFor(() => expect(within(lista).getAllByRole('button')).toHaveLength(1))
    expect(within(lista).getByText('Usidantec')).toBeInTheDocument()
  })

  it('Empresa: busca sem resultado avisa, e o aviso de "mais empresas" aparece quando há mais que a página', async () => {
    const x = servicos()
    x.empresas.mockImplementation(async (consulta) =>
      consulta['busca']
        ? ok({ itens: [], total: 0, pagina: 1, porPagina: 8 })
        : ok({
            itens: [itemDeEmpresa(1, { nome: 'Usidantec' })],
            total: 5000,
            pagina: 1,
            porPagina: 8,
          }),
    )
    await abrir(x)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Empresa' }))
    expect(await screen.findByText(/Mais 4999 empresas/)).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar empresa' }), 'zzz')
    expect(await screen.findByText('Nenhuma empresa com esse nome ou CNPJ.')).toBeInTheDocument()
  })

  it('Empresa: "Todas as empresas" e o X limpam o filtro', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Empresa' }))
    await userEvent.click(await screen.findByRole('button', { name: /Beta/ }))
    await waitFor(() => expect(historico.location.search).toContain(`empresa=${id(202)}`))
    expect(screen.getByRole('button', { name: 'Empresa' })).toHaveTextContent('Beta')

    await userEvent.click(screen.getByRole('button', { name: 'Limpar o filtro de empresa' }))
    await waitFor(() => expect(historico.location.search).not.toContain('empresa'))
    expect(screen.getByRole('button', { name: 'Empresa' })).toHaveTextContent('Empresa: todas')
  })

  it('a empresa da URL aparece com o nome no filtro, mesmo fora dos resultados da busca', async () => {
    const x = servicos()
    const base = x.s.carteira
    x.s.carteira = {
      ...base,
      detalhar: vi.fn(async () =>
        ok({ id: id(299), razaoSocial: 'Remota Ltda', nomeFantasia: 'Remota' } as never),
      ),
    }
    await abrir(x, `/contatos?empresa=${id(299)}`)
    await screen.findByRole('table')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Empresa' })).toHaveTextContent('Remota'),
    )
    expect(x.empresas).not.toHaveBeenCalled() // o campo só busca quando é aberto
  })

  it('paginação: Anterior e Próxima mudam a página na URL', async () => {
    const x = servicos({ ...lista([itemDeContato(1)], 60), porPagina: 25 })
    const { historico } = await abrir(x)
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(ultimaConsulta(x)).toMatchObject({ pagina: 2 }))
    expect(historico.location.search).toContain('pagina=2')
  })

  it('sem nenhum contato: convida a cadastrar; com filtro e sem resultado: "Nenhum contato encontrado"', async () => {
    const vazio = servicos(lista([]))
    const { historico, unmount } = await abrir(vazio)
    expect(await screen.findByRole('heading', { name: 'Nenhum contato ainda' })).toBeInTheDocument()
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Novo contato' }).at(-1) as HTMLElement,
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/contatos/novo'))
    unmount()

    const semResultado = servicos(lista([]))
    await abrir(semResultado, '/contatos?busca=zzz')
    expect(
      await screen.findByRole('heading', { name: 'Nenhum contato encontrado' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Revise a busca ou limpe os filtros.')).toBeInTheDocument()
  })

  it('erro ao carregar mostra o motivo e "Tentar de novo" recarrega', async () => {
    const x = servicos()
    x.listar.mockResolvedValueOnce(falha('x', 'Sem conexão.', 0)).mockResolvedValue(ok(lista()))
    renderizar(x.s, '/contatos')
    expect(await screen.findByText('Sem conexão.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('"Novo contato" leva ao cadastro; clicar no contato abre a ficha', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    await userEvent.click(await screen.findByText('Contato 2'))
    await waitFor(() => expect(historico.location.pathname).toBe(`/contatos/${id(102)}`))
  })

  it('o botão "Novo contato" do topo abre o cadastro', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Novo contato' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/contatos/novo'))
  })
})

describe('Contatos: no celular', () => {
  it('mostra cartões com Ligar, WhatsApp e E-mail; sem telefone ou e-mail, desativados', async () => {
    largura(390)
    const x = servicos(
      lista([
        itemDeContato(1),
        itemDeContato(2, {
          telefone: null,
          email: null,
          naoQuerContato: true,
          empresas: [
            { id: id(200), nome: 'Alfa', cargo: null, principal: false, ativo: true },
            { id: id(201), nome: 'Beta', cargo: null, principal: false, ativo: true },
            { id: id(202), nome: 'Gama', cargo: null, principal: false, ativo: true },
          ],
        }),
      ]),
    )
    renderizar(x.s, '/contatos')
    const c1 = await screen.findByRole('article', { name: 'Contato 1' })
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(c1).getByText('Diretor · Usidantec')).toBeInTheDocument()
    expect(within(c1).getByRole('link', { name: 'Ligar' })).toHaveAttribute(
      'href',
      'tel:+5527998472210',
    )
    expect(within(c1).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/5527998472210',
    )
    expect(within(c1).getByRole('link', { name: 'E-mail' })).toHaveAttribute(
      'href',
      'mailto:contato1@exemplo.com.br',
    )
    const c2 = screen.getByRole('article', { name: 'Contato 2' })
    expect(within(c2).getByText('+ 2 outras empresas')).toBeInTheDocument()
    expect(within(c2).getByText('Não quer contato')).toBeInTheDocument()
    for (const nome of ['Ligar', 'WhatsApp', 'E-mail']) {
      expect(within(c2).getByRole('link', { name: nome })).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('"Não quer contato" não desativa Ligar nem WhatsApp (só avisa)', async () => {
    largura(390)
    renderizar(servicos(lista([itemDeContato(1, { naoQuerContato: true })])).s, '/contatos')
    const c = await screen.findByRole('article', { name: 'Contato 1' })
    expect(within(c).getByText('Não quer contato')).toBeInTheDocument()
    expect(within(c).getByRole('link', { name: 'Ligar' })).not.toHaveAttribute('aria-disabled')
    expect(within(c).getByRole('link', { name: 'WhatsApp' })).not.toHaveAttribute('aria-disabled')
  })

  it('os filtros ficam atrás do botão "Filtros · N"; "Novo contato" é um botão de ícone', async () => {
    largura(390)
    const x = servicos()
    const { historico } = renderizar(x.s, `/contatos?cargo=Diretor&papel=${id(1)}`)
    await screen.findByRole('article', { name: 'Contato 1' })
    expect(screen.queryByRole('combobox', { name: 'Cargo' })).toBeNull()
    const botao = screen.getByRole('button', { name: 'Filtros · 2' })
    await userEvent.click(botao)
    expect(screen.getByRole('combobox', { name: 'Cargo' })).toHaveValue('Diretor')
    await userEvent.click(screen.getByRole('button', { name: 'Novo contato' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/contatos/novo'))
  })
})

describe('Contatos: linhas por página e rolagem', () => {
  const prefsCom = (porPagina: Record<string, number>) => ({
    tema: 'sistema' as const,
    menuRecolhido: false,
    visaoDashboard: 'minha' as const,
    filtroPadrao: {},
    porPagina,
  })

  it('pede 25 por padrão; com 100 salvo, pede 100; escolher 50 guarda por tabela e volta à página 1', async () => {
    const padrao = servicos()
    const primeira = await abrir(padrao)
    await screen.findByRole('table')
    expect(ultimaConsulta(padrao)).toMatchObject({ porPagina: 25 })

    primeira.unmount()

    const salvo = servicos(lista())
    salvo.s.preferencias = vi.fn(async () => prefsCom({ contatos: 100 })) as never
    const guardar = vi.fn(async () => ok(prefsCom({ contatos: 50 })))
    salvo.s.alterarPreferencias = guardar as never
    await abrir(salvo, '/contatos?pagina=2')
    await screen.findByRole('table')
    await waitFor(() => expect(ultimaConsulta(salvo)).toMatchObject({ porPagina: 100 }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Linhas por página' }), '50')
    await waitFor(() => expect(guardar).toHaveBeenCalledWith({ porPagina: { contatos: 50 } }))
    await waitFor(() => expect(ultimaConsulta(salvo)).toMatchObject({ porPagina: 50, pagina: 1 }))
  })

  it('só as linhas rolam: cabeçalho fixo e paginação fora da área rolável', async () => {
    await abrir(servicos())
    const tabela = await screen.findByRole('table')
    const rolavel = tabela.closest('.overflow-auto')
    expect(rolavel).not.toBeNull()
    for (const th of within(tabela).getAllByRole('columnheader')) {
      expect(th.className).toContain('sticky')
    }
    expect(rolavel?.contains(screen.getByRole('navigation', { name: 'Paginação' }))).toBe(false)
  })
})
