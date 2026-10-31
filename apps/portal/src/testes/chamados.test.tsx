import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { chamado, falha, id, inicioVazio, item, ok, renderizar, servicosFalsos } from './fakes'

describe('início', () => {
  it('mostra os números, o alerta de "aguardando você" e os chamados recentes', async () => {
    const servicos = servicosFalsos({
      inicio: vi.fn(async () =>
        ok({ chamadosAbertos: 3, aguardandoVoce: 1, resolvidosParaAvaliar: 2, recentes: [item()] }),
      ),
    })
    renderizar(servicos, '/')
    expect(await screen.findByText(/1 chamado aguardando a sua resposta/)).toBeInTheDocument()
    expect(screen.getByText('Segunda via do boleto de outubro')).toBeInTheDocument()
    expect(screen.getByText('Aguardando sua resposta')).toBeInTheDocument()
    const resumo = screen.getByRole('region', { name: 'Resumo' })
    expect(within(resumo).getByText('3')).toBeInTheDocument()
  })

  it('sem chamados, convida a abrir o primeiro', async () => {
    renderizar(servicosFalsos({ inicio: vi.fn(async () => ok(inicioVazio)) }), '/')
    expect(await screen.findByText('Nenhum chamado ainda')).toBeInTheDocument()
  })

  it('o menu leva às telas e mostra o que pede atenção', async () => {
    const servicos = servicosFalsos({
      inicio: vi.fn(async () => ok({ ...inicioVazio, aguardandoVoce: 2 })),
      notificacoes: {
        ...servicosFalsos().notificacoes,
        listar: vi.fn(async () => ok({ itens: [], naoLidas: 4 })),
      },
    })
    const { historico } = renderizar(servicos, '/')
    const menu = await screen.findByRole('navigation', { name: 'Principal' })
    expect(await within(menu).findByLabelText('2 pendentes')).toBeInTheDocument()
    expect(await within(menu).findByLabelText('4 pendentes')).toBeInTheDocument()
    await userEvent.setup().click(within(menu).getByRole('link', { name: /Notificações/ }))
    await waitFor(() => expect(historico.location.pathname).toBe('/notificacoes'))
  })
})

describe('lista de chamados', () => {
  it('lista, troca para "Todos" e busca', async () => {
    const listar = vi.fn(async () =>
      ok({ itens: [item()], total: 1, abas: { abertos: 1, todos: 5 } }),
    )
    const servicos = servicosFalsos({ chamados: { ...servicosFalsos().chamados, listar } })
    renderizar(servicos, '/chamados')
    expect(await screen.findByText('CH-0042')).toBeInTheDocument()
    const usuario = userEvent.setup()
    await usuario.click(screen.getByRole('button', { name: /Todos \(5\)/ }))
    await waitFor(() => expect(listar).toHaveBeenCalledWith({ aba: 'todos', busca: '', pagina: 1 }))
    await usuario.type(screen.getByLabelText('Buscar chamados'), 'boleto')
    await waitFor(() =>
      expect(listar).toHaveBeenLastCalledWith({ aba: 'todos', busca: 'boleto', pagina: 1 }),
    )
  })

  it('sem resultados, explica', async () => {
    renderizar(servicosFalsos(), '/chamados')
    expect(await screen.findByText('Nenhum chamado em aberto')).toBeInTheDocument()
  })
})

/** Há dois "Abrir chamado" na tela (cabeçalho e formulário): o do formulário é o que envia. */
const botaoDoFormulario = () =>
  screen
    .getAllByRole('button', { name: 'Abrir chamado' })
    .find((b) => b.getAttribute('type') === 'submit') as HTMLElement

