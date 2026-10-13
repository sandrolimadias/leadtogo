import type {
  ContagensDaLista,
  ItemDaLista,
  ListaDeEmpresas,
  OpcoesDaLista,
  TagGrupo,
} from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
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

const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000 - 3_600_000).toISOString()

const grupos: TagGrupo[] = [
  {
    id: id(1),
    nome: 'Status',
    selecao: 'unica' as const,
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
      },
      {
        id: id(12),
        tagGrupoId: id(1),
        nome: 'Prospect',
        cor: 'amber',
        ativo: true,
        ordem: 1,
        chaveSistema: 'prospect',
      },
      {
        id: id(13),
        tagGrupoId: id(1),
        nome: 'Cliente',
        cor: 'green',
        ativo: true,
        ordem: 2,
        chaveSistema: 'cliente',
      },
    ],
  },
  {
    id: id(2),
    nome: 'Visitação',
    selecao: 'multipla' as const,
    obrigatorio: false,
    sistema: true,
    automatico: true,
    ativo: true,
    ordem: 1,
    tags: [
      {
        id: id(21),
        tagGrupoId: id(2),
        nome: 'Visitada',
        cor: 'orange',
        ativo: true,
        ordem: 0,
        chaveSistema: 'visitada',
      },
    ],
  },
]

const item = (n: number, extra: Partial<ItemDaLista> = {}): ItemDaLista => ({
  id: id(100 + n),
  nome: `Empresa ${n}`,
  razaoSocial: `Empresa ${n} Ltda`,
  tipoDocumento: 'cnpj',
  documento: '11222333000181',
  matrizFilial: 'matriz',
  vendedor: { id: id(900), nome: 'Ana Souza' },
  cidade: { nome: 'Vitória', uf: 'ES' },
  tags: [
    { id: id(11), nome: 'Cliente', cor: 'green', tagGrupoId: id(1) },
    { id: id(31), nome: 'Retrofit', cor: 'blue', tagGrupoId: id(3) },
    { id: id(32), nome: 'Monitoramento', cor: 'indigo', tagGrupoId: id(3) },
    { id: id(33), nome: 'Premium', cor: 'purple', tagGrupoId: id(3) },
  ],
  telefone: '+552730643021',
  enderecoParaRota: 'RUA DAS FLORES, 567, VITORIA - ES',
  ultimaVisitaEm: diasAtras(120),
  ultimoContatoEm: diasAtras(5),
  proximaAtividadeEm: null,
  situacaoNaoVerificada: false,
  editavel: true,
  ...extra,
})

const lista = (itens: ItemDaLista[], extra: Partial<ListaDeEmpresas> = {}): ListaDeEmpresas => ({
  itens,
  total: itens.length,
  pagina: 1,
  porPagina: 25,
  ...extra,
})
const contagens: ContagensDaLista = {
  todas: 148,
  minha: 41,
  semVisita90: 23,
  nuncaVisitadas: 9,
  semProximaAtividade: 17,
}
const opcoes = (extra: Partial<OpcoesDaLista> = {}): OpcoesDaLista => ({
  vendedores: [
    { id: id(900), nome: 'Ana Souza' },
    { id: id(901), nome: 'Bia Lima' },
  ],
  unicoMembro: false,
  cidades: [
    { codigoIbge: 3205309, nome: 'Vitória', uf: 'ES' },
    { codigoIbge: 3201308, nome: 'Cariacica', uf: 'ES' },
  ],
  diasAlertaDeContato: 60,
  ...extra,
})

function servicos(
  dados: ListaDeEmpresas | (() => Promise<unknown>) = lista([item(1), item(2)]),
  extra: {
    opcoes?: OpcoesDaLista
    contagens?: ContagensDaLista
    papel?: 'admin' | 'gestor' | 'vendedor'
  } = {},
) {
  const carteira = {
    listar: vi.fn(async (_consulta: Record<string, unknown>): Promise<unknown> =>
      typeof dados === 'function' ? dados() : ok(dados),
    ),
    contagens: vi.fn(async () => ok(extra.contagens ?? contagens)),
    opcoes: vi.fn(async () => ok(extra.opcoes ?? opcoes())),
  }
  const s = servicosFalsos({
    me: async () => me(extra.papel),
    carteira: carteira as never,
    tags: { ...servicosFalsos().tags, listar: vi.fn(async () => ok(grupos)) },
  })
  return { s, carteira }
}

