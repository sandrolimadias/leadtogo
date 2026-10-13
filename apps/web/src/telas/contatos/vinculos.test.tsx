import type { Contato } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { contato, id, itemDeEmpresa, meComPapel } from './fixtures'

const vinculo = (n: number, extra: Partial<Contato['vinculos'][number]> = {}) => ({
  id: id(500 + n),
  empresa: { id: id(200 + n), nome: `Empresa ${n}` },
  cargo: `Cargo ${n}`,
  principal: false,
  ativo: true,
  desde: null,
  ate: null,
  editavel: true,
  ...extra,
})

function servicos(
  dados: Contato = contato(),
  papel: 'admin' | 'gestor' | 'vendedor' = 'admin',
  extra: Record<string, unknown> = {},
) {
  const base = servicosFalsos()
  const contatos = {
    ...base.contatos,
    detalhar: vi.fn(async (_id: string) => ok(dados)),
    vincular: vi.fn(async (_id: string, _corpo: Record<string, unknown>) => ok(dados)),
    alterarVinculo: vi.fn(
      async (_id: string, _empresaId: string, _corpo: Record<string, unknown>) => ok(dados),
    ),
    ...extra,
  }
  const s = servicosFalsos({
    me: async () => meComPapel(papel),
    contatos: contatos,
    carteira: {
      ...base.carteira,
      listar: vi.fn(async () =>
        ok({
          itens: [
            itemDeEmpresa(1, { nome: 'Empresa 1' }),
            itemDeEmpresa(2, { nome: 'Empresa 2' }),
            itemDeEmpresa(3, { nome: 'Empresa 3', editavel: false }),
          ],
          total: 3,
          pagina: 1,
          porPagina: 8,
        }),
      ),
    },
  })
  return {
    s,
    contatos: contatos as typeof contatos & {
      vincular: ReturnType<typeof vi.fn>
      alterarVinculo: ReturnType<typeof vi.fn>
    },
  }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, `/contatos/${id(100)}`)
  await screen.findByRole('heading', { name: 'Rogério Bindaco' })
  return r
}
const cartao = () => screen.getByRole('region', { name: 'Empresas vinculadas' })
const linha = (empresa: string) =>
  within(cartao()).getByRole('link', { name: empresa }).closest('li') as HTMLElement
const menuDe = async (empresa: string) => {
  await userEvent.click(
    within(linha(empresa)).getByRole('button', { name: `Ações do vínculo com ${empresa}` }),
  )
  return screen.getByRole('menu')
}