describe('abrir chamado', () => {
  it('envia assunto, área e descrição e abre o chamado criado', async () => {
    const abrir = vi.fn(async () => ok(chamado({ id: id(77), codigo: 'CH-0077' })))
    const servicos = servicosFalsos({ chamados: { ...servicosFalsos().chamados, abrir } })
    const { historico } = renderizar(servicos, '/chamados/novo')
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText(/^Assunto/), 'Nota fiscal com erro')
    await usuario.selectOptions(await screen.findByLabelText('Área'), 'Financeiro')
    await usuario.type(screen.getByLabelText('Descrição'), 'O valor veio trocado')
    await usuario.click(botaoDoFormulario())
    await waitFor(() =>
      expect(abrir).toHaveBeenCalledWith({
        assunto: 'Nota fiscal com erro',
        descricao: 'O valor veio trocado',
        areaId: id(40),
      }),
    )
    await waitFor(() => expect(historico.location.pathname).toBe(`/chamados/${id(77)}`))
  })

  it('"Não sei" manda sem área (vai para a triagem); assunto curto não envia', async () => {
    const abrir = vi.fn(async () => ok(chamado()))
    const servicos = servicosFalsos({ chamados: { ...servicosFalsos().chamados, abrir } })
    renderizar(servicos, '/chamados/novo')
    const usuario = userEvent.setup()
    await screen.findByLabelText(/^Assunto/)
    expect(botaoDoFormulario()).toBeDisabled()
    await usuario.type(screen.getByLabelText(/^Assunto/), 'Sem área')
    await usuario.click(botaoDoFormulario())
    await waitFor(() =>
      expect(abrir).toHaveBeenCalledWith({ assunto: 'Sem área', descricao: null, areaId: null }),
    )
  })

  it('mostra o erro da API sem sair da tela', async () => {
    const abrir = vi.fn(async () =>
      falha({ codigo: 'area_invalida', mensagem: 'A área não está disponível.', status: 400 }),
    )
    renderizar(
      servicosFalsos({ chamados: { ...servicosFalsos().chamados, abrir } }),
      '/chamados/novo',
    )
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText(/^Assunto/), 'Algum assunto')
    await usuario.click(botaoDoFormulario())
    expect(await screen.findByText('A área não está disponível.')).toBeInTheDocument()
  })
})

