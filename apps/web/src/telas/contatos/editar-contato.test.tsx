import type { ContatoExistente } from '@leadtogo/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { contato, id, meComPapel, papeis } from './fixtures'

function servicos(extra: Record<string, unknown> = {}, dados = contato()) {
  const base = servicosFalsos()
  const contatos = {
    ...base.contatos,
    detalhar: vi.fn(async (_id: string) => ok(dados)),
    alterar: vi.fn(async (_id: string, _corpo: Record<string, unknown>) => ok(dados)),
    ...extra,
  }
  const s = servicosFalsos({
    me: async () => meComPapel('admin'),
    contatos: contatos,
    cadastros: {
      ...base.cadastros,
      papeisDecisao: { ...base.cadastros.papeisDecisao, listar: vi.fn(async () => ok(papeis)) },
    },
  })
  return { s, contatos: contatos as typeof contatos & { alterar: ReturnType<typeof vi.fn> } }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, `/contatos/${id(100)}/editar`)
  await screen.findByRole('heading', { name: 'Editar contato' })
  return r
}
const corpo = (x: ReturnType<typeof servicos>) =>
  (x.contatos.alterar.mock.calls.at(-1) as [string, Record<string, unknown>])[1]

describe('Editar contato', () => {
  it('traz os dados do contato nos campos', async () => {
    await abrir(servicos())
    expect(screen.getByRole('textbox', { name: /^Nome/ })).toHaveValue('Rogério Bindaco')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Papel na decisão' })).toHaveValue(id(1)),
    )
    expect(screen.getByRole('combobox', { name: 'Dia do aniversário' })).toHaveValue('10')
    expect(screen.getByRole('combobox', { name: 'Mês do aniversário' })).toHaveValue('5')
    expect(screen.getByRole('textbox', { name: 'LinkedIn' })).toHaveValue(
      'https://www.linkedin.com/in/rogerio',
    )
    expect(screen.getByRole('textbox', { name: 'Telefone 1' })).toHaveValue('2732431907')
    expect(screen.getByRole('combobox', { name: 'Tipo do telefone 2' })).toHaveValue('whatsapp')
    expect(screen.getByRole('textbox', { name: 'E-mail 1' })).toHaveValue('rogerio@exemplo.com.br')
    expect(screen.getByRole('switch', { name: 'Pediu para não receber contato' })).not.toBeChecked()
    expect(screen.queryByRole('region', { name: 'Empresa' })).toBeNull() // os vínculos têm tela própria
  })

  it('salva o que mudou (a pessoa inteira, sem o vínculo) e avisa', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    const nome = screen.getByRole('textbox', { name: /^Nome/ })
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Rogério B. Bindaco')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Papel na decisão' }), '')
    await userEvent.click(screen.getByRole('button', { name: 'Remover telefone 1' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Pediu para não receber contato' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.alterar).toHaveBeenCalledTimes(1))
    expect(x.contatos.alterar.mock.calls[0]?.[0]).toBe(id(100))
    expect(corpo(x)).toMatchObject({
      nome: 'Rogério B. Bindaco',
      papelDecisaoId: null,
      aniversario: { dia: 10, mes: 5 },
      telefones: [{ numero: '27998472210', tipo: 'whatsapp', principal: false }],
      emails: [{ email: 'rogerio@exemplo.com.br', tipo: 'trabalho', principal: true }],
      aceitaWhatsapp: false,
      aceitaEmail: false,
    })
    expect(corpo(x)['vinculo']).toBeUndefined()
    expect(await screen.findByText('Contato atualizado')).toBeInTheDocument()
    await waitFor(() => expect(historico.location.pathname).toBe(`/contatos/${id(100)}`))
  })

  it('limpar o dia e o mês do aniversário envia null; sem mexer no consentimento ele não vai', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dia do aniversário' }), '')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Mês do aniversário' }), '')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    await waitFor(() => expect(x.contatos.alterar).toHaveBeenCalled())
    expect(corpo(x)['aniversario']).toBeNull()
    expect(corpo(x)['aceitaWhatsapp']).toBeUndefined()
  })

  it('contato que pediu para não ser contatado já abre com a chave ligada', async () => {
    await abrir(servicos({}, contato({ aceitaWhatsapp: false, aceitaEmail: false })))
    expect(screen.getByRole('switch', { name: 'Pediu para não receber contato' })).toBeChecked()
  })

  it('e-mail novo que já é de outro contato: avisa e "Salvar mesmo assim" reenvia', async () => {
    const existentes: ContatoExistente[] = [
      { visivel: true, id: id(700), nome: 'Ana Souza', motivo: 'email' },
    ]
    const alterar = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        erro: { codigo: 'contato_duplicado', mensagem: 'x', status: 409, dados: { existentes } },
      })
      .mockResolvedValue(ok(contato()))
    const x = servicos({ alterar })
    const { historico } = await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar contato' }))
    const alerta = (await screen.findByText('Já existe um contato parecido')).closest(
      '[role="alert"]',
    ) as HTMLElement
    await userEvent.click(within(alerta).getByRole('button', { name: 'Salvar mesmo assim' }))
    await waitFor(() => expect(alterar).toHaveBeenCalledTimes(2))
    expect(
      (alterar.mock.calls[1] as [string, Record<string, unknown>])[1]['ignorarDuplicado'],
    ).toBe(true)
    await userEvent.click(
      within(alerta).queryByRole('button', { name: 'Abrir contato' }) ?? document.body,
    )
    expect(historico.location.pathname).toBeDefined()
  })

  it('quem só vê o contato não edita; contato que não existe mostra "não encontrado"', async () => {
    const semPermissao = servicos({}, contato({ permissoes: { editar: false, excluir: false } }))
    const { unmount } = renderizar(semPermissao.s, `/contatos/${id(100)}/editar`)
    expect(
      await screen.findByRole('heading', { name: 'Você não edita este contato' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar contato' })).toBeNull()
    unmount()

    const naoExiste = servicos({
      detalhar: vi.fn(async () => falha('contato_nao_encontrado', 'Contato não encontrado.', 404)),
    })
    renderizar(naoExiste.s, `/contatos/${id(100)}/editar`)
    expect(
      await screen.findByRole('heading', { name: 'Contato não encontrado' }),
    ).toBeInTheDocument()
  })

  it('erro de rede ao carregar: mostra o motivo e "Tentar de novo" recarrega', async () => {
    const detalhar = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Sem conexão.', 0))
      .mockResolvedValue(ok(contato()))
    renderizar(servicos({ detalhar }).s, `/contatos/${id(100)}/editar`)
    expect(await screen.findByText('Sem conexão.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Editar contato' })).toBeInTheDocument()
  })
})
