import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, id, ok, renderizar, servicosFalsos, sessao } from './fakes'

const comoColega = () =>
  servicosFalsos({
    sessao: {
      ...servicosFalsos().sessao,
      atual: vi.fn(async () => ok(sessao({ papel: 'colega' }))),
    },
  })

describe('meu perfil', () => {
  it('corrige o próprio nome; o botão só liga quando há mudança', async () => {
    const servicos = servicosFalsos()
    renderizar(servicos, '/perfil')
    const usuario = userEvent.setup()
    const salvar = await screen.findByRole('button', { name: 'Salvar' })
    expect(salvar).toBeDisabled()
    const campo = screen.getByLabelText('Nome')
    await usuario.clear(campo)
    await usuario.type(campo, 'Daniel P. Prates')
    await usuario.click(salvar)
    await waitFor(() =>
      expect(servicos.sessao.corrigirNome).toHaveBeenCalledWith('Daniel P. Prates'),
    )
  })

  it('troca o e-mail por um link enviado ao endereço novo', async () => {
    const servicos = servicosFalsos()
    renderizar(servicos, '/perfil')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Alterar' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Novo e-mail'), 'novo@usidantec.com.br')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar link' }))
    await waitFor(() =>
      expect(servicos.sessao.trocarEmail).toHaveBeenCalledWith('novo@usidantec.com.br'),
    )
  })

  it('e-mail de outro acesso mostra o erro e mantém o diálogo', async () => {
    const servicos = servicosFalsos()
    servicos.sessao.trocarEmail = vi.fn(async () =>
      falha({
        codigo: 'email_em_uso',
        mensagem: 'Este e-mail já é usado por outro acesso.',
        status: 409,
      }),
    )
    renderizar(servicos, '/perfil')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Alterar' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Novo e-mail'), 'colega@usidantec.com.br')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar link' }))
    expect(await within(dialogo).findByText(/já é usado por outro acesso/)).toBeInTheDocument()
  })
})

describe('minha empresa', () => {
  it('o Responsável pede acesso para um colega e vê como a equipe tratou os pedidos', async () => {
    const servicos = servicosFalsos()
    servicos.pedidos.listar = vi.fn(async () =>
      ok({
        itens: [
          {
            id: id(80),
            nome: 'Joana Souza',
            email: 'joana@usidantec.com.br',
            cargo: 'Financeiro',
            situacao: 'recusado' as const,
            motivo: 'Fora do contrato',
            criadoEm: '2026-10-20T10:00:00.000Z',
          },
          {
            id: id(81),
            nome: 'Pedro Lima',
            email: 'pedro@usidantec.com.br',
            cargo: null,
            situacao: 'pendente' as const,
            motivo: null,
            criadoEm: '2026-10-21T10:00:00.000Z',
          },
        ],
      }),
    )
    renderizar(servicos, '/perfil')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: 'Minha empresa' }))
    expect(await screen.findByText('Aguardando a equipe')).toBeInTheDocument()
    expect(screen.getByText(/Motivo: Fora do contrato/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Pedir acesso para colega' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Nome'), 'Maria Dias')
    await usuario.type(within(dialogo).getByLabelText('E-mail'), 'maria@usidantec.com.br')
    await usuario.type(within(dialogo).getByLabelText('Cargo (opcional)'), 'Compras')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar pedido' }))
    await waitFor(() =>
      expect(servicos.pedidos.pedir).toHaveBeenCalledWith({
        nome: 'Maria Dias',
        email: 'maria@usidantec.com.br',
        cargo: 'Compras',
      }),
    )
  })

  it('o Colega não vê o pedido de acesso nem consulta os pedidos', async () => {
    const servicos = comoColega()
    renderizar(servicos, '/perfil')
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Minha empresa' }))
    expect(await screen.findByText(/Você é colega nesta empresa/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Pedir acesso para colega' }),
    ).not.toBeInTheDocument()
    expect(servicos.pedidos.listar).not.toHaveBeenCalled()
  })
})

describe('segurança', () => {
  it('lista os dispositivos, encerra os outros e sai deste', async () => {
    const servicos = servicosFalsos()
    servicos.sessao.sessoes = vi.fn(async () =>
      ok({
        itens: [
          {
            id: id(30),
            agente: 'Chrome no Windows',
            ip: '10.0.0.1',
            criadaEm: '2026-10-20T09:00:00.000Z',
            ultimoUsoEm: '2026-10-21T09:00:00.000Z',
            atual: true,
          },
          {
            id: id(31),
            agente: 'Safari no iPhone',
            ip: '10.0.0.2',
            criadaEm: '2026-10-19T09:00:00.000Z',
            ultimoUsoEm: '2026-10-20T09:00:00.000Z',
            atual: false,
          },
        ],
      }),
    )
    servicos.sessao.sair = vi.fn(async () => {
      servicos.sessao.atual = vi.fn(async () =>
        falha({ codigo: 'nao_autenticado', mensagem: 'Sessão encerrada.', status: 401 }),
      )
      return ok(undefined)
    })
    const { historico } = renderizar(servicos, '/perfil')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: 'Segurança' }))
    const lista = await screen.findByRole('list', { name: 'Sessões abertas' })
    expect(within(lista).getByText('Este dispositivo')).toBeInTheDocument()
    await usuario.click(within(lista).getByRole('button', { name: 'Encerrar' }))
    await waitFor(() => expect(servicos.sessao.encerrar).toHaveBeenCalledWith(id(31)))
    await usuario.click(screen.getByRole('button', { name: 'Sair dos outros dispositivos' }))
    await waitFor(() => expect(servicos.sessao.encerrarOutras).toHaveBeenCalled())
    await usuario.click(screen.getByRole('button', { name: /Sair deste dispositivo/ }))
    await waitFor(() => expect(historico.location.pathname).toBe('/entrar'))
  })

  it('liga o 2FA pelo diálogo; o Responsável de empresa que exige não consegue desligar', async () => {
    const servicos = servicosFalsos()
    renderizar(servicos, '/perfil')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: 'Segurança' }))
    await usuario.click(await screen.findByRole('button', { name: 'Ligar' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(
      await within(dialogo).findByLabelText(/Digite o código de 6 números/),
      '123456',
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Ligar verificação' }))
    expect(await within(dialogo).findByText('aaaaa-bbbbb')).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: /Guardei os códigos/ }))
    expect(await screen.findByText('Ligada')).toBeInTheDocument()
  })

  it('desliga o 2FA com um código; exigido pela empresa, o botão fica desligado', async () => {
    const livre = servicosFalsos({
      sessao: {
        ...servicosFalsos().sessao,
        atual: vi.fn(async () => ok(sessao({ segundoFatorAtivo: true }))),
      },
    })
    const { unmount } = renderizar(livre, '/perfil')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: 'Segurança' }))
    await usuario.click(await screen.findByRole('button', { name: 'Desligar' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Código'), '123456')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desligar' }))
    await waitFor(() => expect(livre.segundoFator.desativar).toHaveBeenCalledWith('123456'))
    unmount()

    const exigido = servicosFalsos({
      sessao: {
        ...servicosFalsos().sessao,
        atual: vi.fn(async () =>
          ok(sessao({ segundoFatorAtivo: true, segundoFatorExigido: true })),
        ),
      },
    })
    renderizar(exigido, '/perfil')
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Segurança' }))
    expect(await screen.findByRole('button', { name: 'Desligar' })).toBeDisabled()
    expect(screen.getByText(/exige a verificação do Responsável/)).toBeInTheDocument()
  })
})
