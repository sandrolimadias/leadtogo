import type {
  ConsultaReceita,
  EmpresaCarteira,
  ListaDeEmpresas,
  OpcoesDaLista,
  TagGrupo,
  Vertical,
} from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const CNPJ = '11222333000181'
const CNPJ_COM_MASCARA = '11.222.333/0001-81'

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
]
const verticais: Vertical[] = [
  { id: id(21), nome: 'Metalmecânica', cor: 'blue', ativo: true, ordem: 0 },
  { id: id(22), nome: 'Alimentos', cor: 'green', ativo: false, ordem: 1 },
]

function receita(
  extra: Partial<ConsultaReceita['dados']['situacao']> = {},
  raiz: Partial<ConsultaReceita> = {},
): ConsultaReceita {
  return {
    dados: {
      cnpj: CNPJ,
      razaoSocial: 'JACARAIPE USINAGEM DE PRECISAO LTDA',
      nomeFantasia: 'JACARAIPE USINAGEM',
      matrizFilial: 'matriz',
      situacao: {
        codigo: 2,
        descricao: 'ATIVA',
        motivo: null,
        desde: '2015-06-19',
        ativa: true,
        ...extra,
      },
      mei: false,
      regimeTributario: 'simples_nacional',
      porteCodigo: 1,
      dataInicioAtividades: '2015-06-19',
      endereco: {
        cep: '29175588',
        tipoLogradouro: 'RUA',
        logradouro: 'PONTA DOS FACHOS',
        numero: '240',
        complemento: 'GALPAO B',
        bairro: 'JACARAIPE',
        municipioCodigoIbge: 3205002,
        municipioNome: 'SERRA',
        uf: 'ES',
        paisCodigo: null,
      },
      telefones: [
        { numero: '2732431907', e164: '+552732431907', tipo: 'fixo' },
        { numero: '27998472210', e164: '+5527998472210', tipo: 'celular' },
      ],
      cnaes: {
        principal: { codigo: 2539001, descricao: 'Serviços de usinagem, tornearia e solda' },
        secundarios: [{ codigo: 2543800, descricao: 'Fabricação de ferramentas' }],
      },
      socios: [
        {
          nome: 'ROGERIO BINDACO',
          qualificacaoCodigo: 49,
          qualificacaoTexto: 'Sócio-Administrador',
        },
      ],
    },
    fonte: 'minhareceita',
    consultadoEm: '2026-10-13T12:00:00.000Z',
    doCache: false,
    expirada: false,
    cadastroBloqueado: false,
    ...raiz,
  }
}

const criada = { id: id(500), nome: 'JACARAIPE USINAGEM' } as EmpresaCarteira
const vazia: ListaDeEmpresas = { itens: [], total: 0, pagina: 1, porPagina: 25 }
const opcoes = (extra: Partial<OpcoesDaLista> = {}): OpcoesDaLista => ({
  vendedores: [
    { id: id(900), nome: 'Ana Souza' },
    { id: id(901), nome: 'Bia Lima' },
  ],
  unicoMembro: false,
  cidades: [],
  diasAlertaDeContato: 60,
  ...extra,
})

function servicos(
  carteira: Record<string, unknown> = {},
  papel: 'admin' | 'gestor' | 'vendedor' = 'admin',
) {
  const c = {
    listar: vi.fn(async () => ok(vazia)),
    contagens: vi.fn(async () =>
      ok({ todas: 0, minha: 0, semVisita90: 0, nuncaVisitadas: 0, semProximaAtividade: 0 }),
    ),
    opcoes: vi.fn(async () => ok(opcoes())),
    consultarCnpj: vi.fn(async () => ok(receita())),
    criar: vi.fn(async () => ok(criada)),
    ...carteira,
  }
  const base = servicosFalsos()
  const s = servicosFalsos({
    me: async () => me(papel),
    carteira: c,
    tags: { ...base.tags, listar: vi.fn(async () => ok(grupos)) },
    cadastros: {
      ...base.cadastros,
      verticais: { ...base.cadastros.verticais, listar: vi.fn(async () => ok(verticais)) },
    },
  })
  return { s, c: c as typeof c & Record<string, ReturnType<typeof vi.fn>> }
}

/** O aviso (role alert) que tem este título. */
const alerta = async (titulo: string) => {
  const t = await screen.findByText(titulo)
  return t.closest('[role="alert"], [role="status"]') as HTMLElement
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, '/empresas/nova')
  await screen.findByRole('heading', { name: 'Nova empresa' })
  return r
}
const consultar = async (cnpj = CNPJ_COM_MASCARA) => {
  await userEvent.type(screen.getByRole('textbox', { name: /CNPJ/ }), cnpj)
  await userEvent.click(screen.getByRole('button', { name: 'Consultar' }))
}
const corpoEnviado = (x: ReturnType<typeof servicos>) =>
  (x.c.criar.mock.calls.at(-1) as unknown[])[0] as Record<string, unknown>

