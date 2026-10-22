import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const comoVendedor = (extra: Record<string, unknown> = {}) =>
  meDeAdmin({
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
    usuario: { ...meDeAdmin().usuario, nome: 'Mariana', twoFactorEnabled: true },
    ...extra,
  })

describe('Meu perfil → Segurança', () => {
  it('diz o motivo real: a segurança da empresa X para o perfil dele', async () => {
    renderizar(
      servicosFalsos({
        me: async () =>
          comoVendedor({
            doisFatoresObrigatorio: true,
            doisFatoresMotivo: {
              origem: 'empresa',
              empresaId: '01a111e8-f08a-70b7-b5f3-52998ced0a3a',
              papel: 'vendedor',
            },
            empresas: [
              {
                id: '01a111e8-f08a-70b7-b5f3-52998ced0a3a',
                razaoSocial: 'Aurora Móveis Ltda',
                nomeFantasia: 'Aurora Móveis',
                papel: 'vendedor',
                situacao: 'ativo',
                ativa: true,
              },
            ],
            empresaAtivaId: '01a111e8-f08a-70b7-b5f3-52998ced0a3a',
          }),
      }),
      '/perfil/seguranca',
    )
    expect(await screen.findByText(/segurança da empresa Aurora Móveis exige/)).toHaveTextContent(
      'perfil Vendedor',
    )
  })

  it('quem não tem 2FA ativa pelo mesmo fluxo da ativação obrigatória e volta ao status', async () => {
    let ativo = false
    const servicos = servicosFalsos({
      me: async () =>
        comoVendedor({ usuario: { ...meDeAdmin().usuario, twoFactorEnabled: ativo } }),
      confirmarDoisFatores: vi.fn(async () => {
        ativo = true
        return ok(undefined)
      }),
    })
    renderizar(servicos, '/perfil/seguranca')
    expect(await screen.findByText('Desativada')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ativar verificação em duas etapas' }))
    const senha = await screen.findByLabelText('Senha')
    expect(senha).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Sair' })).toBeNull() // é voluntária: só cancelar
    await userEvent.type(senha, 'segredo-forte-1{Enter}')
    expect(await screen.findByAltText('QR code para o app autenticador')).toBeInTheDocument()
    await userEvent.keyboard('123456{Enter}')
    await waitFor(() => expect(servicos.confirmarDoisFatores).toHaveBeenCalledWith('123456'))
    await screen.findByRole('heading', { name: 'Guarde seus códigos de recuperação' })
    await userEvent.click(screen.getByLabelText('Guardei meus códigos de recuperação'))
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Ativa')).toBeInTheDocument()
  })

  it('cancelar a ativação volta ao status sem ativar', async () => {
    renderizar(
      servicosFalsos({
        me: async () =>
          comoVendedor({ usuario: { ...meDeAdmin().usuario, twoFactorEnabled: false } }),
      }),
      '/perfil/seguranca',
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ativar verificação em duas etapas' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('Desativada')).toBeInTheDocument()
  })

  it('desativa com a senha e um código; erros aparecem ligados ao campo', async () => {
    let ativo = true
    const servicos = servicosFalsos({
      me: async () =>
        comoVendedor({ usuario: { ...meDeAdmin().usuario, twoFactorEnabled: ativo } }),
      desativarDoisFatores: vi
        .fn()
        .mockResolvedValueOnce(falha('INVALID_CODE', 'Código incorreto ou vencido.', 401))
        .mockImplementationOnce(async () => {
          ativo = false
          return ok(undefined)
        }),
    })
    renderizar(servicos, '/perfil/seguranca')
    await screen.findByText('Ativa')
    const botao = screen.getByRole('button', { name: 'Desativar verificação' })
    await userEvent.click(botao)
    expect(
      screen.getByLabelText('Senha', { selector: '#desativar-senha' }),
    ).toHaveAccessibleDescription('Digite a senha.')
    await userEvent.type(
      screen.getByLabelText('Senha', { selector: '#desativar-senha' }),
      'segredo-forte-1',
    )
    await userEvent.click(botao)
    expect(screen.getByText('Digite os 6 números do código.')).toBeInTheDocument()
    expect(servicos.desativarDoisFatores).not.toHaveBeenCalled()
    await userEvent.click(screen.getAllByLabelText('Dígito 1')[0]!)
    await userEvent.keyboard('000000')
    await userEvent.click(botao)
    expect(await screen.findByText('Código incorreto ou vencido.')).toBeInTheDocument()
    await userEvent.keyboard('{Backspace}')
    await userEvent.click(screen.getAllByLabelText('Dígito 1')[0]!)
    await userEvent.keyboard('123456')
    await userEvent.click(botao)
    await waitFor(() =>
      expect(servicos.desativarDoisFatores).toHaveBeenLastCalledWith('segredo-forte-1', '123456'),
    )
    expect(await screen.findByText('Desativada')).toBeInTheDocument()
  })

  it('quando alguma regra exige o 2FA, não oferece desativar (só explica)', async () => {
    renderizar(
      servicosFalsos({ me: async () => comoVendedor({ doisFatoresObrigatorio: true }) }),
      '/perfil/seguranca',
    )
    await screen.findByText('Ativa')
    expect(screen.queryByRole('button', { name: 'Desativar verificação' })).toBeNull()
    expect(screen.getByText(/obrigatória para você/)).toBeInTheDocument()
    expect(screen.getByText(/administrador\(a\) da conta/)).toBeInTheDocument()
    // gerar novos códigos continua disponível
    expect(screen.getByRole('button', { name: 'Gerar novos códigos' })).toBeInTheDocument()
  })

  it('gera novos códigos de recuperação com a senha e os mostra uma vez', async () => {
    const servicos = servicosFalsos({ me: async () => comoVendedor() })
    renderizar(servicos, '/perfil/seguranca')
    await screen.findByText('Ativa')
    const senha = document.getElementById('codigos-senha') as HTMLInputElement
    await userEvent.type(senha, 'segredo-forte-1{Enter}')
    await waitFor(() => expect(servicos.gerarNovosCodigos).toHaveBeenCalledWith('segredo-forte-1'))
    expect(
      await screen.findByRole('list', { name: 'Novos códigos de recuperação' }),
    ).toHaveTextContent('nova-1111')
    await userEvent.click(screen.getByRole('button', { name: 'Pronto, guardei' }))
    expect(screen.queryByRole('list', { name: 'Novos códigos de recuperação' })).toBeNull()
  })

  it('exige login: sem sessão vai ao login', async () => {
    const { historico } = renderizar(servicosFalsos(), '/perfil/seguranca')
    await screen.findByRole('heading', { name: 'Entrar' })
    expect(historico.location.pathname).toBe('/login')
  })

  it('sem 2FA onde é exigido, o guarda leva à ativação obrigatória antes da tela de segurança', async () => {
    const { historico } = renderizar(
      servicosFalsos({
        me: async () =>
          comoVendedor({
            doisFatoresPendente: true,
            usuario: { ...meDeAdmin().usuario, twoFactorEnabled: false },
          }),
      }),
      '/perfil/seguranca',
    )
    await screen.findByRole('heading', { name: 'Ative a verificação em duas etapas' })
    expect(historico.location.pathname).toBe('/ativar-2fa')
  })
})
