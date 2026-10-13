import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const me = (papel: 'admin' | 'gestor' | 'vendedor') =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel,
        situacao: 'ativo' as const,
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

const config = (extra = {}) => ({
  bloquearEmpresaNaoAtiva: true,
  vendedorVeTodasEmpresas: false,
  ...extra,
})

function servicos(
  atual = config(),
  extra: { alterar?: ReturnType<typeof vi.fn>; obter?: ReturnType<typeof vi.fn> } = {},
) {
  const obter = extra.obter ?? vi.fn(async () => ok(atual))
  const alterar = extra.alterar ?? vi.fn(async (patch: object) => ok({ ...atual, ...patch }))
  return {
    s: servicosFalsos({
      me: async () => me('admin'),
      configuracaoDaCarteira: obter as never,
      alterarConfiguracaoDaCarteira: alterar as never,
    }),
    obter,
    alterar,
  }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, '/configuracoes/carteira')
  await screen.findByRole('switch', { name: /Bloquear o cadastro de empresa não ativa/ })
  return r
}

describe('Configurações → Carteira', () => {
  it('administrador: o menu interno traz Carteira, com as duas regras e os padrões', async () => {
    await abrir(servicos())
    const menu = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Carteira/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.getByRole('switch', { name: /Bloquear o cadastro de empresa não ativa/ }),
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Vendedores podem ver todas as empresas' }),
    ).not.toBeChecked()
  })

  it.each(['gestor', 'vendedor'] as const)('%s volta para o início', async (papel) => {
    const { historico } = renderizar(
      servicosFalsos({ me: async () => me(papel) }),
      '/configuracoes/carteira',
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('desligar o bloqueio salva na hora e avisa o que muda', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(
      screen.getByRole('switch', { name: /Bloquear o cadastro de empresa não ativa/ }),
    )
    await waitFor(() => expect(x.alterar).toHaveBeenCalledWith({ bloquearEmpresaNaoAtiva: false }))
    expect(await screen.findByText('Regra da carteira salva')).toBeInTheDocument()
    expect(screen.getByText(/poderá ser cadastrada, com o aviso de situação/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Bloquear o cadastro/ })).not.toBeChecked()
  })

  it('ligar "Vendedores podem ver todas as empresas" manda só esse campo', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(
      screen.getByRole('switch', { name: 'Vendedores podem ver todas as empresas' }),
    )
    await waitFor(() => expect(x.alterar).toHaveBeenCalledWith({ vendedorVeTodasEmpresas: true }))
    expect(
      await screen.findByText('Vendedores passam a ver todas as empresas.'),
    ).toBeInTheDocument()
  })

  it('erro ao salvar: avisa o motivo e a chave volta ao que a API tem', async () => {
    const x = servicos(config(), {
      alterar: vi.fn(async () => falha('x', 'Servidor fora do ar.', 503)),
    })
    await abrir(x)
    await userEvent.click(
      screen.getByRole('switch', { name: /Bloquear o cadastro de empresa não ativa/ }),
    )
    expect(await screen.findByText('Não foi possível salvar')).toBeInTheDocument()
    expect(screen.getByText('Servidor fora do ar.')).toBeInTheDocument()
    await waitFor(() => expect(x.obter.mock.calls.length).toBeGreaterThan(1))
    expect(screen.getByRole('switch', { name: /Bloquear o cadastro/ })).toBeChecked()
  })

  it('carregando mostra o esqueleto; erro ao carregar oferece "Tentar de novo"', async () => {
    const lento = servicos(config(), { obter: vi.fn(() => new Promise(() => undefined)) })
    const { unmount } = renderizar(lento.s, '/configuracoes/carteira')
    expect(await screen.findByRole('status', { name: 'Carregando a carteira' })).toBeInTheDocument()
    unmount()

    const obter = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Sem conexão.', 503))
      .mockResolvedValue(ok(config()))
    renderizar(servicos(config(), { obter }).s, '/configuracoes/carteira')
    expect(await screen.findByText('Sem conexão.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(
      await screen.findByRole('switch', { name: /Bloquear o cadastro de empresa não ativa/ }),
    ).toBeInTheDocument()
  })
})