function largura(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}
afterEach(() => largura(1280))

describe('Nova empresa: o documento', () => {
  it('começa só com o passo do documento e a consulta', async () => {
    await abrir(servicos())
    expect(screen.getByRole('group', { name: 'Tipo de documento' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conferir dados da Receita' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Salvar empresa' })).toBeNull()
  })

  it('a máscara aceita letras (CNPJ alfanumérico)', async () => {
    await abrir(servicos())
    const campo = screen.getByRole('textbox', { name: /CNPJ/ })
    await userEvent.type(campo, '12abc345000195')
    expect(campo).toHaveValue('12.ABC.345/0001-95')
  })

  it('menos de 14 caracteres: mostra como informar, sem consultar', async () => {
    const x = servicos()
    await abrir(x)
    await consultar('1122233')
    expect(
      await screen.findByText('Informe os 14 caracteres do CNPJ, como 12.424.587/0001-45.'),
    ).toBeInTheDocument()
    expect(x.c.consultarCnpj).not.toHaveBeenCalled()
  })

  it('dígitos que não conferem: CNPJ inválido, sem consultar', async () => {
    const x = servicos()
    await abrir(x)
    await consultar('11.222.333/0001-00')
    expect(await screen.findByText('CNPJ inválido. Confira os dígitos.')).toBeInTheDocument()
    expect(x.c.consultarCnpj).not.toHaveBeenCalled()
  })

  it('Enter no campo também consulta', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.type(
      screen.getByRole('textbox', { name: /CNPJ/ }),
      `${CNPJ_COM_MASCARA}{Enter}`,
    )
    await waitFor(() => expect(x.c.consultarCnpj).toHaveBeenCalledWith(CNPJ))
  })
})

