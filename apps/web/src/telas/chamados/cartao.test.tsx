import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, itemDeChamado, meComChamados } from './fixtures'

function servicos(pendentes: number, permissoes: Record<string, 'todas' | true>) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados(permissoes),
    chamados: {
      ...base.chamados,
      listar: vi.fn(async () =>
        ok({
          itens:
            pendentes === 0
              ? []
              : [
                  itemDeChamado(),
                  itemDeChamado({
                    id: id(2),
                    codigo: 'CH-0043',
                    assunto: 'Boleto vencido',
                    prioridade: 'urgente',
                  }),
                ],
          total: pendentes,
          abas: { triagem: 0, pendentes, meus: 0, todos: pendentes },
        }),
      ),
    },
  })
}

describe('Painel inicial: card "Chamados pendentes"', () => {
  it('mostra o total, os primeiros chamados (com a urgência) e o atalho para a lista', async () => {
    const s = servicos(7, { 'chamados.ver': 'todas' })
    renderizar(s, '/')
    const card = await screen.findByRole('region', { name: 'Chamados pendentes' })
    expect(within(card).getByText('(7)')).toBeInTheDocument()
    expect(
      within(card).getByRole('link', { name: /Revisar contrato do cliente/ }),
    ).toBeInTheDocument()
    expect(within(card).getByText('Urgente')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Ver todos' })).toHaveAttribute(
      'href',
      '/chamados',
    )
    expect(s.chamados.listar).toHaveBeenCalledWith({ aba: 'pendentes', porPagina: 5 })
  })

  it('some quando não há pendentes e não é pedido a quem não vê chamados', async () => {
    const vazio = servicos(0, { 'chamados.ver': 'todas' })
    const { unmount } = renderizar(vazio, '/')
    await screen.findByRole('heading', { name: 'Dashboard', hidden: true })
    expect(screen.queryByRole('region', { name: 'Chamados pendentes' })).not.toBeInTheDocument()
    unmount()
    const semPermissao = servicos(3, {})
    renderizar(semPermissao, '/')
    await screen.findByRole('heading', { name: 'Dashboard', hidden: true })
    expect(screen.queryByRole('region', { name: 'Chamados pendentes' })).not.toBeInTheDocument()
    expect(semPermissao.chamados.listar).not.toHaveBeenCalled()
  })
})
