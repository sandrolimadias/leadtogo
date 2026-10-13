import type {
  ConsultaDaReceitaDaEmpresa,
  EmpresaCarteira,
  HistoricoDaEmpresa,
  OpcoesDaLista,
  TagGrupo,
} from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const me = meDeAdmin({
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

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000 - 3_600_000).toISOString()

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
    selecao: 'multipla',
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
  {
    id: id(3),
    nome: 'Interesse',
    selecao: 'multipla',
    obrigatorio: false,
    sistema: false,
    automatico: false,
    ativo: true,
    ordem: 2,
    tags: [
      {
        id: id(31),
        tagGrupoId: id(3),
        nome: 'Retrofit',
        cor: 'blue',
        ativo: true,
        ordem: 0,
        chaveSistema: null,
      },
      {
        id: id(32),
        tagGrupoId: id(3),
        nome: 'Monitoramento',
        cor: 'indigo',
        ativo: true,
        ordem: 1,
        chaveSistema: null,
      },
    ],
  },
]

const empresa = (extra: Partial<EmpresaCarteira> = {}): EmpresaCarteira => ({
  id: id(100),
  tipoDocumento: 'cnpj',
  documento: '11222333000181',
  matrizFilial: 'matriz',
  matriz: null,
  filiais: [],
  razaoSocial: 'JACARAIPE USINAGEM DE PRECISAO LTDA',
  nomeFantasia: 'Jacaraípe Usinagem',
  nome: 'Jacaraípe Usinagem',
  mei: false,
  dataInicioAtividades: '2015-06-19',
  porte: { codigo: 1, descricao: 'Micro Empresa' },
  regimeTributario: 'simples_nacional',
  vendedor: { id: id(900), nome: 'Alessandro Dias' },
  vertical: { id: id(21), nome: 'Metalmecânica', cor: 'blue' },
  website: 'jacaraipe.com.br',
  endereco: {
    cep: '29175588',
    tipoLogradouro: 'RUA',
    logradouro: 'PONTA DOS FACHOS',
    numero: '240',
    complemento: 'GALPAO B',
    bairro: 'JACARAIPE',
    municipio: { codigoIbge: 3205002, nome: 'SERRA', uf: 'ES' },
    paisCodigo: null,
  },
  observacoes: 'Indicação do Zé. Visitar de manhã.',
  origemCadastro: 'receita',
  telefones: [
    {
      id: id(301),
      numero: '2732431907',
      e164: '+552732431907',
      tipo: 'fixo',
      descricao: null,
      principal: true,
    },
    {
      id: id(302),
      numero: '27998472210',
      e164: '+5527998472210',
      tipo: 'whatsapp',
      descricao: null,
      principal: false,
    },
  ],
  cnaes: [
    { codigo: 2539001, descricao: 'Serviços de usinagem, tornearia e solda', principal: true },
    { codigo: 2543800, descricao: 'Fabricação de ferramentas', principal: false },
  ],
  socios: [{ id: id(401), nome: 'ROGERIO BINDACO', qualificacao: 'Sócio-Administrador' }],
  tags: [
    { id: id(13), nome: 'Cliente', cor: 'green', tagGrupoId: id(1), automatica: false },
    { id: id(31), nome: 'Retrofit', cor: 'blue', tagGrupoId: id(3), automatica: false },
  ],
  receita: {
    situacao: 'ATIVA',
    motivo: null,
    ativa: true,
    desde: '2015-06-19',
    consultadoEm: '2026-09-12T12:00:00.000Z',
  },
  situacaoNaoVerificada: false,
  receitaAtualizadoEm: '2026-09-12T12:00:00.000Z',
  ultimaVisitaEm: null,
  ultimoContatoEm: null,
  proximaAtividadeEm: null,
  criadoEm: '2026-08-01T12:00:00.000Z',
  atualizadoEm: '2026-09-12T12:00:00.000Z',
  permissoes: { editar: true, excluir: true, transferir: true },
  ...extra,
})

const opcoes = (extra: Partial<OpcoesDaLista> = {}): OpcoesDaLista => ({
  vendedores: [
    { id: id(900), nome: 'Alessandro Dias' },
    { id: id(901), nome: 'Bia Lima' },
  ],
  unicoMembro: false,
  cidades: [],
  diasAlertaDeContato: 60,
  ...extra,
})

