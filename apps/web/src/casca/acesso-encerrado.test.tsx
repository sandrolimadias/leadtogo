import type { Me } from '@leadtogo/api-client'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const B = '01a111e8-f08a-70b7-b5f3-52998ced0a3b'
const empresa = (id: string, nome: string, ativa: boolean) => ({
  id,
  razaoSocial: `${nome} Ltda`,
  nomeFantasia: nome,
  papel: 'vendedor' as const,
  situacao: 'ativo' as const,
  ativa,
})
const meBase = (extra: Partial<Me>): Me =>
  meDeAdmin({ administradorDeConta: false, doisFatoresObrigatorio: false, ...extra })

describe('acesso à empresa encerrado (membro desativado com a sessão aberta)', () => {
  it('a sessão ainda aponta a empresa A, mas o vínculo acabou e existe a B: avisa e entra na B', async () => {
    let atual = meBase({
      empresaAtivaId: A,
      precisaEscolherEmpresa: true,
      empresas: [empresa(B, 'Borealis', false)],
    })
    const trocarEmpresa = vi.fn(async (id: string) => {
      atual = meBase({
        empresaAtivaId: id,
        precisaEscolherEmpresa: false,
        empresas: [empresa(B, 'Borealis', true)],
      })
      return ok(undefined)
    })
    const sair = vi.fn(async () => undefined)
    const { historico } = renderizar(
      servicosFalsos({ me: async () => atual, trocarEmpresa, sair }),
      '/',
    )
    await waitFor(() => expect(trocarEmpresa).toHaveBeenCalledWith(B))
    expect(await screen.findByText('Seu acesso a esta empresa foi encerrado')).toBeInTheDocument()
    expect(await screen.findByText('Você está agora em Borealis')).toBeInTheDocument()
    expect(sair).not.toHaveBeenCalled()
    expect(historico.location.pathname).toBe('/')
  })

  it('sem outra empresa: avisa e leva para o login', async () => {
    let logado = true
    const sair = vi.fn(async () => {
      logado = false
    })
    const { historico } = renderizar(
      servicosFalsos({
        me: async () =>
          logado
            ? meBase({ empresaAtivaId: A, precisaEscolherEmpresa: false, empresas: [] })
            : null,
        sair,
      }),
      '/',
    )
    expect(await screen.findByText('Seu acesso a esta empresa foi encerrado')).toBeInTheDocument()
    await waitFor(() => expect(sair).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(historico.location.pathname).toBe('/login'))
  })

  it('quem nunca escolheu empresa (empresaAtivaId nulo) segue para o seletor, sem aviso', async () => {
    const trocarEmpresa = vi.fn(async () => ok(undefined))
    const sair = vi.fn(async () => undefined)
    renderizar(
      servicosFalsos({
        me: async () =>
          meBase({
            empresaAtivaId: null,
            precisaEscolherEmpresa: true,
            empresas: [empresa(A, 'Aurora', false), empresa(B, 'Borealis', false)],
          }),
        trocarEmpresa,
        sair,
      }),
      '/',
    )
    await screen.findByText(/Aurora/)
    // (os avisos dos testes anteriores podem ainda estar na tela: vale o que não foi chamado)
    expect(trocarEmpresa).not.toHaveBeenCalled()
    expect(sair).not.toHaveBeenCalled()
  })
})
