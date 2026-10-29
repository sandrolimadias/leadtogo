import type { ContatoExistente } from '@leadtogo/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { contato, gruposDeContato, id, itemDeEmpresa, meComPapel, papeis } from './fixtures'

function servicos(
  extra: Record<string, unknown> = {},
  papel: 'admin' | 'gestor' | 'vendedor' = 'admin',
) {
  const base = servicosFalsos()
  const contatos = {
    ...base.contatos,
    criar: vi.fn(async (_dados: Record<string, unknown>) => ok(contato())),
    ...extra,
  }
  const listar = vi.fn(async (_c: Record<string, unknown>) =>
    ok({
      itens: [itemDeEmpresa(1), itemDeEmpresa(2, { editavel: false })],
      total: 2,
      pagina: 1,
      porPagina: 6,
    }),
  )
  const s = servicosFalsos({
    me: async () => meComPapel(papel),
    contatos: contatos,
    carteira: { ...base.carteira, listar },
    tags: {
      ...base.tags,
      listar: vi.fn(async (a?: string) => ok(a === 'contato' ? gruposDeContato : [])),
    },
    cadastros: {
      ...base.cadastros,
      papeisDecisao: { ...base.cadastros.papeisDecisao, listar: vi.fn(async () => ok(papeis)) },
    },
  })
  return { s, contatos: contatos as typeof contatos & { criar: ReturnType<typeof vi.fn> }, listar }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, '/contatos/novo')
  await screen.findByRole('heading', { name: 'Novo contato' })
  return r
}
const nome = () => screen.getByRole('textbox', { name: /^Nome/ })
const corpo = (x: ReturnType<typeof servicos>) =>
  (x.contatos.criar.mock.calls.at(-1) as [Record<string, unknown>])[0]