const historico = (extra: Partial<HistoricoDaEmpresa> = {}): HistoricoDaEmpresa => ({
  itens: [
    {
      id: 'a2',
      em: '2026-09-12T12:30:00.000Z',
      por: { id: id(900), nome: 'Alessandro Dias' },
      automatica: false,
      titulo: 'Dados alterados',
      mudancas: [{ campo: 'website', rotulo: 'Website', de: null, para: 'jacaraipe.com.br' }],
    },
    {
      id: 'a1',
      em: '2026-08-01T12:00:00.000Z',
      por: { id: null, nome: 'Sistema' },
      automatica: true,
      titulo: 'Tag Visitada aplicada pelo sistema',
      mudancas: [],
    },
  ],
  total: 2,
  pagina: 1,
  porPagina: 20,
  ...extra,
})

function servicos(
  carteira: Record<string, unknown> = {},
  dados: EmpresaCarteira = empresa(),
  op: OpcoesDaLista = opcoes(),
) {
  const c = {
    detalhar: vi.fn(async (_id: string) => ok(dados)),
    historico: vi.fn(async (_id: string, _pagina: number) => ok(historico())),
    opcoes: vi.fn(async () => ok(op)),
    consultarReceitaDaEmpresa: vi.fn(async (_id: string) => falha('x', 'Não configurado.', 500)),
    aplicarReceitaDaEmpresa: vi.fn(async (_id: string) => ok(dados)),
    definirTags: vi.fn(async (_id: string, _tagIds: string[]) => ok(dados)),
    ...carteira,
  }
  const base = servicosFalsos()
  const s = servicosFalsos({
    me: async () => me,
    carteira: { ...base.carteira, ...c },
    tags: { ...base.tags, listar: vi.fn(async () => ok(grupos)) },
  })
  return { s, c: c as typeof c & Record<string, ReturnType<typeof vi.fn>> }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, `/empresas/${id(100)}`)
  await screen.findByRole('heading', { name: 'Jacaraípe Usinagem' })
  return r
}

function largura(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}
afterEach(() => largura(1280))