const abrir = async (s: ReturnType<typeof servicos>, rota = '/empresas') => {
  const r = renderizar(s.s, rota)
  await screen.findByRole('heading', { name: 'Empresas' })
  return r
}
const ultimaConsulta = (s: ReturnType<typeof servicos>) =>
  s.carteira.listar.mock.calls.at(-1)?.[0] as Record<string, unknown>

function largura(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}
afterEach(() => largura(1280))

describe('Empresas: a lista', () => {
  it('mostra o título, a contagem e as colunas decididas (sem Vendedor nem "Em aberto")', async () => {
    const s = servicos()
    await abrir(s)
    expect(await screen.findByText('2 empresas na carteira')).toBeInTheDocument()
    const tabela = screen.getByRole('table')
    const colunas = within(tabela)
      .getAllByRole('columnheader')
      .map((c) => c.textContent)
    expect(colunas).toEqual([
      'Empresa',
      'Tags',
      'Cidade',
      'Última visita',
      'Último contato',
      'Próxima atividade',
    ])
    expect(screen.getByRole('button', { name: 'Nova empresa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Importar/ })).toBeNull()
  })

  it('cada linha traz nome, CNPJ com máscara, TODAS as tags (sem "+N") e a cidade', async () => {
    const s = servicos()
    await abrir(s)
    const linhas = await screen.findAllByRole('row')
    const primeira = linhas[1] as HTMLElement
    expect(within(primeira).getByText('Empresa 1')).toBeInTheDocument()
    expect(within(primeira).getByText('11.222.333/0001-81')).toBeInTheDocument()
    for (const t of ['Cliente', 'Retrofit', 'Monitoramento', 'Premium']) {
      expect(within(primeira).getByText(t)).toBeInTheDocument()
    }
    expect(within(primeira).queryByText(/^\+\d/)).toBeNull()
    expect(within(primeira).getByText('Vitória/ES')).toBeInTheDocument()
    expect(within(primeira).getByText('Sem próxima atividade')).toBeInTheDocument()
  })

  it('alerta a visita a partir de 90 dias (ou nunca) e o contato a partir do limite da empresa', async () => {
    const s = servicos(
      lista([
        item(1, { ultimaVisitaEm: diasAtras(120), ultimoContatoEm: diasAtras(61) }),
        item(2, { ultimaVisitaEm: diasAtras(10), ultimoContatoEm: diasAtras(11) }),
        item(3, { ultimaVisitaEm: null, ultimoContatoEm: null }),
      ]),
    )
    await abrir(s)
    const linhas = await screen.findAllByRole('row')
    const alerta = (linha: HTMLElement, texto: string) =>
      within(linha).getByText(texto).className.includes('text-warning')
    expect(alerta(linhas[1] as HTMLElement, 'há 120 dias')).toBe(true)
    expect(alerta(linhas[1] as HTMLElement, 'há 61 dias')).toBe(true)
    expect(alerta(linhas[2] as HTMLElement, 'há 10 dias')).toBe(false)
    expect(alerta(linhas[2] as HTMLElement, 'há 11 dias')).toBe(false)
    const nunca = within(linhas[3] as HTMLElement).getAllByText('Nunca')
    expect(nunca).toHaveLength(2)
    expect(nunca.every((n) => n.className.includes('text-warning'))).toBe(true)
  })

  it('os chips trazem a contagem; "Todas" começa marcado e clicar em outro refaz a consulta e a URL', async () => {
    const s = servicos()
    const { historico } = await abrir(s)
    const grupo = await screen.findByRole('group', { name: 'Filtros salvos' })
    expect(
      within(grupo)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Todas148',
      'Minha carteira41',
      'Sem visita há 90 dias23',
      'Nunca visitadas9',
      'Sem próxima atividade17',
    ])
    expect(within(grupo).getByRole('button', { name: /Todas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(within(grupo).getByRole('button', { name: /Nunca visitadas/ }))
    await waitFor(() => expect(ultimaConsulta(s)['chip']).toBe('nunca_visitadas'))
    expect(historico.location.search).toContain('chip=nunca_visitadas')
    expect(within(grupo).getByRole('button', { name: /Nunca visitadas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(within(grupo).getByRole('button', { name: /Todas/ }))
    await waitFor(() => expect(historico.location.search).not.toContain('chip'))
  })

  it('"Incluir leads" refaz as contagens e a lista', async () => {
    const s = servicos()
    await abrir(s)
    await screen.findByText('2 empresas na carteira')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Incluir leads' }))
    await waitFor(() => expect(s.carteira.contagens).toHaveBeenLastCalledWith(true))
    await waitFor(() => expect(ultimaConsulta(s)['incluirLeads']).toBe('true'))
  })

  it('equipe de uma pessoa só: sem o filtro Vendedor e sem o chip "Minha carteira"', async () => {
    const s = servicos(lista([item(1)]), { opcoes: opcoes({ unicoMembro: true }) })
    await abrir(s)
    await screen.findByRole('table')
    expect(screen.queryByRole('combobox', { name: 'Vendedor' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Minha carteira/ })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
  })

  it('com equipe: oferece o filtro Vendedor e o chip "Minha carteira"', async () => {
    const s = servicos()
    await abrir(s)
    await screen.findByRole('table')
    expect(screen.getByRole('combobox', { name: 'Vendedor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Minha carteira/ })).toBeInTheDocument()
  })
})

describe('Empresas: busca e filtros na URL', () => {
  it('a busca espera uma pausa, vai para a URL e para a consulta', async () => {
    const s = servicos()
    const { historico } = await abrir(s)
    await screen.findByRole('table')
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar empresas' }), 'sao joao')
    await waitFor(() => expect(ultimaConsulta(s)['busca']).toBe('sao joao'))
    expect(historico.location.search).toContain('busca=sao+joao')
    expect(s.carteira.listar.mock.calls.filter((c) => c[0]['busca'])).toHaveLength(1)
  })

  it('Status e Visitação viram o filtro de tags; vendedor, cidade e última visita seguem juntos', async () => {
    const s = servicos()
    const { historico } = await abrir(s)
    await screen.findByRole('table')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), id(13))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Visitação' }), id(21))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Vendedor' }), id(901))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cidade' }), '3201308')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Última visita' }), '60')
    await waitFor(() =>
      expect(ultimaConsulta(s)).toMatchObject({
        tags: `${id(13)},${id(21)}`,
        vendedorId: id(901),
        municipio: 3201308,
        ultimaVisita: '60',
        pagina: 1,
      }),
    )
    expect(historico.location.search).toContain('ultimaVisita=60')
  })

  it('abre com os filtros da URL já aplicados e "Limpar filtros" os tira', async () => {
    const s = servicos()
    const { historico } = renderizar(
      s.s,
      `/empresas?busca=aurora&status=${id(13)}&ultimaVisita=90&chip=sem_visita_90`,
    )
    await screen.findByRole('heading', { name: 'Empresas' })
    await waitFor(() =>
      expect(ultimaConsulta(s)).toMatchObject({
        busca: 'aurora',
        tags: id(13),
        ultimaVisita: '90',
        chip: 'sem_visita_90',
      }),
    )
    expect(screen.getByRole('textbox', { name: 'Buscar empresas' })).toHaveValue('aurora')
    expect(await screen.findByText('2 empresas com estes filtros')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(historico.location.search).toBe('?chip=sem_visita_90'))
    expect(screen.getByRole('textbox', { name: 'Buscar empresas' })).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  it('valores estranhos na URL são ignorados', async () => {
    const s = servicos()
    renderizar(s.s, '/empresas?chip=outro&ultimaVisita=7&cidade=abc&pagina=-3')
    await screen.findByRole('heading', { name: 'Empresas' })
    await waitFor(() =>
      expect(ultimaConsulta(s)).toMatchObject({ chip: 'todas', pagina: 1, porPagina: 25 }),
    )
    expect(ultimaConsulta(s)['ultimaVisita']).toBeUndefined()
    expect(ultimaConsulta(s)['municipio']).toBeUndefined()
  })
})

describe('Empresas: estados', () => {
  it('carregando: mostra o esqueleto', async () => {
    const s = servicos(() => new Promise(() => undefined))
    renderizar(s.s, '/empresas')
    expect(
      await screen.findByRole('status', { name: 'Carregando as empresas' }),
    ).toBeInTheDocument()
  })

  it('erro: mostra o motivo e "Tentar de novo" recarrega', async () => {
    const s = servicos()
    s.carteira.listar
      .mockResolvedValueOnce(falha('x', 'Servidor fora do ar.', 503))
      .mockResolvedValue(ok(lista([item(1)])))
    await abrir(s)
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor fora do ar.')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Empresa 1')).toBeInTheDocument()
  })

  it('carteira vazia: convida a cadastrar a primeira empresa', async () => {
    const s = servicos(lista([]), {
      contagens: { todas: 0, minha: 0, semVisita90: 0, nuncaVisitadas: 0, semProximaAtividade: 0 },
    })
    const { historico } = await abrir(s)
    expect(
      await screen.findByRole('heading', { name: 'Sua carteira está vazia' }),
    ).toBeInTheDocument()
    const botoes = screen.getAllByRole('button', { name: 'Nova empresa' })
    await userEvent.click(botoes[botoes.length - 1] as HTMLElement)
    await waitFor(() => expect(historico.location.pathname).toBe('/empresas/nova'))
  })

  it('filtros sem resultado: "Nenhuma empresa com esses filtros" e Limpar filtros', async () => {
    const s = servicos(lista([]))
    renderizar(s.s, '/empresas?busca=zzz')
    expect(
      await screen.findByRole('heading', { name: 'Nenhuma empresa com esses filtros' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Limpar filtros' })).toHaveLength(2)
  })

  it('pagina: mostra "Página X de Y" e Próxima pede a página seguinte', async () => {
    const s = servicos(lista([item(1), item(2)], { total: 60, pagina: 1, porPagina: 25 }))
    const { historico } = await abrir(s)
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    await waitFor(() => expect(ultimaConsulta(s)['pagina']).toBe(2))
    expect(historico.location.search).toContain('pagina=2')
  })

  it('clicar na linha abre a ficha da empresa', async () => {
    const s = servicos()
    const { historico } = await abrir(s)
    await userEvent.click(await screen.findByText('Empresa 2'))
    await waitFor(() => expect(historico.location.pathname).toBe(`/empresas/${id(102)}`))
  })
})

describe('Empresas: no celular', () => {
  it('mostra cartões com Ligar, WhatsApp e Rota; sem telefone ou endereço, desativados', async () => {
    largura(390)
    const s = servicos(
      lista([
        item(1),
        item(2, { telefone: null, enderecoParaRota: null, ultimaVisitaEm: null, cidade: null }),
      ]),
    )
    renderizar(s.s, '/empresas')
    const cartao1 = await screen.findByRole('article', { name: 'Empresa 1' })
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(cartao1).getByRole('link', { name: 'Ligar' })).toHaveAttribute(
      'href',
      'tel:+552730643021',
    )
    expect(within(cartao1).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/552730643021',
    )
    expect(within(cartao1).getByRole('link', { name: 'Rota' }).getAttribute('href')).toContain(
      'google.com/maps/dir/?api=1&destination=RUA%20DAS%20FLORES',
    )
    expect(within(cartao1).getByText('Cliente')).toBeInTheDocument()
    expect(within(cartao1).getByText('Retrofit')).toBeInTheDocument()
    expect(within(cartao1).getByText(/Última visita há 120 dias/)).toBeInTheDocument()

    const cartao2 = screen.getByRole('article', { name: 'Empresa 2' })
    expect(within(cartao2).getByText('Nunca visitada')).toBeInTheDocument()
    for (const nome of ['Ligar', 'WhatsApp', 'Rota']) {
      expect(within(cartao2).getByRole('link', { name: nome })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    }
  })

  it('os filtros ficam atrás do botão "Filtros · N"', async () => {
    largura(390)
    const s = servicos()
    renderizar(s.s, `/empresas?status=${id(13)}`)
    await screen.findByRole('article', { name: 'Empresa 1' })
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Filtros · 1' }))
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(id(13))
  })
})
