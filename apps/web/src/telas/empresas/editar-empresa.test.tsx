import type { EmpresaCarteira, OpcoesDaLista, Vertical } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

const verticais: Vertical[] = [
  { id: id(21), nome: 'Metalmecânica', cor: 'blue', ativo: true, ordem: 0 },
  { id: id(22), nome: 'Alimentos', cor: 'green', ativo: true, ordem: 1 },
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
  observacoes: 'Visitar de manhã.',
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
  ],
  socios: [
    { id: id(401), nome: 'ROGERIO BINDACO', qualificacao: 'Sócio-Administrador', contatoId: null },
  ],
  tags: [{ id: id(13), nome: 'Cliente', cor: 'green', tagGrupoId: id(1), automatica: false }],
  receita: null,
  situacaoNaoVerificada: false,
  receitaAtualizadoEm: null,
  ultimaVisitaEm: null,
  ultimoContatoEm: null,
  proximaAtividadeEm: null,
  criadoEm: '2026-08-01T12:00:00.000Z',
  atualizadoEm: '2026-09-12T12:00:00.000Z',
  posicao: {
    estado: 'sem_coordenada',
    latitude: null,
    longitude: null,
    precisao: null,
    aproximacao: null,
    origem: null,
    raioM: null,
    atualizadoEm: null,
    ajusteManual: false,
    enderecoMudouDepoisDoAjuste: false,
    centroSugerido: null,
    faltas: [],
  },
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

function servicos(
  carteira: Record<string, unknown> = {},
  dados: EmpresaCarteira = empresa(),
  op: OpcoesDaLista = opcoes(),
) {
  const c = {
    detalhar: vi.fn(async (_id: string) => ok(dados)),
    opcoes: vi.fn(async () => ok(op)),
    alterar: vi.fn(async (_id: string, _corpo: unknown) => ok(dados)),
    ...carteira,
  }
  const base = servicosFalsos()
  const s = servicosFalsos({
    me: async () => me,
    carteira: { ...base.carteira, ...c },
    cadastros: {
      ...base.cadastros,
      verticais: { ...base.cadastros.verticais, listar: vi.fn(async () => ok(verticais)) },
    },
  })
  return { s, c: c as typeof c & Record<string, ReturnType<typeof vi.fn>> }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, `/empresas/${id(100)}/editar`)
  await screen.findByRole('heading', { name: 'Editar empresa' })
  return r
}