describe('Ficha da empresa: cabeçalho', () => {
  it('mostra nome, Matriz, situação na Receita, razão social, CNPJ e as tags', async () => {
    await abrir(servicos())
    const cabecalho = screen
      .getByRole('heading', { name: 'Jacaraípe Usinagem' })
      .closest('header') as HTMLElement
    expect(within(cabecalho).getByText('Matriz')).toBeInTheDocument()
    expect(within(cabecalho).getByText('Ativa na Receita')).toBeInTheDocument()
    expect(within(cabecalho).getByText('JACARAIPE USINAGEM DE PRECISAO LTDA')).toBeInTheDocument()
    expect(within(cabecalho).getByText('11.222.333/0001-81')).toBeInTheDocument()
    expect(within(cabecalho).getByText('Cliente')).toBeInTheDocument()
    expect(within(cabecalho).getByText('Retrofit')).toBeInTheDocument()
    expect(within(cabecalho).getByRole('button', { name: 'Editar tags' })).toBeInTheDocument()
    expect(within(cabecalho).getByRole('link', { name: 'Ligar' })).toHaveAttribute(
      'href',
      'tel:+552732431907',
    )
    expect(within(cabecalho).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/552732431907',
    )
  })

  it('o que é dos módulos seguintes fica escondido: abas, botões e "chega no Módulo X"', async () => {
    await abrir(servicos())
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumo', 'Histórico'])
    for (const nome of ['Nova atividade', 'Nova oportunidade', 'Vincular contato']) {
      expect(screen.queryByRole('button', { name: nome })).toBeNull()
    }
    expect(screen.queryByText(/Módulo \d/)).toBeNull()
  })

  it('faixa de resumo: Vendedor, Vertical, e "Nunca"/"—" para visita, contato e próxima atividade', async () => {
    await abrir(servicos())
    expect(await screen.findByText('Vendedor')).toBeInTheDocument()
    const faixa = screen.getByText('Vertical').parentElement?.parentElement as HTMLElement
    expect(within(faixa).getByText('Alessandro Dias')).toBeInTheDocument()
    expect(within(faixa).getByText('Metalmecânica')).toBeInTheDocument()
    expect(within(faixa).getAllByText('Nunca')).toHaveLength(2)
    expect(within(faixa).getByText('Próxima atividade').nextSibling).toHaveTextContent('—')
  })

  it('com datas: mostra a data e "há N dias"', async () => {
    await abrir(
      servicos({}, empresa({ ultimaVisitaEm: diasAtras(40), ultimoContatoEm: diasAtras(3) })),
    )
    expect(screen.getByText('há 40 dias')).toBeInTheDocument()
    expect(screen.getByText('há 3 dias')).toBeInTheDocument()
  })

  it('equipe de uma pessoa só: o Vendedor some da faixa', async () => {
    await abrir(servicos({}, empresa(), opcoes({ unicoMembro: true })))
    expect(await screen.findByText('Vertical')).toBeInTheDocument()
    expect(screen.queryByText('Vendedor')).toBeNull()
  })

  it('empresa não ativa na Receita e "situação não verificada" ficam à vista', async () => {
    await abrir(
      servicos(
        {},
        empresa({
          receita: {
            situacao: 'BAIXADA',
            motivo: 'EXTINCAO',
            ativa: false,
            desde: '2020-01-01',
            consultadoEm: '2026-09-12T12:00:00.000Z',
          },
          situacaoNaoVerificada: true,
        }),
      ),
    )
    expect(screen.getByText('BAIXADA na Receita')).toBeInTheDocument()
    expect(screen.getByText('Situação não verificada')).toBeInTheDocument()
  })

  it('sem telefone, Ligar e WhatsApp ficam desativados', async () => {
    await abrir(servicos({}, empresa({ telefones: [] })))
    expect(screen.getByRole('link', { name: 'Ligar' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('Ficha da empresa: aba Resumo', () => {
  it('Dados cadastrais traz tudo o que o cadastro guarda', async () => {
    await abrir(servicos())
    const dados = screen.getByRole('region', { name: 'Dados cadastrais' })
    const campo = (rotulo: string) => within(dados).getByText(rotulo).nextSibling as HTMLElement
    expect(campo('Razão social')).toHaveTextContent('JACARAIPE USINAGEM DE PRECISAO LTDA')
    expect(campo('Nome fantasia')).toHaveTextContent('Jacaraípe Usinagem')
    expect(campo('CNPJ')).toHaveTextContent('11.222.333/0001-81')
    expect(campo('Matriz ou filial')).toHaveTextContent('Matriz')
    expect(campo('Início das atividades')).toHaveTextContent('19/06/2015')
    expect(campo('Porte')).toHaveTextContent('Micro Empresa')
    expect(campo('Regime tributário')).toHaveTextContent('Simples Nacional')
    expect(campo('MEI')).toHaveTextContent('Não')
    expect(campo('Endereço')).toHaveTextContent('RUA PONTA DOS FACHOS, 240 – GALPAO B, JACARAIPE')
    expect(campo('Cidade')).toHaveTextContent('SERRA/ES')
    expect(campo('CEP')).toHaveTextContent('29175-588')
    expect(campo('Telefones')).toHaveTextContent('(27) 3243-1907')
    expect(campo('Telefones')).toHaveTextContent('(27) 99847-2210')
    expect(campo('Telefones')).toHaveTextContent('WhatsApp')
    expect(within(dados).getByRole('link', { name: 'jacaraipe.com.br' })).toHaveAttribute(
      'href',
      'https://jacaraipe.com.br',
    )
    expect(campo('Origem do cadastro')).toHaveTextContent('Consulta à Receita')
    expect(within(dados).getByText('Receita em 12/09/2026')).toBeInTheDocument()
    expect(within(dados).queryByText(/Funcionários|Faturamento|personalizad/i)).toBeNull()
  })

  it('CNAEs com o principal marcado, Sócios sem "Converter em contato" e Observações', async () => {
    await abrir(servicos())
    const cnaes = screen.getByRole('region', { name: 'CNAEs' })
    expect(within(cnaes).getByText('2539-0/01')).toBeInTheDocument()
    expect(within(cnaes).getByText('Serviços de usinagem, tornearia e solda')).toBeInTheDocument()
    expect(within(cnaes).getAllByText('Principal')).toHaveLength(1)
    const socios = screen.getByRole('region', { name: 'Sócios' })
    expect(within(socios).getByText('ROGERIO BINDACO')).toBeInTheDocument()
    expect(within(socios).getByText('Sócio-Administrador')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Converter em contato/ })).toBeNull()
    expect(
      within(screen.getByRole('region', { name: 'Observações' })).getByText(/Indicação do Zé/),
    ).toBeInTheDocument()
  })

  it('filial: aponta para a matriz; matriz: lista as filiais cadastradas', async () => {
    const filial = servicos(
      {},
      empresa({ matrizFilial: 'filial', matriz: { id: id(200), nome: 'Jacaraípe Matriz' } }),
    )
    const { unmount, historico: h1 } = await abrir(filial)
    const link = within(screen.getByRole('region', { name: 'Dados cadastrais' })).getByRole(
      'link',
      { name: 'Jacaraípe Matriz' },
    )
    await userEvent.click(link)
    await waitFor(() => expect(h1.location.pathname).toBe(`/empresas/${id(200)}`))
    unmount()

    const matriz = servicos(
      {},
      empresa({
        filiais: [{ id: id(201), nome: 'Filial Vila Velha', documento: '11222333000262' }],
      }),
    )
    await abrir(matriz)
    const dados = screen.getByRole('region', { name: 'Dados cadastrais' })
    expect(within(dados).getByRole('link', { name: 'Filial Vila Velha' })).toBeInTheDocument()
    expect(within(dados).getByText('11.222.333/0002-62')).toBeInTheDocument()
  })

  it('CPF e sem documento: sem situação na Receita e sem "Atualizar pela Receita"', async () => {
    await abrir(
      servicos(
        {},
        empresa({
          tipoDocumento: 'cpf',
          documento: '52998224725',
          matrizFilial: null,
          receita: null,
          receitaAtualizadoEm: null,
        }),
      ),
    )
    expect(screen.getAllByText('529.982.247-25').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Atualizar pela Receita' })).toBeNull()
    expect(screen.queryByText(/na Receita$/)).toBeNull()
  })

  it('sem documento: o campo se chama "Documento" e diz que não há', async () => {
    await abrir(
      servicos(
        {},
        empresa({
          tipoDocumento: 'nenhum',
          documento: null,
          matrizFilial: null,
          receita: null,
          cnaes: [],
        }),
      ),
    )
    const dados = screen.getByRole('region', { name: 'Dados cadastrais' })
    expect(within(dados).getByText('Documento').nextSibling).toHaveTextContent('Sem documento')
    expect(within(dados).queryByText('CNPJ')).toBeNull()
    expect(screen.getByText('Nenhum CNAE informado.')).toBeInTheDocument()
  })

  it('sem permissão de editar: nem "Editar tags" nem "Atualizar pela Receita"', async () => {
    await abrir(
      servicos({}, empresa({ permissoes: { editar: false, excluir: false, transferir: false } })),
    )
    expect(screen.queryByRole('button', { name: 'Editar tags' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Atualizar pela Receita' })).toBeNull()
  })
})

describe('Ficha da empresa: estados', () => {
  it('carregando mostra o esqueleto', async () => {
    const x = servicos({ detalhar: vi.fn(() => new Promise(() => undefined)) })
    renderizar(x.s, `/empresas/${id(100)}`)
    expect(await screen.findByRole('status', { name: 'Carregando a empresa' })).toBeInTheDocument()
  })

  it('empresa que não existe ou que a pessoa não vê: "Empresa não encontrada" e volta para a lista', async () => {
    const x = servicos({
      detalhar: vi.fn(async () => falha('empresa_nao_encontrada', 'Empresa não encontrada.', 404)),
    })
    const { historico: h } = renderizar(x.s, `/empresas/${id(100)}`)
    expect(
      await screen.findByRole('heading', { name: 'Empresa não encontrada' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para Empresas' }))
    await waitFor(() => expect(h.location.pathname).toBe('/empresas'))
  })

  it('erro de rede: mostra o motivo e "Tentar de novo" recarrega', async () => {
    const detalhar = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Sem conexão.', 0))
      .mockResolvedValue(ok(empresa()))
    renderizar(servicos({ detalhar }).s, `/empresas/${id(100)}`)
    expect(await screen.findByText('Sem conexão.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Jacaraípe Usinagem' })).toBeInTheDocument()
  })
})

describe('Ficha da empresa: aba Histórico', () => {
  it('mostra a auditoria em português, com quem fez e quando; o sistema aparece como "Sistema"', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    const lista = await screen.findByRole('list', { name: 'Histórico da empresa' })
    expect(within(lista).getByText('Dados alterados')).toBeInTheDocument()
    expect(within(lista).getByText('jacaraipe.com.br')).toBeInTheDocument()
    expect(within(lista).getByText(/· Alessandro Dias$/)).toBeInTheDocument()
    expect(within(lista).getByText('Tag Visitada aplicada pelo sistema')).toBeInTheDocument()
    expect(within(lista).getByText(/· Sistema$/)).toBeInTheDocument()
    expect(x.c.historico).toHaveBeenCalledWith(id(100), 1)
  })

  it('"Carregar mais" traz a próxima página', async () => {
    const historicoFn = vi
      .fn()
      .mockResolvedValueOnce(ok(historico({ total: 3, porPagina: 2 })))
      .mockResolvedValueOnce(
        ok(
          historico({
            total: 3,
            porPagina: 2,
            pagina: 2,
            itens: [
              {
                id: 'a0',
                em: '2026-07-01T12:00:00.000Z',
                por: { id: id(900), nome: 'Alessandro Dias' },
                automatica: false,
                titulo: 'Empresa cadastrada',
                mudancas: [],
              },
            ],
          }),
        ),
      )
    const x = servicos({ historico: historicoFn })
    await abrir(x)
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Empresa cadastrada')).toBeInTheDocument()
    expect(historicoFn).toHaveBeenLastCalledWith(id(100), 2)
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('histórico vazio: diz que ainda não há nada', async () => {
    const x = servicos({ historico: vi.fn(async () => ok(historico({ itens: [], total: 0 }))) })
    await abrir(x)
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    expect(await screen.findByText('Nada no histórico ainda')).toBeInTheDocument()
  })
})

describe('Ficha da empresa: Atualizar pela Receita', () => {
  const comparacao = (
    extra: Partial<ConsultaDaReceitaDaEmpresa> = {},
  ): ConsultaDaReceitaDaEmpresa => ({
    consultadoEm: '2026-10-13T12:00:00.000Z',
    fonte: 'minhareceita',
    situacao: { descricao: 'ATIVA', motivo: null, ativa: true, desde: '2015-06-19' },
    situacaoAnterior: 'ATIVA',
    mudancas: [
      {
        chave: 'razaoSocial',
        rotulo: 'Razão social',
        atual: 'JACARAIPE LTDA',
        receita: 'JACARAIPE S/A',
      },
      { chave: 'endereco', rotulo: 'Endereço', atual: 'RUA A, 1', receita: 'RUA B, 2' },
    ],
    ...extra,
  })

  it('mostra o que mudou (atual × Receita) e "Aplicar alterações" grava e avisa', async () => {
    const x = servicos({ consultarReceitaDaEmpresa: vi.fn(async () => ok(comparacao())) })
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar pela Receita' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Atualizar pela Receita' })
    expect(within(dialogo).getByText('A Receita tem 2 valores diferentes')).toBeInTheDocument()
    expect(within(dialogo).getByText('JACARAIPE LTDA')).toBeInTheDocument()
    expect(within(dialogo).getByText('JACARAIPE S/A')).toBeInTheDocument()
    expect(within(dialogo).getByText('Situação: ATIVA')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Aplicar alterações' }))
    await waitFor(() => expect(x.c.aplicarReceitaDaEmpresa).toHaveBeenCalledWith(id(100)))
    expect(await screen.findByText('Dados atualizados pela Receita')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('"Manter como está" fecha sem aplicar nada', async () => {
    const x = servicos({ consultarReceitaDaEmpresa: vi.fn(async () => ok(comparacao())) })
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar pela Receita' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Atualizar pela Receita' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Manter como está' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(x.c.aplicarReceitaDaEmpresa).not.toHaveBeenCalled()
  })

  it('sem diferenças: diz que já está igual e não oferece aplicar', async () => {
    const x = servicos({
      consultarReceitaDaEmpresa: vi.fn(async () => ok(comparacao({ mudancas: [] }))),
    })
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar pela Receita' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Atualizar pela Receita' })
    expect(within(dialogo).getByText('O cadastro já está igual à Receita')).toBeInTheDocument()
    expect(within(dialogo).queryByRole('button', { name: 'Aplicar alterações' })).toBeNull()
  })

  it('empresa que deixou de ser ativa: avisa a nova situação e que continua na carteira', async () => {
    const x = servicos({
      consultarReceitaDaEmpresa: vi.fn(async () =>
        ok(
          comparacao({
            situacao: {
              descricao: 'BAIXADA',
              motivo: 'EXTINCAO',
              ativa: false,
              desde: '2026-10-01',
            },
            situacaoAnterior: 'ATIVA',
            mudancas: [],
          }),
        ),
      ),
    })
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar pela Receita' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Atualizar pela Receita' })
    expect(within(dialogo).getByText(/Situação: BAIXADA desde 01\/10\/2026/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/continua na carteira/)).toBeInTheDocument()
  })

  it('mostra "Consultando Receita…" enquanto espera; Receita fora do ar vira aviso', async () => {
    let soltar: (v: unknown) => void = () => undefined
    const x = servicos({
      consultarReceitaDaEmpresa: vi.fn(() => new Promise((r) => (soltar = r))),
    })
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar pela Receita' }))
    expect(await screen.findByRole('button', { name: 'Consultando Receita…' })).toBeDisabled()
    soltar(falha('receita_indisponivel', 'Não foi possível consultar a Receita agora.', 503))
    expect(await screen.findByText('Não foi possível consultar a Receita')).toBeInTheDocument()
    expect(screen.getByText('Não foi possível consultar a Receita agora.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('erro ao aplicar fica no diálogo, que continua aberto', async () => {
    const x = servicos({
      consultarReceitaDaEmpresa: vi.fn(async () => ok(comparacao())),
      aplicarReceitaDaEmpresa: vi.fn(async () => falha('x', 'Servidor fora do ar.', 503)),
    })
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar pela Receita' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Atualizar pela Receita' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Aplicar alterações' }))
    expect(await within(dialogo).findByText('Servidor fora do ar.')).toBeInTheDocument()
  })
})

describe('Ficha da empresa: Editar tags', () => {
  const abrirTags = async (x: ReturnType<typeof servicos>) => {
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Editar tags' }))
    return screen.findByRole('dialog', { name: 'Editar tags' })
  }

  it('mostra os grupos manuais com o que a empresa já tem; a Visitação (do sistema) não aparece', async () => {
    const dialogo = await abrirTags(servicos())
    const status = within(dialogo).getByRole('group', { name: /Status/ })
    expect(within(status).getByRole('radio', { name: 'Cliente' })).toBeChecked()
    expect(within(status).getByRole('radio', { name: 'Lead' })).not.toBeChecked()
    expect(within(status).queryByRole('radio', { name: 'Nenhuma' })).toBeNull() // Status é obrigatório
    const interesse = within(dialogo).getByRole('group', { name: /Interesse/ })
    expect(within(interesse).getByRole('checkbox', { name: 'Retrofit' })).toBeChecked()
    expect(within(interesse).getByRole('checkbox', { name: 'Monitoramento' })).not.toBeChecked()
    expect(within(dialogo).queryByText('Visitação')).toBeNull()
  })

  it('troca o Status, junta uma tag e salva só com os ids dos grupos manuais', async () => {
    const x = servicos()
    const dialogo = await abrirTags(x)
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Prospect' }))
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Monitoramento' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar tags' }))
    await waitFor(() => expect(x.c.definirTags).toHaveBeenCalledTimes(1))
    const [chamadaId, ids] = x.c.definirTags.mock.calls[0] as [string, string[]]
    expect(chamadaId).toBe(id(100))
    expect([...ids].sort()).toEqual([id(12), id(31), id(32)].sort())
    expect(await screen.findByText('Tags salvas')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('o erro da API aparece no diálogo, que continua aberto', async () => {
    const x = servicos({
      definirTags: vi.fn(async () => falha('tag_inativa', 'A tag "Retrofit" está inativa.', 400)),
    })
    const dialogo = await abrirTags(x)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar tags' }))
    expect(await within(dialogo).findByText('A tag "Retrofit" está inativa.')).toBeInTheDocument()
  })
})

describe('Ficha da empresa: no celular', () => {
  it('traz Ligar, WhatsApp e Rota em botões grandes, sem o caminho de volta nem o "Atividade"', async () => {
    largura(390)
    const x = servicos()
    renderizar(x.s, `/empresas/${id(100)}`)
    await screen.findByRole('heading', { name: 'Jacaraípe Usinagem' })
    const botoes = screen
      .getAllByRole('link')
      .filter((l) => ['Ligar', 'WhatsApp', 'Rota'].includes(l.textContent ?? ''))
    expect(botoes.map((b) => b.textContent)).toEqual(['Ligar', 'WhatsApp', 'Rota'])
    expect(botoes[2]?.getAttribute('href')).toContain(
      'google.com/maps/dir/?api=1&destination=RUA%20PONTA',
    )
    expect(screen.queryByRole('navigation', { name: 'Você está em' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Atividade/ })).toBeNull()
  })
})

describe('Ficha da empresa: Mais ações (editar e excluir)', () => {
  const abrirMenu = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Mais ações' }))
    return screen.findByRole('menu')
  }

  it('administrador e gestor: Editar e Excluir; Editar abre a tela de edição', async () => {
    const x = servicos()
    const { historico: h } = await abrir(x)
    const menu = await abrirMenu()
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Editar', 'Excluir'])
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }))
    await waitFor(() => expect(h.location.pathname).toBe(`/empresas/${id(100)}/editar`))
  })

  it('vendedor na própria empresa: só Editar (excluir é de gestor e administrador)', async () => {
    await abrir(
      servicos({}, empresa({ permissoes: { editar: true, excluir: false, transferir: false } })),
    )
    const menu = await abrirMenu()
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Editar'])
  })

  it('só vendo a empresa de outro vendedor: sem menu de ações', async () => {
    await abrir(
      servicos({}, empresa({ permissoes: { editar: false, excluir: false, transferir: false } })),
    )
    expect(screen.queryByRole('button', { name: 'Mais ações' })).toBeNull()
  })

  it('Excluir pede confirmação, exclui, avisa e volta para a lista', async () => {
    const excluir = vi.fn(async (_id: string) => ok(undefined))
    const x = servicos({ excluir })
    const { historico: h } = await abrir(x)
    const menu = await abrirMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir esta empresa?' })
    expect(within(dialogo).getByText(/não há lixeira/)).toBeInTheDocument()
    expect(excluir).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir empresa' }))
    await waitFor(() => expect(excluir).toHaveBeenCalledWith(id(100)))
    expect(await screen.findByText('Empresa excluída')).toBeInTheDocument()
    await waitFor(() => expect(h.location.pathname).toBe('/empresas'))
  })

  it('"Voltar" na confirmação não exclui nada', async () => {
    const excluir = vi.fn(async (_id: string) => ok(undefined))
    await abrir(servicos({ excluir }))
    const menu = await abrirMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir esta empresa?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(excluir).not.toHaveBeenCalled()
  })

  it('erro ao excluir: mostra o motivo no diálogo e continua na ficha', async () => {
    const excluir = vi.fn(async (_id: string) =>
      falha('acesso_negado', 'Só gestor e administrador excluem empresas.', 403),
    )
    const { historico: h } = await abrir(servicos({ excluir }))
    const menu = await abrirMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir esta empresa?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir empresa' }))
    expect(
      await within(dialogo).findByText('Só gestor e administrador excluem empresas.'),
    ).toBeInTheDocument()
    expect(h.location.pathname).toBe(`/empresas/${id(100)}`)
  })
})