describe('detalhe do chamado', () => {
  const ABERTO = id(10)

  it('mostra a conversa, o estado do cliente e avisa que a equipe aguarda', async () => {
    renderizar(servicosFalsos(), `/chamados/${ABERTO}`)
    expect(
      await screen.findByRole('heading', { name: 'Segunda via do boleto de outubro' }),
    ).toBeInTheDocument()
    expect(screen.getByText('A equipe aguarda a sua resposta.')).toBeInTheDocument()
    // o balão quebra link ou palavra longa em vez de vazar
    expect(screen.getByText('Qual o CNPJ da filial?')).toHaveClass('[overflow-wrap:anywhere]')
    // nada interno aparece
    expect(screen.queryByText(/nota interna|prioridade|responsável pelo/i)).not.toBeInTheDocument()
  })

  it('responde com texto e anexo; o anexo sobe ao escolher e vai junto da mensagem', async () => {
    const responder = vi.fn(async () => ok(chamado({ estado: 'em_atendimento' })))
    const anexar = vi.fn(async (_i: string, arquivo: File) =>
      ok({ anexoId: id(51), nome: arquivo.name }),
    )
    const base = servicosFalsos()
    renderizar(
      servicosFalsos({ chamados: { ...base.chamados, responder, anexar } }),
      `/chamados/${ABERTO}`,
    )
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Sua resposta'), 'O CNPJ é 12.345.678/0001-90')
    await usuario.upload(
      screen.getByLabelText('Escolher arquivos'),
      new File(['x'], 'contrato.pdf', { type: 'application/pdf' }),
    )
    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() =>
      expect(responder).toHaveBeenCalledWith(ABERTO, {
        corpo: 'O CNPJ é 12.345.678/0001-90',
        anexoIds: [id(51)],
      }),
    )
    // depois de enviar, o campo esvazia
    await waitFor(() => expect(screen.getByLabelText('Sua resposta')).toHaveValue(''))
  })

  it('anexo que o antivírus ainda verifica mostra o estado; o limpo baixa pelo link curto', async () => {
    const obter = vi.fn(async () =>
      ok(
        chamado({
          mensagens: [
            {
              id: id(21),
              autor: { nome: 'Daniel Prates', daEquipe: false, voce: true },
              corpo: 'Seguem os arquivos',
              anexos: [
                {
                  id: id(60),
                  nome: 'limpo.pdf',
                  mime: 'application/pdf',
                  tamanho: 2048,
                  estado: 'limpo',
                },
                {
                  id: id(61),
                  nome: 'novo.pdf',
                  mime: 'application/pdf',
                  tamanho: 4096,
                  estado: 'pendente_varredura',
                },
              ],
              criadoEm: '2026-10-21T12:00:00.000Z',
            },
          ],
        }),
      ),
    )
    const baixar = vi.fn(async () => ok({ url: 'about:blank#baixado' }))
    const base = servicosFalsos()
    renderizar(
      servicosFalsos({ chamados: { ...base.chamados, obter, baixar } }),
      `/chamados/${ABERTO}`,
    )
    expect(await screen.findByText('Verificando')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Baixar limpo.pdf' }))
    await waitFor(() => expect(baixar).toHaveBeenCalledWith(ABERTO, id(60)))
  })

  it('resolvido: oferece reabrir (até 7 dias) e avaliar com nota', async () => {
    const resolvido = chamado({
      estado: 'resolvido',
      acoes: { responder: false, reabrir: true, avaliar: true },
    })
    const reabrir = vi.fn(async () => ok(chamado({ estado: 'em_atendimento' })))
    const avaliar = vi.fn(async () =>
      ok({
        ...resolvido,
        avaliacao: { nota: 4, comentario: 'Bom', criadaEm: '2026-10-22T10:00:00.000Z' },
        acoes: { ...resolvido.acoes, avaliar: false },
      }),
    )
    const base = servicosFalsos()
    renderizar(
      servicosFalsos({
        chamados: { ...base.chamados, obter: vi.fn(async () => ok(resolvido)), reabrir, avaliar },
      }),
      `/chamados/${ABERTO}`,
    )
    const usuario = userEvent.setup()
    expect(await screen.findByText('Este chamado foi resolvido.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Sua resposta')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Enviar avaliação' })).toBeDisabled()
    await usuario.click(screen.getByRole('button', { name: '4 estrelas' }))
    await usuario.type(screen.getByLabelText('Comentário'), 'Bom')
    await usuario.click(screen.getByRole('button', { name: 'Enviar avaliação' }))
    await waitFor(() =>
      expect(avaliar).toHaveBeenCalledWith(ABERTO, { nota: 4, comentario: 'Bom' }),
    )
    expect(await screen.findByText('Sua avaliação')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Reabrir' }))
    await waitFor(() => expect(reabrir).toHaveBeenCalledWith(ABERTO))
  })

  it('fora do prazo de reabertura não oferece o botão; fechado só informa', async () => {
    const fechado = chamado({
      estado: 'fechado',
      acoes: { responder: false, reabrir: false, avaliar: false },
    })
    const base = servicosFalsos()
    renderizar(
      servicosFalsos({ chamados: { ...base.chamados, obter: vi.fn(async () => ok(fechado)) } }),
      `/chamados/${ABERTO}`,
    )
    expect(await screen.findByText('Este chamado está fechado.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument()
  })

  it('chamado de outra empresa (404) mostra a mensagem', async () => {
    const base = servicosFalsos()
    const obter = vi.fn(async () =>
      falha({ codigo: 'chamado_nao_encontrado', mensagem: 'Chamado não encontrado.', status: 404 }),
    )
    renderizar(servicosFalsos({ chamados: { ...base.chamados, obter } }), `/chamados/${id(99)}`)
    expect(await screen.findByText('Chamado não encontrado.')).toBeInTheDocument()
  })
})

describe('notificações', () => {
  it('lista, abre o chamado ao tocar e marca como lida; "marcar todas"', async () => {
    const marcarLida = vi.fn(async () => ok({ naoLidas: 0 }))
    const marcarTodas = vi.fn(async () => ok({ naoLidas: 0 }))
    const servicos = servicosFalsos({
      notificacoes: {
        listar: vi.fn(async () =>
          ok({
            naoLidas: 1,
            itens: [
              {
                id: id(70),
                tipo: 'chamado.mensagem',
                titulo: 'CH-0042 · Nova resposta da equipe',
                corpo: 'Segunda via',
                destino: `/chamados/${id(10)}`,
                lida: false,
                criadaEm: '2026-10-21T12:00:00.000Z',
              },
            ],
          }),
        ),
        marcarLida,
        marcarTodas,
      },
    })
    const { historico } = renderizar(servicos, '/notificacoes')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }))
    await waitFor(() => expect(marcarTodas).toHaveBeenCalled())
    await usuario.click(await screen.findByRole('button', { name: /Nova resposta da equipe/ }))
    await waitFor(() => expect(marcarLida).toHaveBeenCalledWith(id(70)))
    await waitFor(() => expect(historico.location.pathname).toBe(`/chamados/${id(10)}`))
  })

  it('sem notificações, explica', async () => {
    renderizar(servicosFalsos(), '/notificacoes')
    expect(await screen.findByText('Nenhuma notificação')).toBeInTheDocument()
  })
})