describe('Editar empresa', () => {
  it('traz os dados da empresa, sem o passo da Receita, sem o documento editável e sem o Status', async () => {
    await abrir(servicos())
    const dados = await screen.findByRole('region', { name: 'Dados da empresa' })
    expect(within(dados).getByRole('textbox', { name: /Razão social/ })).toHaveValue(
      'JACARAIPE USINAGEM DE PRECISAO LTDA',
    )
    expect(within(dados).getByRole('textbox', { name: 'Nome fantasia' })).toHaveValue(
      'Jacaraípe Usinagem',
    )
    expect(within(dados).getByLabelText('Início das atividades')).toHaveValue('2015-06-19')
    expect(within(dados).getByRole('textbox', { name: 'CEP' })).toHaveValue('29175-588')
    expect(within(dados).getByRole('textbox', { name: 'Cidade' })).toHaveValue('SERRA/ES')
    expect(within(dados).getByRole('checkbox', { name: /\(27\) 3243-1907/ })).toBeChecked()
    expect(within(dados).getByRole('checkbox', { name: /\(27\) 99847-2210/ })).toBeChecked()
    expect(within(dados).getByRole('checkbox', { name: 'Também é WhatsApp' })).toBeChecked()
    expect(within(dados).queryByText(/da Receita|digitado/)).toBeNull()
    expect(screen.queryByRole('textbox', { name: /^CNPJ/ })).toBeNull()
    expect(screen.getByText('11.222.333/0001-81')).toBeInTheDocument()
    expect(screen.getByText(/o documento não muda depois do cadastro/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Consultar' })).toBeNull()
    const carteira = screen.getByRole('region', { name: 'Carteira' })
    expect(within(carteira).queryByRole('combobox', { name: /Status/ })).toBeNull()
    expect(within(carteira).getByRole('combobox', { name: 'Vertical' })).toHaveValue(id(21))
    expect(within(carteira).getByRole('combobox', { name: /Vendedor/ })).toHaveValue(id(900))
    expect(within(carteira).getByRole('textbox', { name: 'Website' })).toHaveValue(
      'jacaraipe.com.br',
    )
    expect(within(carteira).getByRole('textbox', { name: 'Observações' })).toHaveValue(
      'Visitar de manhã.',
    )
  })

  it('salva só o que a tela deixa mudar e volta para a ficha', async () => {
    const x = servicos()
    const { historico: h } = await abrir(x)
    const dados = await screen.findByRole('region', { name: 'Dados da empresa' })
    const fantasia = within(dados).getByRole('textbox', { name: 'Nome fantasia' })
    await userEvent.clear(fantasia)
    await userEvent.type(fantasia, 'Jacaraípe Precisão')
    await userEvent.click(within(dados).getByRole('checkbox', { name: /\(27\) 3243-1907/ })) // tira o fixo
    const carteira = screen.getByRole('region', { name: 'Carteira' })
    await userEvent.selectOptions(
      within(carteira).getByRole('combobox', { name: /Vendedor/ }),
      id(901),
    )
    await userEvent.selectOptions(
      within(carteira).getByRole('combobox', { name: 'Vertical' }),
      id(22),
    )
    await userEvent.clear(within(carteira).getByRole('textbox', { name: 'Observações' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.alterar).toHaveBeenCalledTimes(1))
    const [chamadaId, corpo] = x.c.alterar.mock.calls[0] as [string, Record<string, unknown>]
    expect(chamadaId).toBe(id(100))
    expect(corpo).toMatchObject({
      razaoSocial: 'JACARAIPE USINAGEM DE PRECISAO LTDA',
      nomeFantasia: 'Jacaraípe Precisão',
      vendedorId: id(901),
      verticalId: id(22),
      observacoes: '',
      dataInicioAtividades: '2015-06-19',
      regimeTributario: 'simples_nacional',
      telefones: [{ numero: '27998472210', tipo: 'whatsapp' }],
      endereco: {
        cep: '29175-588',
        tipoLogradouro: 'RUA',
        logradouro: 'PONTA DOS FACHOS',
        municipioCodigo: 3205002,
      },
    })
    expect(corpo['documento']).toBeUndefined()
    expect(corpo['tipoDocumento']).toBeUndefined()
    expect(corpo['statusTagId']).toBeUndefined()
    expect(corpo['cnaes']).toBeUndefined()
    expect(await screen.findByText('Empresa atualizada')).toBeInTheDocument()
    await waitFor(() => expect(h.location.pathname).toBe(`/empresas/${id(100)}`))
  })

  it('limpar a vertical e a data envia null', async () => {
    const x = servicos()
    await abrir(x)
    const carteira = await screen.findByRole('region', { name: 'Carteira' })
    await userEvent.selectOptions(within(carteira).getByRole('combobox', { name: 'Vertical' }), '')
    await userEvent.clear(screen.getByLabelText('Início das atividades'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.alterar).toHaveBeenCalled())
    expect((x.c.alterar.mock.calls[0] as [string, Record<string, unknown>])[1]).toMatchObject({
      verticalId: null,
      dataInicioAtividades: null,
    })
  })

  it('sem poder passar a carteira ou com um membro só: sem o campo Vendedor e sem vendedorId no corpo', async () => {
    const x = servicos(
      {},
      empresa({ permissoes: { editar: true, excluir: false, transferir: false } }),
    )
    await abrir(x)
    await screen.findByRole('region', { name: 'Carteira' })
    expect(screen.queryByRole('combobox', { name: /Vendedor/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    await waitFor(() => expect(x.c.alterar).toHaveBeenCalled())
    expect(
      (x.c.alterar.mock.calls[0] as [string, Record<string, unknown>])[1]['vendedorId'],
    ).toBeUndefined()
  })

  it('CPF e sem documento: o nome vira "Nome" e o texto do documento muda', async () => {
    await abrir(
      servicos({}, empresa({ tipoDocumento: 'cpf', documento: '52998224725', matrizFilial: null })),
    )
    expect(await screen.findByRole('textbox', { name: 'Nome' })).toBeInTheDocument()
    expect(screen.getByText('529.982.247-25')).toBeInTheDocument()
  })

  it('o nome precisa ter 2 letras; erro da API aparece e mantém o que foi digitado', async () => {
    const x = servicos({
      alterar: vi.fn(async () => falha('x', 'Não foi possível salvar agora.', 500)),
    })
    await abrir(x)
    const razao = await screen.findByRole('textbox', { name: /Razão social/ })
    await userEvent.clear(razao)
    expect(screen.getByRole('button', { name: 'Salvar empresa' })).toBeDisabled()
    await userEvent.type(razao, 'Nova Razão Ltda')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }))
    expect(await screen.findByText('Não foi possível salvar agora.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Razão social/ })).toHaveValue('Nova Razão Ltda')
  })

  it('Cancelar volta para a ficha sem salvar', async () => {
    const x = servicos()
    const { historico: h } = await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(h.location.pathname).toBe(`/empresas/${id(100)}`))
    expect(x.c.alterar).not.toHaveBeenCalled()
  })

  it('quem só vê a empresa não edita; empresa que não existe mostra "não encontrada"', async () => {
    const semPermissao = servicos(
      {},
      empresa({ permissoes: { editar: false, excluir: false, transferir: false } }),
    )
    const { unmount } = renderizar(semPermissao.s, `/empresas/${id(100)}/editar`)
    expect(
      await screen.findByRole('heading', { name: 'Você não edita esta empresa' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar empresa' })).toBeNull()
    unmount()

    const naoExiste = servicos({
      detalhar: vi.fn(async () => falha('empresa_nao_encontrada', 'Empresa não encontrada.', 404)),
    })
    renderizar(naoExiste.s, `/empresas/${id(100)}/editar`)
    expect(
      await screen.findByRole('heading', { name: 'Empresa não encontrada' }),
    ).toBeInTheDocument()
  })
})
