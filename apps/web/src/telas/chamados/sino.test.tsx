import type { Notificacao } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { ENDERECO_DO_FLUXO } from '@/casca/fluxo-do-sino'

import { chamadoCompleto, id, meComChamados } from './fixtures'

const notificacao = (extra: Partial<Notificacao> = {}): Notificacao => ({
  id: id(700),
  tipo: 'chamado.aberto',
  titulo: 'CH-0042 · Novo chamado',
  mensagem: 'Revisar contrato do cliente',
  link: `/chamados/${id(1)}`,
  chamadoId: id(1),
  lida: false,
  criadoEm: '2026-10-21T14:00:00.000Z',
  ...extra,
})

class FonteFalsa {
  static todas: FonteFalsa[] = []
  ouvintes = new Map<string, ((e: { data: string }) => void)[]>()
  fechada = false
  constructor(readonly url: string) {
    FonteFalsa.todas.push(this)
  }
  addEventListener(tipo: string, f: (e: { data: string }) => void) {
    this.ouvintes.set(tipo, [...(this.ouvintes.get(tipo) ?? []), f])
  }
  close() {
    this.fechada = true
  }
  emitir(tipo: string, data = '{}') {
    for (const f of this.ouvintes.get(tipo) ?? []) f({ data })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FonteFalsa.todas = []
})

function servicos(itens: Notificacao[], naoLidas = itens.filter((n) => !n.lida).length) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados({ 'chamados.ver': 'todas' }),
    chamados: { ...base.chamados, obter: vi.fn(async () => ok(chamadoCompleto())) },
    notificacoes: {
      listar: vi.fn(async () => ok({ itens, total: itens.length, naoLidas })),
      marcarLida: vi.fn(async () => ok({ marcadas: 1, naoLidas: Math.max(0, naoLidas - 1) })),
      marcarTodas: vi.fn(async () => ok({ marcadas: naoLidas, naoLidas: 0 })),
    },
  })
}

describe('O sino do CRM', () => {
  it('mostra quantas não lidas há, lista as notificações e abre o chamado marcando como lida', async () => {
    const s = servicos([
      notificacao(),
      notificacao({ id: id(701), titulo: 'CH-0041 · Nova mensagem', lida: true }),
    ])
    renderizar(s, '/')
    const sino = await screen.findByRole('button', { name: 'Notificações (1 não lidas)' })
    await userEvent.click(sino)
    const lista = await screen.findByRole('list', { name: 'Notificações' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lista).getAllByText('Revisar contrato do cliente')).toHaveLength(2)
    await userEvent.click(within(lista).getByRole('button', { name: /CH-0042 · Novo chamado/ }))
    await waitFor(() => expect(s.notificacoes.marcarLida).toHaveBeenCalledWith(id(700)))
    expect(
      await screen.findByRole('heading', { name: 'Revisar contrato do cliente' }),
    ).toBeInTheDocument()
  })

  it('"Marcar todas como lidas" e o painel vazio', async () => {
    const s = servicos([notificacao(), notificacao({ id: id(702) })])
    renderizar(s, '/')
    await userEvent.click(
      await screen.findByRole('button', { name: /Notificações \(2 não lidas\)/ }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }))
    await waitFor(() => expect(s.notificacoes.marcarTodas).toHaveBeenCalled())
  })

  it('tempo real: abre o fluxo, mostra o aviso quando chega "nova", relê o sino e fecha ao sair', async () => {
    vi.stubGlobal('EventSource', FonteFalsa)
    const s = servicos([])
    const { unmount } = renderizar(s, '/')
    await screen.findByRole('button', { name: 'Notificações' })
    await waitFor(() => expect(FonteFalsa.todas).toHaveLength(1))
    const fonte = FonteFalsa.todas[0] as FonteFalsa
    expect(fonte.url).toBe(ENDERECO_DO_FLUXO)
    const antes = vi.mocked(s.notificacoes.listar).mock.calls.length
    fonte.emitir(
      'nova',
      JSON.stringify({ id: id(703), tipo: 'chamado.aberto', titulo: 'CH-0050 · Novo chamado' }),
    )
    await waitFor(() =>
      expect(vi.mocked(s.notificacoes.listar).mock.calls.length).toBeGreaterThan(antes),
    )
    expect(await screen.findByText('CH-0050 · Novo chamado')).toBeInTheDocument()
    unmount()
    expect(fonte.fechada).toBe(true)
  })
})