describe('Ficha do contato: vincular a outra empresa', () => {
  it('busca a empresa (só as que edita e que ainda não são vínculo ativo), cargo e principal', async () => {
    const dois = contato({ vinculos: [vinculo(1)] })
    const x = servicos(dois)
    await abrir(x)
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Vincular' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Vincular a outra empresa' })
    await userEvent.type(within(dialogo).getByRole('textbox', { name: 'Empresa' }), 'emp')
    const lista = await within(dialogo).findByRole('list', { name: 'Empresas encontradas' })
    // a 1 já é vínculo ativo e a 3 não é editável: sobra a 2
    expect(within(lista).getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(within(lista).getByRole('button', { name: /Empresa 2/ }))
    await userEvent.type(
      within(dialogo).getByRole('textbox', { name: 'Cargo nesta empresa' }),
      ' Contadora ',
    )
    await userEvent.click(
      within(dialogo).getByRole('checkbox', { name: /Contato principal desta empresa/ }),
    )
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Vincular' }))
    await waitFor(() =>
      expect(x.contatos.vincular).toHaveBeenCalledWith(id(100), {
        empresaId: id(202),
        cargo: 'Contadora',
        principal: true,
      }),
    )
    expect(await screen.findByText('Contato vinculado')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('sem cargo nem principal, só a empresa vai; o botão fica desativado até escolher a empresa', async () => {
    const x = servicos(contato({ vinculos: [] }))
    await abrir(x)
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Vincular' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Vincular a outra empresa' })
    expect(within(dialogo).getByRole('button', { name: 'Vincular' })).toBeDisabled()
    await userEvent.type(within(dialogo).getByRole('textbox', { name: 'Empresa' }), 'emp')
    await userEvent.click(await within(dialogo).findByRole('button', { name: /Empresa 1/ }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Vincular' }))
    await waitFor(() =>
      expect(x.contatos.vincular).toHaveBeenCalledWith(id(100), { empresaId: id(201) }),
    )
  })

  it('"Trocar" volta para a busca; erro da API aparece no diálogo, que continua aberto', async () => {
    const x = servicos(contato({ vinculos: [] }), 'admin', {
      vincular: vi.fn(async () =>
        falha('vinculo_ja_existe', 'Este contato já está vinculado a esta empresa.', 409),
      ),
    })
    await abrir(x)
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Vincular' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Vincular a outra empresa' })
    await userEvent.type(within(dialogo).getByRole('textbox', { name: 'Empresa' }), 'emp')
    await userEvent.click(await within(dialogo).findByRole('button', { name: /Empresa 1/ }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Trocar' }))
    expect(within(dialogo).getByRole('textbox', { name: 'Empresa' })).toBeInTheDocument()
    await userEvent.type(within(dialogo).getByRole('textbox', { name: 'Empresa' }), 'emp')
    await userEvent.click(await within(dialogo).findByRole('button', { name: /Empresa 2/ }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Vincular' }))
    expect(
      await within(dialogo).findByText('Este contato já está vinculado a esta empresa.'),
    ).toBeInTheDocument()
  })
})

describe('Ficha do contato: ações do vínculo', () => {
  const dois = () =>
    contato({
      vinculos: [
        vinculo(1, { principal: true }),
        vinculo(2),
        vinculo(3, { ativo: false, editavel: true }),
      ],
    })

  it('o menu muda conforme o vínculo: principal, ativo ou inativo', async () => {
    await abrir(servicos(dois()))
    let menu = await menuDe('Empresa 1')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Editar cargo', 'Tirar o selo de principal', 'Inativar vínculo'])
    await userEvent.keyboard('{Escape}')
    menu = await menuDe('Empresa 2')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Editar cargo', 'Marcar como principal', 'Inativar vínculo'])
    await userEvent.keyboard('{Escape}')
    menu = await menuDe('Empresa 3')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Editar cargo', 'Reativar vínculo'])
  })

  it('vínculo de empresa que o usuário não edita não tem menu', async () => {
    await abrir(servicos(contato({ vinculos: [vinculo(1, { editavel: false }), vinculo(2)] })))
    expect(within(linha('Empresa 1')).queryByRole('button')).toBeNull()
    expect(
      within(linha('Empresa 2')).getByRole('button', { name: /Ações do vínculo/ }),
    ).toBeInTheDocument()
  })

  it('Editar cargo salva só o cargo; vazio limpa', async () => {
    const x = servicos(dois())
    await abrir(x)
    await userEvent.click(
      within(await menuDe('Empresa 2')).getByRole('menuitem', { name: 'Editar cargo' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Cargo em Empresa 2' })
    const campo = within(dialogo).getByRole('textbox', { name: 'Cargo nesta empresa' })
    expect(campo).toHaveValue('Cargo 2')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Diretor')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar cargo' }))
    await waitFor(() =>
      expect(x.contatos.alterarVinculo).toHaveBeenCalledWith(id(100), id(202), {
        cargo: 'Diretor',
      }),
    )
    expect(await screen.findByText('Cargo atualizado')).toBeInTheDocument()
  })

  it('Marcar como principal e Tirar o selo', async () => {
    const x = servicos(dois())
    await abrir(x)
    await userEvent.click(
      within(await menuDe('Empresa 2')).getByRole('menuitem', { name: 'Marcar como principal' }),
    )
    await waitFor(() =>
      expect(x.contatos.alterarVinculo).toHaveBeenLastCalledWith(id(100), id(202), {
        principal: true,
      }),
    )
    await userEvent.click(
      within(await menuDe('Empresa 1')).getByRole('menuitem', {
        name: 'Tirar o selo de principal',
      }),
    )
    await waitFor(() =>
      expect(x.contatos.alterarVinculo).toHaveBeenLastCalledWith(id(100), id(201), {
        principal: false,
      }),
    )
  })

  it('Inativar pede confirmação, avisa que o histórico continua e envia ativo: false', async () => {
    const x = servicos(dois())
    await abrir(x)
    await userEvent.click(
      within(await menuDe('Empresa 2')).getByRole('menuitem', { name: 'Inativar vínculo' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Inativar este vínculo?' })
    expect(
      within(dialogo).getByText(/o histórico continua e o vínculo pode ser reativado/),
    ).toBeInTheDocument()
    expect(x.contatos.alterarVinculo).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Inativar vínculo' }))
    await waitFor(() =>
      expect(x.contatos.alterarVinculo).toHaveBeenCalledWith(id(100), id(202), { ativo: false }),
    )
    expect(await screen.findByText('Vínculo inativado')).toBeInTheDocument()
  })

  it('Reativar envia ativo: true', async () => {
    const x = servicos(dois())
    await abrir(x)
    await userEvent.click(
      within(await menuDe('Empresa 3')).getByRole('menuitem', { name: 'Reativar vínculo' }),
    )
    await waitFor(() =>
      expect(x.contatos.alterarVinculo).toHaveBeenCalledWith(id(100), id(203), { ativo: true }),
    )
    expect(await screen.findByText('Vínculo reativado')).toBeInTheDocument()
  })

  it('erro da API ao mudar o vínculo avisa e nada some da tela', async () => {
    const x = servicos(dois(), 'admin', {
      alterarVinculo: vi.fn(async () =>
        falha('acesso_negado', 'Você só altera vínculos de empresas da sua carteira.', 403),
      ),
    })
    await abrir(x)
    await userEvent.click(
      within(await menuDe('Empresa 2')).getByRole('menuitem', { name: 'Marcar como principal' }),
    )
    expect(
      await screen.findByText('Você só altera vínculos de empresas da sua carteira.'),
    ).toBeInTheDocument()
    expect(linha('Empresa 2')).toBeInTheDocument()
  })

  it('o vendedor que inativa o único vínculo ativo é avisado e volta para a lista', async () => {
    const unico = contato({ vinculos: [vinculo(1, { principal: true })] })
    const x = servicos(unico, 'vendedor')
    const { historico } = await abrir(x)
    await userEvent.click(
      within(await menuDe('Empresa 1')).getByRole('menuitem', { name: 'Inativar vínculo' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Inativar este vínculo?' })
    expect(within(dialogo).getByText(/o contato sai da sua carteira/)).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Inativar vínculo' }))
    expect(await screen.findByText(/saiu da sua carteira/)).toBeInTheDocument()
    await waitFor(() => expect(historico.location.pathname).toBe('/contatos'))
  })

  it('o gestor que inativa o único vínculo continua na ficha', async () => {
    const unico = contato({ vinculos: [vinculo(1, { principal: true })] })
    const x = servicos(unico, 'gestor')
    const { historico } = await abrir(x)
    await userEvent.click(
      within(await menuDe('Empresa 1')).getByRole('menuitem', { name: 'Inativar vínculo' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Inativar este vínculo?' })
    expect(within(dialogo).queryByText(/sai da sua carteira/)).toBeNull()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Inativar vínculo' }))
    await waitFor(() => expect(x.contatos.alterarVinculo).toHaveBeenCalled())
    expect(historico.location.pathname).toBe(`/contatos/${id(100)}`)
  })
})
