import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, id, ok, renderizar, servicosFalsos } from './fakes'

const documento = (extra = {}) => ({
  id: id(70),
  titulo: 'Guia rápido do portal',
  descricao: 'Passo a passo para abrir chamados',
  nome: 'guia.pdf',
  tamanho: 327_680,
  publicadoEm: '2026-10-20T10:00:00.000Z',
  ...extra,
})

const comLista = (itens = [documento()], baixar?: ReturnType<typeof vi.fn>) =>
  servicosFalsos({
    documentos: {
      listar: vi.fn(async () => ok({ itens, total: itens.length })),
      baixar: (baixar ??
        vi.fn(async () => ok({ url: 'https://armazenamento/documento' }))) as never,
    },
  })

describe('documentos do portal', () => {
  it('lista com título, descrição, arquivo e tamanho; o menu tem o item Documentos', async () => {
    renderizar(comLista(), '/documentos')
    const lista = await screen.findByRole('list', { name: 'Documentos' })
    expect(within(lista).getByText('Guia rápido do portal')).toBeInTheDocument()
    expect(within(lista).getByText('Passo a passo para abrir chamados')).toBeInTheDocument()
    expect(within(lista).getByText(/guia\.pdf · 320 KB/)).toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(menu).getByRole('link', { name: /Documentos/ })).toBeInTheDocument()
  })

  it('sem documentos, explica; busca sem resultado, também', async () => {
    renderizar(comLista([]), '/documentos')
    expect(await screen.findByText('Nenhum documento ainda')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('Buscar documentos'), 'xyz')
    expect(await screen.findByText('Nenhum documento encontrado')).toBeInTheDocument()
  })

  it('a busca consulta a API com o termo', async () => {
    const servicos = comLista()
    renderizar(servicos, '/documentos')
    await screen.findByRole('list', { name: 'Documentos' })
    await userEvent.setup().type(screen.getByLabelText('Buscar documentos'), 'guia')
    await waitFor(() =>
      expect(servicos.documentos.listar).toHaveBeenLastCalledWith({ busca: 'guia', pagina: 1 }),
    )
  })

  it('baixar pede a URL à API e mostra o erro quando falha', async () => {
    const baixar = vi.fn(async () =>
      falha({
        codigo: 'documento_nao_encontrado',
        mensagem: 'Documento não encontrado.',
        status: 404,
      }),
    )
    renderizar(comLista([documento()], baixar), '/documentos')
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Baixar Guia rápido do portal' }))
    await waitFor(() => expect(baixar).toHaveBeenCalledWith(id(70)))
    expect(await screen.findByText('Documento não encontrado.')).toBeInTheDocument()
  })
})
