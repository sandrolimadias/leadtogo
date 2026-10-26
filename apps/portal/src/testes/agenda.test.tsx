import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { evento, falha, id, ok, renderizar, servicosFalsos } from './fakes'

const comEventos = (itens = [evento()], troca: Record<string, unknown> = {}) =>
  servicosFalsos({
    eventos: {
      ...servicosFalsos().eventos,
      listar: vi.fn(async () => ok({ itens, total: itens.length })),
      proximos: vi.fn(async () => ok({ itens })),
      ...troca,
    },
  })

describe('agenda', () => {
  it('lista o evento com data, horário, local, vagas e o convite a confirmar; o menu tem Agenda', async () => {
    renderizar(comEventos(), '/agenda')
    const cartao = await screen.findByRole('article', { name: 'Encontro anual de clientes 2026' })
    expect(within(cartao).getByText('Auditório da sede')).toBeInTheDocument()
    expect(
      within(cartao).getByText('8 vagas restantes · Vagas da sua empresa: 0 de 2'),
    ).toBeInTheDocument()
    expect(within(cartao).getByText('Confirme presença')).toBeInTheDocument()
    expect(within(cartao).getByText('troca').tagName).toBe('STRONG')
    expect(within(cartao).getByRole('link', { name: /Adicionar à agenda/ })).toHaveAttribute(
      'href',
      `/v1/portal/eventos/${id(80)}/ics`,
    )
    const menu = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(menu).getByRole('link', { name: /Agenda/ })).toBeInTheDocument()
  })

  it('confirmar presença chama a API e recarrega a lista', async () => {
    const confirmar = vi.fn(async () =>
      ok(
        evento({
          minhaSituacao: 'confirmado',
          podeConfirmar: false,
          podeCancelar: true,
          vagasRestantes: 7,
        }),
      ),
    )
    const servicos = comEventos([evento()], { confirmar })
    renderizar(servicos, '/agenda')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Confirmar presença' }))
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(id(80)))
    await waitFor(() => expect(servicos.eventos.listar).toHaveBeenCalledTimes(2))
  })

  it('"Você vai" mostra o cancelamento; lista de espera mostra "Sair da lista"', async () => {
    const cancelar = vi.fn(async () => ok(evento()))
    renderizar(
      comEventos(
        [
          evento({ minhaSituacao: 'confirmado', podeConfirmar: false, podeCancelar: true }),
          evento({
            id: id(81),
            titulo: 'Treinamento: novo módulo',
            minhaSituacao: 'lista_espera',
            lotado: true,
            vagasRestantes: 0,
            podeConfirmar: false,
            podeCancelar: true,
          }),
        ],
        { cancelar },
      ),
      '/agenda',
    )
    const primeiro = await screen.findByRole('article', { name: 'Encontro anual de clientes 2026' })
    expect(within(primeiro).getByText('Você vai')).toBeInTheDocument()
    await userEvent
      .setup()
      .click(within(primeiro).getByRole('button', { name: 'Cancelar presença' }))
    await waitFor(() => expect(cancelar).toHaveBeenCalledWith(id(80)))
    const segundo = screen.getByRole('article', { name: 'Treinamento: novo módulo' })
    expect(within(segundo).getByText('Na lista de espera')).toBeInTheDocument()
    expect(within(segundo).getByText(/Sem vagas/)).toBeInTheDocument()
    expect(
      within(segundo).getByRole('button', { name: 'Sair da lista de espera' }),
    ).toBeInTheDocument()
  })

  it('lotado oferece a lista de espera; vagas da empresa esgotadas também', async () => {
    renderizar(
      comEventos([
        evento({ lotado: true, vagasRestantes: 0 }),
        evento({
          id: id(82),
          titulo: 'Café técnico',
          vagasDaEmpresa: { limite: 1, confirmados: 1 },
        }),
      ]),
      '/agenda',
    )
    const lotado = await screen.findByRole('article', { name: 'Encontro anual de clientes 2026' })
    expect(within(lotado).getByText('Lotado · lista de espera')).toBeInTheDocument()
    expect(
      within(lotado).getByRole('button', { name: 'Entrar na lista de espera' }),
    ).toBeInTheDocument()
    const cafe = screen.getByRole('article', { name: 'Café técnico' })
    expect(within(cafe).getByText(/Vagas da sua empresa esgotadas/)).toBeInTheDocument()
    expect(
      within(cafe).getByRole('button', { name: 'Entrar na lista de espera' }),
    ).toBeInTheDocument()
  })

  it('evento cancelado, prazo encerrado e já encerrado não têm botão de confirmar', async () => {
    renderizar(
      comEventos([
        evento({ cancelado: true, podeConfirmar: false, motivoDoBloqueio: 'evento_cancelado' }),
        evento({
          id: id(83),
          titulo: 'Prazo vencido',
          podeConfirmar: false,
          motivoDoBloqueio: 'prazo_encerrado',
        }),
        evento({
          id: id(84),
          titulo: 'Já começou',
          podeConfirmar: false,
          motivoDoBloqueio: 'evento_encerrado',
        }),
      ]),
      '/agenda',
    )
    await screen.findByRole('article', { name: 'Prazo vencido' })
    expect(screen.queryByRole('button', { name: /Confirmar presença|lista de espera/ })).toBeNull()
    expect(screen.getByText('Este evento foi cancelado pela equipe.')).toBeInTheDocument()
    expect(screen.getByText('Prazo encerrado')).toBeInTheDocument()
    expect(screen.getByText('Encerrado')).toBeInTheDocument()
  })

  it('erro ao confirmar mostra a mensagem da API', async () => {
    const confirmar = vi.fn(async () =>
      falha({
        codigo: 'prazo_encerrado',
        mensagem: 'O prazo para confirmar presença neste evento terminou.',
        status: 409,
      }),
    )
    renderizar(comEventos([evento()], { confirmar }), '/agenda')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Confirmar presença' }))
    expect(
      await screen.findByText('O prazo para confirmar presença neste evento terminou.'),
    ).toBeInTheDocument()
  })

  it('sem eventos, explica; a aba Passados consulta a API', async () => {
    const listar = vi.fn(async () => ok({ itens: [], total: 0 }))
    renderizar(comEventos([], { listar }), '/agenda')
    expect(await screen.findByText('Nenhum evento por vir')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Passados' }))
    await waitFor(() => expect(listar).toHaveBeenLastCalledWith('passados', 1))
    expect(await screen.findByText('Nenhum evento passado')).toBeInTheDocument()
  })

  it('o Início mostra os próximos eventos com a situação de cada um', async () => {
    renderizar(
      comEventos([
        evento({ minhaSituacao: 'confirmado', podeConfirmar: false, podeCancelar: true }),
        evento({ id: id(85), titulo: 'Treinamento: novo módulo', lotado: true, vagasRestantes: 0 }),
      ]),
      '/',
    )
    const painel = await screen.findByRole('region', { name: 'Próximos eventos' })
    expect(within(painel).getByText('Encontro anual de clientes 2026')).toBeInTheDocument()
    expect(within(painel).getByText('Você vai')).toBeInTheDocument()
    expect(within(painel).getByText('Lotado · lista de espera')).toBeInTheDocument()
  })

  it('o Início não mostra o painel quando não há eventos', async () => {
    renderizar(comEventos([]), '/')
    await screen.findByText('Publicações da equipe')
    expect(screen.queryByRole('region', { name: 'Próximos eventos' })).toBeNull()
  })
})
