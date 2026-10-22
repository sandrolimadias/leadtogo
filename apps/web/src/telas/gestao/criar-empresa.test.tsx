import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  falha,
  meDeAdmin,
  ok,
  perfilDoPapel,
  renderizar,
  servicosFalsos,
} from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const B = '0192f0a0-0000-7000-8000-0000000000b1'
const empresaA = {
  id: A,
  razaoSocial: 'Aurora Ltda',
  nomeFantasia: 'Aurora',
  papel: 'admin' as const,
  ...perfilDoPapel('admin'),
  situacao: 'ativo' as const,
  ativa: true,
}
const meDoDono = (extra = {}) =>
  meDeAdmin({ empresas: [empresaA], empresaAtivaId: A, administradorDeConta: true, ...extra })

describe('Criar empresa', () => {
  it('quem não administra a conta volta para o início', async () => {
    const { historico } = renderizar(
      servicosFalsos({ me: async () => meDoDono({ administradorDeConta: false }) }),
      '/criar-empresa',
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('valida os campos, cria, entra na empresa nova e vai para o início', async () => {
    const criarEmpresa = vi.fn(async () =>
      ok({
        empresa: {
          id: B,
          razaoSocial: 'Filial Norte Ltda',
          nomeFantasia: 'Filial Norte',
          papel: 'admin' as const,
          ...perfilDoPapel('admin'),
          situacao: 'teste' as const,
          ativa: false,
        },
        cnpjRepetidoNaConta: false,
      }),
    )
    const trocarEmpresa = vi.fn(async () => ok(undefined))
    const { historico } = renderizar(
      servicosFalsos({ me: async () => meDoDono(), criarEmpresa, trocarEmpresa }),
      '/criar-empresa',
    )
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Criar empresa' })

    await usuario.click(screen.getByRole('button', { name: 'Criar empresa' }))
    expect(await screen.findByText('Informe a razão social.')).toBeInTheDocument()
    expect(criarEmpresa).not.toHaveBeenCalled()

    await usuario.type(screen.getByLabelText(/Razão social/), 'Filial Norte Ltda')
    await usuario.type(screen.getByLabelText(/Nome de exibição/), 'Filial Norte')
    await usuario.type(screen.getByLabelText('CNPJ'), '11222333000199')
    await usuario.click(screen.getByRole('button', { name: 'Criar empresa' }))
    expect(await screen.findByText('CNPJ inválido. Confira os números.')).toBeInTheDocument()
    expect(criarEmpresa).not.toHaveBeenCalled()

    await usuario.clear(screen.getByLabelText('CNPJ'))
    await usuario.click(screen.getByRole('button', { name: 'Criar empresa' }))
    await waitFor(() =>
      expect(criarEmpresa).toHaveBeenCalledWith({
        razaoSocial: 'Filial Norte Ltda',
        nomeFantasia: 'Filial Norte',
      }),
    )
    await waitFor(() => expect(trocarEmpresa).toHaveBeenCalledWith(B))
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('mostra o erro da API sem sair da tela', async () => {
    const criarEmpresa = vi.fn(async () =>
      falha(
        'conta_obrigatoria',
        'Você administra mais de uma conta. Escolha em qual criar a empresa.',
      ),
    )
    const { historico } = renderizar(
      servicosFalsos({ me: async () => meDoDono(), criarEmpresa }),
      '/criar-empresa',
    )
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText(/Razão social/), 'Filial Sul Ltda')
    await usuario.click(screen.getByRole('button', { name: 'Criar empresa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('mais de uma conta')
    expect(historico.location.pathname).toBe('/criar-empresa')
  })

  it('o menu do seletor leva à tela de criar empresa (administrador da conta)', async () => {
    const { historico } = renderizar(
      servicosFalsos({
        me: async () =>
          meDoDono({
            empresas: [
              empresaA,
              {
                ...empresaA,
                id: B,
                nomeFantasia: 'Borealis',
                razaoSocial: 'Borealis Ltda',
                ativa: false,
              },
            ],
          }),
      }),
      '/',
    )
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: /Aurora/ }))
    await usuario.click(await screen.findByRole('menuitem', { name: /Criar empresa/ }))
    await waitFor(() => expect(historico.location.pathname).toBe('/criar-empresa'))
  })
})
