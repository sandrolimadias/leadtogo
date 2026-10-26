import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ServicosDoPortal } from '@/servicos/tipos'

import { falha, id, ok, publicacao, renderizar, servicosFalsos } from './fakes'

type Publicacoes = ServicosDoPortal['publicacoes']
const comFeed = (itens = [publicacao()], troca: Partial<Publicacoes> = {}) =>
  servicosFalsos({
    publicacoes: {
      ...servicosFalsos().publicacoes,
      feed: vi.fn(async () => ok({ itens, total: itens.length })),
      ...troca,
    },
  })

describe('feed de publicações no início', () => {
  it('mostra o título, o texto em Markdown, as reações e marca como lida', async () => {
    const servicos = comFeed()
    renderizar(servicos, '/')
    const cartao = await screen.findByRole('article', { name: 'Expediente reduzido na sexta' })
    expect(within(cartao).getByText('14h').tagName).toBe('STRONG')
    expect(within(cartao).getByRole('button', { name: /Curtir/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(cartao).getByText('0 comentários')).toBeInTheDocument()
    await waitFor(() => expect(servicos.publicacoes.marcarLidas).toHaveBeenCalledWith([id(50)]))
  })

  it('a fixada mostra o selo; sem publicação, explica', async () => {
    renderizar(comFeed([publicacao({ fixada: true })]), '/')
    expect(await screen.findByText('Fixada')).toBeInTheDocument()
    renderizar(comFeed([]), '/')
    expect(await screen.findByText('Nenhuma publicação ainda')).toBeInTheDocument()
  })

  it('HTML no texto aparece como texto, nunca como elemento', async () => {
    renderizar(
      comFeed([publicacao({ corpo: 'Oi <img src=x onerror=alert(1)> <b>negrito</b>' })]),
      '/',
    )
    const cartao = await screen.findByRole('article')
    expect(cartao.querySelector('img')).toBeNull()
    expect(cartao.querySelector('b')).toBeNull()
    expect(within(cartao).getByText(/<b>negrito<\/b>/)).toBeInTheDocument()
  })

  it('reagir liga a reação e usa o total que a API devolve', async () => {
    const reagir = vi.fn(async () =>
      ok({ reacoes: { curtir: 5, apoiar: 0, parabens: 0 }, minhasReacoes: ['curtir' as const] }),
    )
    const servicos = comFeed([publicacao()], { reagir })
    renderizar(servicos, '/')
    const botao = await screen.findByRole('button', { name: /Curtir/ })
    await userEvent.setup().click(botao)
    await waitFor(() => expect(reagir).toHaveBeenCalledWith(id(50), 'curtir'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Curtir/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    expect(screen.getByRole('button', { name: /Curtir/ })).toHaveTextContent('5')
  })

  it('"Ver publicações anteriores" busca a próxima página', async () => {
    const feed = vi.fn(async (pagina?: number) =>
      pagina === 2
        ? ok({ itens: [publicacao({ id: id(51), titulo: 'Segunda página' })], total: 2 })
        : ok({ itens: [publicacao()], total: 2 }),
    )
    renderizar(servicosFalsos({ publicacoes: { ...servicosFalsos().publicacoes, feed } }), '/')
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Ver publicações anteriores' }))
    expect(await screen.findByText('Segunda página')).toBeInTheDocument()
    expect(feed).toHaveBeenLastCalledWith(2)
  })
})

describe('comentários', () => {
  const comentario = (extra = {}) => ({
    id: id(60),
    autorNome: 'Carlos L.',
    corpo: 'Vai ter transmissão?',
    criadoEm: '2026-10-21T13:00:00.000Z',
    meu: false,
    oculto: false,
    ocultoMotivo: null,
    denunciado: false,
    ...extra,
  })

  it('abre os comentários, mostra o nome reduzido e comenta', async () => {
    const comentar = vi.fn(async (_id: string, corpo: string) =>
      ok(comentario({ id: id(61), autorNome: 'Daniel P.', corpo, meu: true })),
    )
    const comentarios = vi.fn(async () => ok({ itens: [comentario()], comentariosAbertos: true }))
    const servicos = comFeed([publicacao({ comentarios: 1 })], { comentarios, comentar })
    renderizar(servicos, '/')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: /1 comentário/ }))
    expect(await screen.findByText('Carlos L.')).toBeInTheDocument()
    expect(screen.getByText('Vai ter transmissão?')).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Escreva um comentário'), '  Também quero saber  ')
    await usuario.click(screen.getByRole('button', { name: 'Comentar' }))
    await waitFor(() => expect(comentar).toHaveBeenCalledWith(id(50), 'Também quero saber'))
  })

  it('comentários fechados: sem formulário', async () => {
    const comentarios = vi.fn(async () => ok({ itens: [], comentariosAbertos: false }))
    renderizar(comFeed([publicacao({ comentariosAbertos: false })], { comentarios }), '/')
    await userEvent.setup().click(await screen.findByRole('button', { name: /0 comentários/ }))
    expect(await screen.findByText('Os comentários estão fechados.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Escreva um comentário')).toBeNull()
  })

  it('mostra o aviso do comentário oculto só ao autor, e não oferece denunciar o próprio', async () => {
    const comentarios = vi.fn(async () =>
      ok({
        itens: [comentario({ meu: true, oculto: true, ocultoMotivo: 'Propaganda' })],
        comentariosAbertos: true,
      }),
    )
    renderizar(comFeed([publicacao({ comentarios: 1 })], { comentarios }), '/')
    await userEvent.setup().click(await screen.findByRole('button', { name: /1 comentário/ }))
    expect(await screen.findByText(/A equipe ocultou este comentário/)).toBeInTheDocument()
    expect(screen.getByText(/Motivo: Propaganda/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Denunciar/ })).toBeNull()
  })

  it('denuncia um comentário de outro cliente com o motivo escolhido', async () => {
    const denunciar = vi.fn(async () => ok(undefined))
    const comentarios = vi.fn(async () => ok({ itens: [comentario()], comentariosAbertos: true }))
    renderizar(comFeed([publicacao({ comentarios: 1 })], { comentarios, denunciar }), '/')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: /1 comentário/ }))
    await usuario.click(await screen.findByRole('button', { name: /Denunciar/ }))
    const dialogo = await screen.findByRole('dialog', { name: 'Denunciar comentário' })
    await usuario.click(within(dialogo).getByLabelText('Ofensivo'))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar denúncia' }))
    await waitFor(() => expect(denunciar).toHaveBeenCalledWith(id(60), 'ofensivo'))
  })

  it('erro ao comentar mostra a mensagem e mantém o texto', async () => {
    const comentar = vi.fn(async () =>
      falha({
        codigo: 'comentarios_fechados',
        mensagem: 'Os comentários estão fechados nesta publicação.',
        status: 409,
      }),
    )
    renderizar(comFeed([publicacao()], { comentar }), '/')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: /0 comentários/ }))
    await usuario.type(await screen.findByLabelText('Escreva um comentário'), 'Oi')
    await usuario.click(screen.getByRole('button', { name: 'Comentar' }))
    expect(
      await screen.findByText('Os comentários estão fechados nesta publicação.'),
    ).toBeInTheDocument()
  })
})
