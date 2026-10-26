import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { id, ok, renderizar, servicosFalsos } from './fakes'

const aviso = (destino: string | null, extra = {}) => ({
  id: id(70),
  tipo: 'aviso',
  titulo: 'Aviso',
  corpo: 'O expediente de sexta termina às 14h',
  destino,
  lida: false,
  criadaEm: new Date().toISOString(),
  ...extra,
})

const comAviso = (destino: string | null) =>
  servicosFalsos({
    notificacoes: {
      ...servicosFalsos().notificacoes,
      listar: vi.fn(async () => ok({ itens: [aviso(destino)], naoLidas: 1 })),
    },
  })

describe('avisos da equipe no sino', () => {
  it('o aviso aparece com a mensagem inteira; abrir marca como lido e vai para a tela do link', async () => {
    const servicos = comAviso('/agenda')
    const { historico } = renderizar(servicos, '/notificacoes')
    const usuario = userEvent.setup()
    expect(await screen.findByText('O expediente de sexta termina às 14h')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Aviso/ }))
    await waitFor(() => expect(servicos.notificacoes.marcarLida).toHaveBeenCalledWith(id(70)))
    await waitFor(() => expect(historico.location.pathname).toBe('/agenda'))
  })

  it('link externo abre em outra aba, sem referência; link desconhecido só marca como lido', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    const externo = comAviso('https://exemplo.com.br/novidade')
    const { unmount } = renderizar(externo, '/notificacoes')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: /Aviso/ }))
    await waitFor(() =>
      expect(abrir).toHaveBeenCalledWith(
        'https://exemplo.com.br/novidade',
        '_blank',
        'noopener,noreferrer',
      ),
    )
    unmount()

    abrir.mockClear()
    const estranho = comAviso('/admin/segredo')
    const { historico } = renderizar(estranho, '/notificacoes')
    await usuario.click(await screen.findByRole('button', { name: /Aviso/ }))
    await waitFor(() => expect(estranho.notificacoes.marcarLida).toHaveBeenCalled())
    expect(abrir).not.toHaveBeenCalled()
    expect(historico.location.pathname).toBe('/notificacoes')
    abrir.mockRestore()
  })
})
