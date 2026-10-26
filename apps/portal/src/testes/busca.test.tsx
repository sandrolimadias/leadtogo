import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { id, ok, renderizar, servicosFalsos } from './fakes'

const itens = [
  {
    tipo: 'chamado' as const,
    id: id(10),
    titulo: 'CH-0042 · Nota fiscal duplicada',
    trecho: null,
    destino: `/chamados/${id(10)}`,
    data: '2026-10-20T12:00:00.000Z',
  },
  {
    tipo: 'documento' as const,
    id: id(11),
    titulo: 'Manual de conciliação',
    trecho: null,
    destino: '/documentos',
    data: '2026-10-18T12:00:00.000Z',
  },
  {
    tipo: 'evento' as const,
    id: id(12),
    titulo: 'Treinamento de conciliação',
    trecho: 'Auditório, 2º andar',
    destino: '/agenda',
    data: '2026-11-10T12:00:00.000Z',
  },
]

describe('busca global', () => {
  it('só consulta com 2 letras ou mais e agrupa por tipo', async () => {
    const busca = vi.fn(async () => ok({ itens }))
    renderizar(servicosFalsos({ busca }), '/busca')
    const usuario = userEvent.setup()
    const campo = await screen.findByLabelText('O que você procura?')
    await usuario.type(campo, 'c')
    expect(busca).not.toHaveBeenCalled()
    await usuario.type(campo, 'onciliacao')
    await waitFor(() => expect(busca).toHaveBeenCalledWith('conciliacao'))
    expect(await screen.findByRole('region', { name: 'Chamados' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Documentos' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Agenda' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Publicações' })).toBeNull()
    expect(screen.getByText('Auditório, 2º andar')).toBeInTheDocument()
  })

  it('o campo do cabeçalho leva à busca com o termo; clicar num resultado abre a tela', async () => {
    const busca = vi.fn(async () => ok({ itens }))
    const { historico } = renderizar(servicosFalsos({ busca }), '/')
    const usuario = userEvent.setup()
    const campo = await screen.findByLabelText('Buscar no portal')
    await usuario.type(campo, 'nota fiscal{Enter}')
    await waitFor(() => expect(historico.location.pathname).toBe('/busca'))
    expect(historico.location.search).toContain('nota')
    await waitFor(() => expect(busca).toHaveBeenCalledWith('nota fiscal'))
    await usuario.click(await screen.findByRole('button', { name: /Manual de conciliação/ }))
    await waitFor(() => expect(historico.location.pathname).toBe('/documentos'))
  })

  it('sem resultado, explica; o resultado do chamado abre o detalhe', async () => {
    const busca = vi.fn(async (q: string) => ok({ itens: q === 'zzz' ? [] : itens.slice(0, 1) }))
    const { historico } = renderizar(servicosFalsos({ busca }), '/busca?q=zzz')
    expect(await screen.findByText('Nada encontrado')).toBeInTheDocument()
    const usuario = userEvent.setup()
    const campo = screen.getByLabelText('O que você procura?')
    await usuario.clear(campo)
    await usuario.type(campo, 'nota')
    await usuario.click(await screen.findByRole('button', { name: /CH-0042/ }))
    await waitFor(() => expect(historico.location.pathname).toBe(`/chamados/${id(10)}`))
  })
})
