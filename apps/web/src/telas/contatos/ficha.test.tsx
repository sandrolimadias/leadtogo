import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { contato, id, meComPapel } from './fixtures'

function servicos(
  dados = contato(),
  papel: 'admin' | 'gestor' | 'vendedor' = 'admin',
  extra: Record<string, unknown> = {},
) {
  const base = servicosFalsos()
  const contatos = {
    ...base.contatos,
    detalhar: vi.fn(async (_id: string) => ok(dados)),
    alterar: vi.fn(async (_id: string, _corpo: Record<string, unknown>) => ok(dados)),
    excluir: vi.fn(async (_id: string) => ok(undefined)),
    ...extra,
  }
  return {
    s: servicosFalsos({ me: async () => meComPapel(papel), contatos: contatos }),
    contatos: contatos as typeof contatos & {
      alterar: ReturnType<typeof vi.fn>
      excluir: ReturnType<typeof vi.fn>
    },
  }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, `/contatos/${id(100)}`)
  await screen.findByRole('heading', { name: 'Rogério Bindaco' })
  return r
}

function largura(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}
afterEach(() => largura(1280))

describe('Ficha do contato', () => {
  it('cabeçalho: nome, papel, cargo e empresa principal, ações e caminho de volta', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    expect(screen.getByText('Decisor', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Diretor · Usidantec')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ligar' })).toHaveAttribute('href', 'tel:+552732431907')
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/552732431907',
    )
    expect(screen.getByRole('link', { name: 'E-mail' })).toHaveAttribute(
      'href',
      'mailto:rogerio@exemplo.com.br',
    )
    expect(screen.queryByText('Não quer contato', { selector: 'span' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await waitFor(() => expect(historico.location.pathname).toBe(`/contatos/${id(100)}/editar`))
  })

  it('Empresas vinculadas: nome com link para a ficha da empresa, cargo, Principal e situação', async () => {
    const c = contato()
    const base = c.vinculos[0] as (typeof c.vinculos)[number]
    const x = servicos({
      ...c,
      vinculos: [
        base,
        {
          ...base,
          id: id(502),
          empresa: { id: id(201), nome: 'Antiga Ltda' },
          cargo: null,
          principal: false,
          ativo: false,
        },
      ],
    })
    const { historico } = await abrir(x)
    const cartao = screen.getByRole('region', { name: 'Empresas vinculadas' })
    const itens = within(cartao).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(within(itens[0] as HTMLElement).getByText('Principal')).toBeInTheDocument()
    expect(within(itens[0] as HTMLElement).getByText('Ativo')).toBeInTheDocument()
    expect(within(itens[0] as HTMLElement).getByText('Diretor')).toBeInTheDocument()
    expect(within(itens[1] as HTMLElement).getByText('Inativo')).toBeInTheDocument()
    expect(within(itens[1] as HTMLElement).getByText('Sem cargo informado')).toBeInTheDocument()
    expect(within(cartao).getByText(/O cargo é de cada vínculo/)).toBeInTheDocument()
    await userEvent.click(within(cartao).getByRole('link', { name: 'Usidantec' }))
    await waitFor(() => expect(historico.location.pathname).toBe(`/empresas/${id(200)}`))
  })

  it('sem empresa: avisa; vínculos todos inativos: "Sem vínculo ativo"', async () => {
    const semEmpresa = servicos(contato({ vinculos: [] }))
    const { unmount } = await abrir(semEmpresa)
    expect(screen.getByText('Sem empresa vinculada')).toBeInTheDocument()
    expect(screen.getByText('Este contato ainda não tem empresa.')).toBeInTheDocument()
    unmount()

    const c = contato()
    const v = c.vinculos[0] as (typeof c.vinculos)[number]
    await abrir(servicos({ ...c, vinculos: [{ ...v, ativo: false, principal: false }] }))
    expect(screen.getByText('Sem vínculo ativo')).toBeInTheDocument()
  })

  it('Dados da pessoa: telefones e e-mails com tipo, aniversário, LinkedIn e observações', async () => {
    await abrir(servicos())
    const cartao = screen.getByRole('region', { name: 'Dados da pessoa' })
    expect(within(cartao).getByText('(27) 3243-1907')).toBeInTheDocument()
    expect(within(cartao).getByText('Fixo')).toBeInTheDocument()
    expect(within(cartao).getByText('(27) 99847-2210')).toBeInTheDocument()
    expect(within(cartao).getByText('WhatsApp')).toBeInTheDocument()
    expect(within(cartao).getByText('rogerio@exemplo.com.br')).toBeInTheDocument()
    expect(within(cartao).getByText('Trabalho')).toBeInTheDocument()
    expect(within(cartao).getAllByText('Principal')).toHaveLength(2)
    expect(within(cartao).getByText('10 de maio')).toBeInTheDocument()
    expect(within(cartao).getByRole('link', { name: 'linkedin.com/in/rogerio' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/rogerio',
    )
    expect(within(cartao).getByText('Prefere ligação de manhã.')).toBeInTheDocument()
  })

  it('contato sem telefone, e-mail ou dados opcionais mostra os traços e desativa Ligar, WhatsApp e E-mail', async () => {
    await abrir(
      servicos(
        contato({
          telefones: [],
          emails: [],
          papelDecisao: null,
          aniversario: null,
          linkedinUrl: null,
          observacoes: null,
        }),
      ),
    )
    const cartao = screen.getByRole('region', { name: 'Dados da pessoa' })
    expect(within(cartao).getByText('Sem telefone')).toBeInTheDocument()
    expect(within(cartao).getByText('Sem e-mail')).toBeInTheDocument()
    expect(within(cartao).getAllByText('—')).toHaveLength(3)
    expect(within(cartao).queryByText('Observações')).toBeNull()
    for (const nome of ['Ligar', 'WhatsApp', 'E-mail']) {
      expect(screen.getByRole('link', { name: nome })).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('Consentimento: base legal, origem e data; "Pode ser contatado" quando nunca mudou', async () => {
    await abrir(servicos())
    const cartao = screen.getByRole('region', { name: 'Consentimento (LGPD)' })
    expect(within(cartao).getByText('Pode ser contatado')).toBeInTheDocument()
    expect(within(cartao).getByText('Legítimo interesse')).toBeInTheDocument()
    expect(
      within(cartao).getByRole('switch', { name: 'Pediu para não receber contato' }),
    ).not.toBeChecked()
  })

  it('"Não quer contato": selo no cabeçalho e no consentimento, com origem e data; Ligar e WhatsApp seguem ativos', async () => {
    await abrir(
      servicos(
        contato({
          aceitaWhatsapp: false,
          aceitaEmail: false,
          consentimentoEm: '2026-10-05T14:30:00.000Z',
          consentimentoOrigem: 'manual',
        }),
      ),
    )
    expect(screen.getAllByText('Não quer contato')).toHaveLength(2)
    const cartao = screen.getByRole('region', { name: 'Consentimento (LGPD)' })
    expect(within(cartao).getByText('Registrado manualmente')).toBeInTheDocument()
    expect(within(cartao).getByText(/05\/10\/2026/)).toBeInTheDocument()
    expect(
      within(cartao).getByRole('switch', { name: 'Pediu para não receber contato' }),
    ).toBeChecked()
    expect(screen.getByRole('link', { name: 'Ligar' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('link', { name: 'WhatsApp' })).not.toHaveAttribute('aria-disabled')
  })

  it('a chave do consentimento grava na hora (as duas flags juntas) e atualiza a tela', async () => {
    const depois = contato({
      aceitaWhatsapp: false,
      aceitaEmail: false,
      consentimentoEm: '2026-10-13T12:00:00.000Z',
      consentimentoOrigem: 'manual',
    })
    const x = servicos(contato(), 'admin', {
      alterar: vi.fn(async () => ok(depois)),
    })
    await abrir(x)
    await userEvent.click(screen.getByRole('switch', { name: 'Pediu para não receber contato' }))
    await waitFor(() =>
      expect(x.contatos.alterar).toHaveBeenCalledWith(id(100), {
        aceitaWhatsapp: false,
        aceitaEmail: false,
      }),
    )
    expect(await screen.findByText('Marcado como "Não quer contato"')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Não quer contato')).toHaveLength(2))
  })

  it('erro ao registrar o consentimento avisa e a chave não muda', async () => {
    const x = servicos(contato(), 'admin', {
      alterar: vi.fn(async () => falha('x', 'Servidor fora do ar.', 503)),
    })
    await abrir(x)
    await userEvent.click(screen.getByRole('switch', { name: 'Pediu para não receber contato' }))
    expect(await screen.findByText('Servidor fora do ar.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Pediu para não receber contato' })).not.toBeChecked()
  })

  it('quem só vê o contato: sem Editar, sem Excluir e sem a chave do consentimento', async () => {
    await abrir(servicos(contato({ permissoes: { editar: false, excluir: false } }), 'vendedor'))
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('vendedor que edita o contato: Editar sim, Excluir não', async () => {
    await abrir(servicos(contato({ permissoes: { editar: true, excluir: false } }), 'vendedor'))
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Excluir contato' })).toBeNull()
  })

  it('gestor exclui: confirma no diálogo, o contato sai e volta para a lista', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Excluir contato' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir este contato?' })
    expect(within(dialogo).getByText(/inative o vínculo em vez de excluir/)).toBeInTheDocument()
    expect(x.contatos.excluir).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir contato' }))
    await waitFor(() => expect(x.contatos.excluir).toHaveBeenCalledWith(id(100)))
    expect(await screen.findByText('Contato excluído')).toBeInTheDocument()
    await waitFor(() => expect(historico.location.pathname).toBe('/contatos'))
  })

  it('erro ao excluir fica no diálogo, que continua aberto', async () => {
    const x = servicos(contato(), 'admin', {
      excluir: vi.fn(async () => falha('acesso_negado', 'Sem permissão.', 403)),
    })
    await abrir(x)
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Excluir contato' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir este contato?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir contato' }))
    expect(await within(dialogo).findByText('Sem permissão.')).toBeInTheDocument()
  })

  it('contato inexistente: "Contato não encontrado"; erro de rede: "Tentar de novo"', async () => {
    const naoExiste = servicos(contato(), 'admin', {
      detalhar: vi.fn(async () => falha('contato_nao_encontrado', 'Contato não encontrado.', 404)),
    })
    const { unmount } = renderizar(naoExiste.s, `/contatos/${id(100)}`)
    expect(
      await screen.findByRole('heading', { name: 'Contato não encontrado' }),
    ).toBeInTheDocument()
    unmount()

    const detalhar = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Sem conexão.', 0))
      .mockResolvedValue(ok(contato()))
    renderizar(servicos(contato(), 'admin', { detalhar }).s, `/contatos/${id(100)}`)
    expect(await screen.findByText('Sem conexão.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Rogério Bindaco' })).toBeInTheDocument()
  })

  it('no celular: Ligar, WhatsApp e E-mail em botões grandes, sem migalhas', async () => {
    largura(390)
    await abrir(servicos())
    expect(screen.queryByRole('navigation', { name: 'Você está em' })).toBeNull()
    for (const nome of ['Ligar', 'WhatsApp', 'E-mail']) {
      expect(screen.getByRole('link', { name: nome })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull() // no celular, só pelo menu
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument()
  })
})
