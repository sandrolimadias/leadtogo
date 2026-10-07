import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { meDeAdmin, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

describe('App: guarda de rotas', () => {
  it('sem sessão, a raiz leva ao login', async () => {
    const { historico } = renderizar(servicosFalsos(), '/')
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/login')
    expect(historico.location.search).toContain('redirect')
  })

  it('com sessão, mostra o app', async () => {
    renderizar(servicosFalsos({ me: async () => meDeAdmin() }), '/')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('administrador sem 2FA fica preso na ativação: a casca está bloqueada', async () => {
    const { historico } = renderizar(
      servicosFalsos({
        me: async () =>
          meDeAdmin({
            doisFatoresPendente: true,
            usuario: { ...meDeAdmin().usuario, twoFactorEnabled: false },
          }),
      }),
      '/',
    )
    expect(
      await screen.findByRole('heading', { name: 'Ative a verificação em duas etapas' }),
    ).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/ativar-2fa')
  })

  it('quem já entrou não vê o login: vai para o app', async () => {
    const { historico } = renderizar(servicosFalsos({ me: async () => meDeAdmin() }), '/login')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/')
  })
})