describe('Nova empresa: empresa encontrada na Receita', () => {
  it('mostra a situação e preenche os dados, com telefones, sócios e CNAEs', async () => {
    const x = servicos()
    await abrir(x)
    await consultar()
    expect(await screen.findByText('Dados preenchidos pela Receita')).toBeInTheDocument()
    expect(screen.getByText(/Situação cadastral: Ativa desde 19\/06\/2015/)).toBeInTheDocument()
    const passo2 = screen.getByRole('region', { name: 'Conferir dados da Receita' })
    expect(within(passo2).getByText('Ativa')).toBeInTheDocument()
    expect(within(passo2).getByText('Matriz')).toBeInTheDocument()
    expect(within(passo2).getByRole('textbox', { name: /Razão social/ })).toHaveValue(
      'JACARAIPE USINAGEM DE PRECISAO LTDA',
    )
    expect(within(passo2).getByRole('textbox', { name: 'Nome fantasia' })).toHaveValue(
      'JACARAIPE USINAGEM',
    )
    expect(within(passo2).getByRole('textbox', { name: 'CEP' })).toHaveValue('29175-588')
    expect(within(passo2).getByRole('textbox', { name: 'Logradouro' })).toHaveValue(
      'PONTA DOS FACHOS',
    )
    expect(within(passo2).getByRole('textbox', { name: 'Cidade' })).toHaveValue('SERRA/ES')
    expect(within(passo2).getByRole('checkbox', { name: /\(27\) 3243-1907/ })).toBeChecked()
    expect(within(passo2).getByRole('checkbox', { name: /\(27\) 99847-2210/ })).toBeChecked()
    expect(within(passo2).getByText('ROGERIO BINDACO')).toBeInTheDocument()
    expect(within(passo2).getByText('2539-0/01')).toBeInTheDocument()
    expect(within(passo2).getByText('Principal')).toBeInTheDocument()
    expect(within(passo2).queryByText(/faturamento|funcionários/i)).toBeNull()
    expect(x.c.consultarCnpj).toHaveBeenCalledWith(CNPJ)
  })

  it('a carteira começa com Status Lead; Vertical lista só as ativas; o vendedor aparece para o administrador', async () => {
    await abrir(servicos())
    await consultar()
    const passo3 = await screen.findByRole('region', { name: 'Carteira' })
    expect(within(passo3).getByRole('combobox', { name: /Status/ })).toHaveValue(id(11))
    const vertical = within(passo3).getByRole('combobox', { name: 'Vertical' })
    expect(
      within(vertical)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Sem vertical', 'Metalmecânica'])
    const vendedor = within(passo3).getByRole('combobox', { name: /Vendedor/ })
    expect(
      within(vendedor)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Eu mesmo (padrão)', 'Ana Souza', 'Bia Lima'])
  })

  it('sem o campo Vendedor quando a equipe tem uma pessoa só, e para quem é vendedor', async () => {
    const um = servicos({ opcoes: vi.fn(async () => ok(opcoes({ unicoMembro: true }))) })
    const { unmount } = await abrir(um)
    await consultar()
    await screen.findByRole('region', { name: 'Carteira' })
    expect(screen.queryByRole('combobox', { name: /Vendedor/ })).toBeNull()
    unmount()

    await abrir(servicos({}, 'vendedor'))
    await consultar()
    await screen.findByRole('region', { name: 'Carteira' })
    expect(screen.queryByRole('combobox', { name: /Vendedor/ })).toBeNull()
  })

  it('salva com o que está na tela: CNPJ sem máscara, telefones marcados, WhatsApp, CNAEs e a carteira', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    await consultar()
    const passo2 = await screen.findByRole('region', { name: 'Conferir dados da Receita' })
    await userEvent.click(within(passo2).getByRole('checkbox', { name: /\(27\) 3243-1907/ })) // tira o fixo
    await userEvent.click(within(passo2).getByRole('checkbox', { name: 'Também é WhatsApp' }))
    await userEvent.clear(within(passo2).getByRole('textbox', { name: 'Nome fantasia' }))
    await userEvent.type(
      within(passo2).getByRole('textbox', { name: 'Nome fantasia' }),
      'Jacaraípe',
    )
    const passo3 = screen.getByRole('region', { name: 'Carteira' })
    await userEvent.selectOptions(
      within(passo3).getByRole('combobox', { name: 'Vertical' }),
      id(21),
    )
    await userEvent.selectOptions(
      within(passo3).getByRole('combobox', { name: /Vendedor/ }),
      id(901),
    )
    await userEvent.selectOptions(within(passo3).getByRole('combobox', { name: /Status/ }), id(12))
    await userEvent.type(
      within(passo3).getByRole('textbox', { name: 'Website' }),
      'jacaraipe.com.br',
    )
    await userEvent.type(
      within(passo3).getByRole('textbox', { name: 'Observações' }),
      'Indicação do Zé',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.criar).toHaveBeenCalledTimes(1))
    expect(corpoEnviado(x)).toMatchObject({
      tipoDocumento: 'cnpj',
      documento: CNPJ,
      razaoSocial: 'JACARAIPE USINAGEM DE PRECISAO LTDA',
      nomeFantasia: 'Jacaraípe',
      regimeTributario: 'simples_nacional',
      dataInicioAtividades: '2015-06-19',
      porteCodigo: 1,
      vendedorId: id(901),
      verticalId: id(21),
      statusTagId: id(12),
      website: 'jacaraipe.com.br',
      observacoes: 'Indicação do Zé',
      telefones: [{ numero: '27998472210', tipo: 'whatsapp' }],
      cnaes: { principal: 2539001, secundarios: [2543800] },
      endereco: {
        cep: '29175-588',
        tipoLogradouro: 'RUA',
        logradouro: 'PONTA DOS FACHOS',
        municipioCodigo: 3205002,
      },
    })
    await waitFor(() => expect(historico.location.pathname).toBe('/empresas'))
    expect(await screen.findByText('Empresa cadastrada')).toBeInTheDocument()
  })

  it('o Status padrão (Lead) e o vendedor padrão não vão no corpo quando ninguém mexeu', async () => {
    const x = servicos()
    await abrir(x)
    await consultar()
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.criar).toHaveBeenCalled())
    expect(corpoEnviado(x)['vendedorId']).toBeUndefined()
    expect(corpoEnviado(x)['statusTagId']).toBe(id(11))
  })

  it('telefone digitado à mão entra na lista; inválido e repetido mostram o motivo', async () => {
    const x = servicos()
    await abrir(x)
    await consultar()
    const campo = await screen.findByRole('textbox', { name: 'Novo telefone' })
    await userEvent.type(campo, '123{Enter}')
    expect(await screen.findByText(/Telefone inválido/)).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, '(27) 3243-1907{Enter}')
    expect(await screen.findByText('Este telefone já está na lista.')).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, '(27) 3064-3021{Enter}')
    expect(await screen.findByRole('checkbox', { name: /\(27\) 3064-3021/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.criar).toHaveBeenCalled())
    expect(corpoEnviado(x)['telefones']).toEqual([
      { numero: '2732431907', tipo: 'fixo' },
      { numero: '27998472210', tipo: 'celular' },
      { numero: '2730643021', tipo: 'fixo' },
    ])
  })

  it('o nome precisa ter ao menos 2 letras para salvar', async () => {
    await abrir(servicos())
    await consultar()
    const razao = await screen.findByRole('textbox', { name: /Razão social/ })
    await userEvent.clear(razao)
    expect(screen.getByRole('button', { name: 'Salvar empresa' })).toBeDisabled()
    await userEvent.type(razao, 'Jac')
    expect(screen.getByRole('button', { name: 'Salvar empresa' })).toBeEnabled()
  })

  it('mexer no CNPJ depois de consultar descarta os dados da consulta', async () => {
    await abrir(servicos())
    await consultar()
    await screen.findByRole('region', { name: 'Conferir dados da Receita' })
    await userEvent.type(screen.getByRole('textbox', { name: /CNPJ/ }), '1')
    expect(screen.queryByRole('region', { name: 'Conferir dados da Receita' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Salvar empresa' })).toBeNull()
  })

  it('erro ao salvar: mostra o motivo e mantém o que foi digitado', async () => {
    const x = servicos({
      criar: vi.fn(async () => falha('x', 'Não foi possível salvar agora.', 500)),
    })
    await abrir(x)
    await consultar()
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar empresa' }))
    expect(await screen.findByText('Não foi possível salvar agora.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Razão social/ })).toHaveValue(
      'JACARAIPE USINAGEM DE PRECISAO LTDA',
    )
  })

  it('Cancelar volta para a lista', async () => {
    const { historico } = await abrir(servicos())
    await consultar()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/empresas'))
  })
})

describe('Nova empresa: empresa não ativa (bloqueio)', () => {
  const bloqueada = () =>
    ok(
      receita(
        { codigo: 8, descricao: 'BAIXADA', motivo: 'EXTINCAO', ativa: false },
        { cadastroBloqueado: true },
      ),
    )

  it('mostra a situação e o motivo, desabilita Salvar e esconde a carteira', async () => {
    const x = servicos({ consultarCnpj: vi.fn(async () => bloqueada()) })
    await abrir(x)
    await consultar()
    const aviso = await alerta('Empresa não ativa na Receita')
    expect(aviso).toHaveTextContent('Baixada desde 19/06/2015 (EXTINCAO)')
    expect(aviso).toHaveTextContent(/bloqueado/)
    expect(screen.getByRole('button', { name: 'Salvar empresa' })).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Carteira' })).toBeNull()
    expect(x.c.criar).not.toHaveBeenCalled()
  })

  it('com o bloqueio desligado na empresa, avisa mas deixa salvar', async () => {
    const x = servicos({
      consultarCnpj: vi.fn(async () =>
        ok(
          receita({ codigo: 8, descricao: 'BAIXADA', ativa: false }, { cadastroBloqueado: false }),
        ),
      ),
    })
    await abrir(x)
    await consultar()
    expect(await alerta('Empresa não ativa na Receita')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar empresa' })).toBeEnabled()
  })

  it('se a API recusar no salvar (409 empresa_nao_ativa), mostra o bloqueio', async () => {
    const x = servicos({
      criar: vi.fn(async () =>
        falha(
          'empresa_nao_ativa',
          'A empresa está BAIXADA na Receita e não pode ser cadastrada.',
          409,
        ),
      ),
    })
    await abrir(x)
    await consultar()
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar empresa' }))
    expect(await alerta('Empresa não ativa na Receita')).toHaveTextContent('BAIXADA')
    expect(screen.getByRole('button', { name: 'Salvar empresa' })).toBeDisabled()
  })
})

describe('Nova empresa: já cadastrada, falha e CNPJ que a Receita não conhece', () => {
  it('achou na carteira: avisa e "Abrir ficha" leva à empresa, sem consultar a Receita', async () => {
    const x = servicos({
      listar: vi.fn(async () =>
        ok({
          itens: [{ id: id(700), nome: 'Usidantec', documento: CNPJ }],
          total: 1,
          pagina: 1,
          porPagina: 5,
        } as unknown as ListaDeEmpresas),
      ),
    })
    const { historico } = await abrir(x)
    await consultar()
    expect(await screen.findByText('Esta empresa já está no CRM')).toBeInTheDocument()
    expect(x.c.consultarCnpj).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Salvar empresa' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir ficha' }))
    await waitFor(() => expect(historico.location.pathname).toBe(`/empresas/${id(700)}`))
  })

  it('409 no salvar: com a empresa visível oferece Abrir ficha; sem, só diz que é de outro vendedor', async () => {
    const visivel = servicos({
      criar: vi.fn(async () => ({
        ok: false as const,
        erro: {
          codigo: 'empresa_ja_cadastrada',
          mensagem: 'Este documento já está cadastrado.',
          status: 409,
          dados: { existente: { visivel: true, id: id(701), nome: 'Usidantec' } },
        },
      })),
    })
    const { unmount } = await abrir(visivel)
    await consultar()
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar empresa' }))
    expect(await screen.findByText('Esta empresa já está no CRM')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir ficha' })).toBeInTheDocument()
    unmount()

    const oculta = servicos({
      criar: vi.fn(async () => ({
        ok: false as const,
        erro: {
          codigo: 'empresa_ja_cadastrada',
          mensagem: 'x',
          status: 409,
          dados: { existente: { visivel: false } },
        },
      })),
    })
    await abrir(oculta)
    await consultar()
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar empresa' }))
    expect(await screen.findByText(/carteira de outro vendedor/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir ficha' })).toBeNull()
  })

  it('a Receita não respondeu: avisa e deixa preencher à mão; salva sem CNAEs e a API marca "não verificada"', async () => {
    const x = servicos({
      consultarCnpj: vi.fn(async () => falha('receita_indisponivel', 'Receita fora do ar.', 503)),
    })
    await abrir(x)
    await consultar()
    expect(await screen.findByText('A Receita não respondeu')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preencher à mão' }))
    const passo2 = await screen.findByRole('region', { name: 'Dados da empresa' })
    await userEvent.type(
      within(passo2).getByRole('textbox', { name: /Razão social/ }),
      'Oficina do Zé Ltda',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.criar).toHaveBeenCalled())
    expect(corpoEnviado(x)).toMatchObject({
      tipoDocumento: 'cnpj',
      documento: CNPJ,
      razaoSocial: 'Oficina do Zé Ltda',
    })
    expect(corpoEnviado(x)['cnaes']).toBeUndefined()
  })

  it('CNPJ que a Receita não conhece: mostra o motivo no campo', async () => {
    const x = servicos({
      consultarCnpj: vi.fn(async () =>
        falha('cnpj_nao_encontrado', 'A Receita não tem este CNPJ. Confira o número.', 404),
      ),
    })
    await abrir(x)
    await consultar()
    expect(
      await screen.findByText('A Receita não tem este CNPJ. Confira o número.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conferir dados da Receita' })).toBeNull()
  })
})

describe('Nova empresa: CPF e sem documento', () => {
  it('CPF: valida os dígitos, não consulta a Receita e salva com o CPF sem máscara', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'CPF' }))
    const campo = screen.getByRole('textbox', { name: /CPF/ })
    await userEvent.type(campo, '111.111.111-11')
    expect(await screen.findByText('CPF inválido. Confira os 11 números.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Consultar' })).toBeNull()
    await userEvent.clear(campo)
    await userEvent.type(campo, '52998224725')
    expect(campo).toHaveValue('529.982.247-25')
    const passo2 = await screen.findByRole('region', { name: 'Dados da empresa' })
    await userEvent.type(within(passo2).getByRole('textbox', { name: 'Nome' }), 'Ana Produtora')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.criar).toHaveBeenCalled())
    expect(corpoEnviado(x)).toMatchObject({
      tipoDocumento: 'cpf',
      documento: '52998224725',
      razaoSocial: 'Ana Produtora',
    })
    expect(x.c.consultarCnpj).not.toHaveBeenCalled()
  })

  it('sem documento: o formulário já aparece, sem campo de documento', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Sem documento' }))
    expect(screen.queryByRole('textbox', { name: /CNPJ|CPF/ })).toBeNull()
    const passo2 = await screen.findByRole('region', { name: 'Dados da empresa' })
    await userEvent.type(within(passo2).getByRole('textbox', { name: 'Nome' }), 'Loja do Zé')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.criar).toHaveBeenCalled())
    expect(corpoEnviado(x)).toMatchObject({ tipoDocumento: 'nenhum', razaoSocial: 'Loja do Zé' })
    expect(corpoEnviado(x)['documento']).toBeUndefined()
  })
})

describe('Nova empresa: no celular', () => {
  it('o botão Salvar ocupa a largura toda', async () => {
    largura(390)
    const x = servicos()
    renderizar(x.s, '/empresas/nova')
    await userEvent.click(await screen.findByRole('button', { name: 'Sem documento' }))
    expect(await screen.findByRole('button', { name: 'Salvar empresa' })).toHaveClass('w-full')
  })
})
