import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  evento,
  falha,
  formularioParaResponder,
  id,
  ok,
  renderizar,
  servicosFalsos,
  servicosSemLogin,
} from './fakes'

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

describe('eventos 2.0 (Fase 4G)', () => {
  it('evento com formulário: "Inscrever-se" abre o formulário preenchido e inscreve', async () => {
    const inscrever = vi.fn(async () =>
      ok(evento({ minhaSituacao: 'confirmado', podeConfirmar: false, podeCancelar: true })),
    )
    const servicos = comEventos([evento({ formularioInscricaoId: id(940) })], { inscrever })
    servicos.formularios.abrir = vi.fn(async () => ok(formularioParaResponder()))
    renderizar(servicos, '/agenda')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Inscrever-se' }))
    const dialogo = await screen.findByRole('dialog', { name: /Inscrição:/ })
    expect(within(dialogo).getByLabelText(/^E-mail/)).toHaveValue('daniel@usidantec.com.br')
    await usuario.selectOptions(within(dialogo).getByLabelText(/Vai ao jantar/), 'sim')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar inscrição' }))
    await waitFor(() =>
      expect(inscrever).toHaveBeenCalledWith(id(80), {
        versao: 2,
        botao: 'enviar',
        respostas: expect.objectContaining({ vai: 'sim' }) as unknown,
      }),
    )
    expect(servicos.eventos.confirmar).not.toHaveBeenCalled()
  })

  it('presente depois do encerramento: "Você esteve lá" e o botão de avaliar', async () => {
    const servicos = comEventos([
      evento({
        minhaSituacao: 'confirmado',
        podeConfirmar: false,
        presente: true,
        avaliar: { formularioId: id(941) },
      }),
    ])
    servicos.eventos.formularioDeAvaliacao = vi.fn(async () =>
      ok(formularioParaResponder({ nome: 'Avaliação', preenchidos: {}, travados: [] })),
    )
    renderizar(servicos, '/agenda')
    const cartao = await screen.findByRole('article', { name: 'Encontro anual de clientes 2026' })
    expect(within(cartao).getByText('Você esteve lá')).toBeInTheDocument()
    await userEvent.setup().click(within(cartao).getByRole('button', { name: 'Avaliar o evento' }))
    expect(await screen.findByRole('dialog', { name: /Avaliação:/ })).toBeInTheDocument()
    expect(servicos.eventos.formularioDeAvaliacao).toHaveBeenCalledWith(id(80))
  })

  it('check-in sem login: o e-mail, depois o código quando o evento pede', async () => {
    const semLogin = vi
      .fn()
      .mockResolvedValueOnce(ok({ situacao: 'codigo_enviado', nome: null }))
      .mockResolvedValueOnce(ok({ situacao: 'registrado', nome: 'Rui Alves' }))
    const servicos = servicosSemLogin({
      checkin: {
        abrir: vi.fn(async () =>
          ok({
            titulo: 'Encontro anual',
            inicioEm: '2026-11-12T21:30:00.000Z',
            local: 'Auditório',
            exigeCodigo: true,
            aberto: true,
          }),
        ),
        logado: vi.fn(),
        semLogin,
      },
    })
    renderizar(servicos, '/checkin/tok')
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText(/E-mail da inscrição/), 'rui@exemplo.com')
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }))
    await usuario.type(await screen.findByLabelText(/Código enviado/), '123 456')
    await usuario.click(screen.getByRole('button', { name: 'Registrar presença' }))
    expect(await screen.findByText('Presença registrada')).toBeInTheDocument()
    expect(semLogin).toHaveBeenLastCalledWith('tok', { email: 'rui@exemplo.com', codigo: '123456' })
  })

  it('check-in logado: um toque', async () => {
    const logado = vi.fn(async () => ok({ situacao: 'registrado' as const, nome: 'Daniel' }))
    const servicos = servicosFalsos({
      checkin: {
        abrir: vi.fn(async () =>
          ok({
            titulo: 'Encontro anual',
            inicioEm: '2026-11-12T21:30:00.000Z',
            local: null,
            exigeCodigo: false,
            aberto: true,
          }),
        ),
        logado,
        semLogin: vi.fn(),
      },
    })
    renderizar(servicos, '/checkin/tok')
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Registrar minha presença' }))
    expect(await screen.findByText('Presença registrada')).toBeInTheDocument()
    expect(logado).toHaveBeenCalledWith('tok')
  })
})