describe('Novo contato', () => {
  it('mostra as seções; o administrador pode criar sem empresa', async () => {
    await abrir(servicos())
    for (const secao of [
      'Empresa',
      'Dados da pessoa',
      'Telefones',
      'E-mails',
      'Consentimento (LGPD)',
    ]) {
      expect(screen.getByRole('region', { name: secao })).toBeInTheDocument()
    }
    expect(screen.getByLabelText(/Empresa \(opcional\)/)).toBeInTheDocument()
    const papel = screen.getByRole('combobox', { name: 'Papel na decisão' })
    await waitFor(() =>
      expect(
        within(papel)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual([
        'Sem papel definido',
        'Decisor',
        'Influenciador', // o Técnico está inativo
      ]),
    )
  })

  it('seção Tags: as tags marcadas vão no cadastro', async () => {
    const x = servicos()
    await abrir(x)
    const secao = await screen.findByRole('region', { name: 'Tags' })
    await userEvent.type(nome(), 'Ana Souza')
    await userEvent.click(within(secao).getByRole('checkbox', { name: 'Técnico' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.criar).toHaveBeenCalled())
    expect(corpo(x)).toMatchObject({ nome: 'Ana Souza', tagIds: [id(61)] })
  })

  it('salva só com o nome e vai para a edição do contato criado', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    await userEvent.type(nome(), '  Ana Souza ')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.criar).toHaveBeenCalledTimes(1))
    expect(corpo(x)).toEqual({
      nome: 'Ana Souza',
      aniversario: null,
      linkedinUrl: '',
      observacoes: '',
      telefones: [],
      emails: [],
    })
    expect(await screen.findByText('Contato criado')).toBeInTheDocument()
    await waitFor(() => expect(historico.location.pathname).toBe(`/contatos/${id(100)}`))
  })

  it('nome vazio e aniversário pela metade avisam nos campos e não enviam', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Dia do aniversário' }),
      '10',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(await screen.findByText('Informe o nome do contato.')).toBeInTheDocument()
    expect(screen.getByText(/Informe o dia e o mês do aniversário/)).toBeInTheDocument()
    expect(x.contatos.criar).not.toHaveBeenCalled()
  })

  it('telefones e e-mails: adicionar, tipo, principal e remover; vazios não vão', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.type(nome(), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar telefone' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Telefone 1' }), '(27) 99847-2210')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo do telefone 1' }),
      'whatsapp',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar telefone' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Telefone 2' }), '2732431907')
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Principal' })[1] as HTMLElement)
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar telefone' })) // fica vazio
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar e-mail' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'E-mail 1' }), 'ana@exemplo.com')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar e-mail' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remover e-mail 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.criar).toHaveBeenCalled())
    expect(corpo(x)['telefones']).toEqual([
      { numero: '(27) 99847-2210', tipo: 'whatsapp', principal: false },
      { numero: '2732431907', principal: true },
    ])
    expect(corpo(x)['emails']).toEqual([
      { email: 'ana@exemplo.com', tipo: 'trabalho', principal: true },
    ])
  })

  it('consentimento: "Pediu para não receber contato" desliga WhatsApp e e-mail juntos', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.type(nome(), 'Ana')
    await userEvent.click(screen.getByRole('switch', { name: 'Pediu para não receber contato' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.criar).toHaveBeenCalledTimes(1))
    expect(corpo(x)).toMatchObject({ aceitaWhatsapp: false, aceitaEmail: false })
  })

  it('sem mexer na chave do consentimento, ele não vai no corpo', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.type(nome(), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.criar).toHaveBeenCalledTimes(1))
    expect(corpo(x)['aceitaWhatsapp']).toBeUndefined()
    expect(corpo(x)['aceitaEmail']).toBeUndefined()
  })

  it('escolhe a empresa pela busca (só as que edita), com cargo e principal', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.type(nome(), 'Ana')
    await userEvent.type(screen.getByLabelText(/Empresa \(opcional\)/), 'emp')
    const lista = await screen.findByRole('list', { name: 'Empresas encontradas' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(1) // a Empresa 2 não é editável
    await userEvent.click(within(lista).getByRole('button', { name: /Empresa 1/ }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Cargo nesta empresa' }), 'Compradora')
    await userEvent.click(screen.getByRole('checkbox', { name: /Contato principal desta empresa/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.criar).toHaveBeenCalled())
    expect(corpo(x)['vinculo']).toEqual({
      empresaId: id(201),
      cargo: 'Compradora',
      principal: true,
    })
    expect(x.listar.mock.calls.at(-1)?.[0]).toMatchObject({ busca: 'emp', porPagina: 6 })
  })

  it('o vendedor precisa escolher a empresa', async () => {
    const x = servicos({}, 'vendedor')
    await abrir(x)
    expect(screen.getByRole('textbox', { name: 'Empresa' })).toBeInTheDocument()
    await userEvent.type(nome(), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(await screen.findByText('Escolha a empresa do contato.')).toBeInTheDocument()
    expect(x.contatos.criar).not.toHaveBeenCalled()
  })

  it('duplicado só avisa: "Abrir contato" leva ao existente e "Criar mesmo assim" cria', async () => {
    const existentes: ContatoExistente[] = [
      { visivel: true, id: id(700), nome: 'Ana Souza', motivo: 'email' },
    ]
    const criar = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        erro: {
          codigo: 'contato_duplicado',
          mensagem: 'Já existe.',
          status: 409,
          dados: { existentes },
        },
      })
      .mockResolvedValue(ok(contato()))
    const x = servicos({ criar })
    const { historico } = await abrir(x)
    await userEvent.type(nome(), 'Ana S.')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    const aviso = await screen.findByText('Já existe um contato parecido')
    const alerta = aviso.closest('[role="alert"]') as HTMLElement
    expect(within(alerta).getByText('Ana Souza')).toBeInTheDocument()
    expect(within(alerta).getByText(/o mesmo e-mail/)).toBeInTheDocument()
    expect(criar).toHaveBeenCalledTimes(1)
    await userEvent.click(within(alerta).getByRole('button', { name: 'Criar mesmo assim' }))
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(2))
    expect((criar.mock.calls[1] as [Record<string, unknown>])[0]['ignorarDuplicado']).toBe(true)
    await waitFor(() => expect(historico.location.pathname).toBe(`/contatos/${id(100)}`))
  })

  it('duplicado de carteira que o usuário não vê: avisa sem nome e sem "Abrir contato"', async () => {
    const criar = vi.fn().mockResolvedValue({
      ok: false,
      erro: {
        codigo: 'contato_duplicado',
        mensagem: 'Já existe.',
        status: 409,
        dados: { existentes: [{ visivel: false, motivo: 'telefone' }] },
      },
    })
    await abrir(servicos({ criar }))
    await userEvent.type(nome(), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(await screen.findByText(/carteira que você não vê/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir contato' })).toBeNull()
  })

  it('mexer no formulário depois do aviso o tira; erro da API aparece e mantém o que foi digitado', async () => {
    const criar = vi.fn().mockResolvedValue(falha('x', 'Servidor fora do ar.', 503))
    await abrir(servicos({ criar }))
    await userEvent.type(nome(), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(await screen.findByText('Servidor fora do ar.')).toBeInTheDocument()
    expect(nome()).toHaveValue('Ana')
  })

  it('?empresa=<id> (da aba Contatos da empresa) já vem com a empresa escolhida e o nome dela', async () => {
    const x = servicos()
    const base = x.s.carteira
    const detalhar = vi.fn(async () =>
      ok({
        id: id(201),
        razaoSocial: 'Usidantec Ltda',
        nomeFantasia: 'Usidantec',
        permissoes: { editar: true, excluir: true, transferir: true },
      } as never),
    )
    x.s.carteira = { ...base, detalhar }
    renderizar(x.s, `/contatos/novo?empresa=${id(201)}`)
    await screen.findByRole('heading', { name: 'Novo contato' })
    expect(await screen.findByText('Usidantec')).toBeInTheDocument()
    await userEvent.type(nome(), 'Ana')
    await userEvent.type(screen.getByRole('textbox', { name: 'Cargo nesta empresa' }), 'Compradora')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.criar).toHaveBeenCalled())
    expect(corpo(x)['vinculo']).toMatchObject({ empresaId: id(201), cargo: 'Compradora' })
  })

  it('?empresa=<id> de empresa que o usuário não edita: o cadastro segue sem empresa', async () => {
    const x = servicos()
    const base = x.s.carteira
    x.s.carteira = {
      ...base,
      detalhar: vi.fn(async () => falha('empresa_nao_encontrada', 'Empresa não encontrada.', 404)),
    }
    renderizar(x.s, `/contatos/novo?empresa=${id(201)}`)
    await screen.findByRole('heading', { name: 'Novo contato' })
    expect(await screen.findByLabelText(/Empresa \(opcional\)/)).toBeInTheDocument()
    await userEvent.type(nome(), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.criar).toHaveBeenCalled())
    expect(corpo(x)['vinculo']).toBeUndefined()
  })

  it('Cancelar volta para a lista de contatos', async () => {
    const { historico } = await abrir(servicos())
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/contatos'))
  })
})
