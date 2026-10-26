import type { AcessoDoPortal, IndicadoresDoHub, PedidoDeAcesso } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { chamadoCompleto, id, itemDeChamado, meComChamados } from '../chamados/fixtures'

const PORTAL = { 'portal.ver': true, 'portal.acessos': true, 'portal.configurar': true } as const

const indicadores = (extra: Partial<IndicadoresDoHub> = {}): IndicadoresDoHub => ({
  periodoDias: 30,
  emAberto: 5,
  prazoEstourando: 1,
  primeiraRespostaNoPrazo: 92,
  notaMedia: 4.7,
  avaliacoes: 23,
  acessosAtivos: 8,
  pedidosPendentes: 0,
  ...extra,
})

const acesso = (extra: Partial<AcessoDoPortal> = {}): AcessoDoPortal => ({
  id: id(300),
  contato: { id: id(301), nome: 'Sérgio Nunes' },
  empresaCliente: { id: id(302), nome: 'Caldeiraria Anchieta' },
  email: 'sergio@anchieta.com.br',
  papel: 'responsavel',
  situacao: 'ativo',
  convidadoEm: '2026-10-01T10:00:00.000Z',
  aceitoEm: '2026-10-02T10:00:00.000Z',
  ultimoAcessoEm: '2026-10-20T10:00:00.000Z',
  conviteVencido: false,
  ...extra,
})

const pedido = (extra: Partial<PedidoDeAcesso> = {}): PedidoDeAcesso => ({
  id: id(310),
  empresaCliente: { id: id(302), nome: 'Caldeiraria Anchieta' },
  pedidoPor: { id: id(301), nome: 'Sérgio Nunes' },
  nome: 'Joana Souza',
  email: 'joana@anchieta.com.br',
  cargo: 'Financeiro',
  situacao: 'pendente',
  criadoEm: '2026-10-21T10:00:00.000Z',
  ...extra,
})

function servicos(
  troca: Record<string, unknown> = {},
  permissoes: Record<string, true> = { ...PORTAL },
) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados({ 'chamados.ver': 'todas', ...permissoes }),
    portal: {
      ...base.portal,
      indicadores: vi.fn(async () => ok(indicadores())),
      configuracao: {
        ...base.portal.configuracao,
        obter: vi.fn(async () =>
          ok({
            ativo: true,
            nome: 'Dias Automação',
            logoUrl: null,
            exigeDoisFatoresDoResponsavel: false,
          }),
        ),
      },
      ...troca,
    },
    chamados: {
      ...base.chamados,
      listar: vi.fn(async () =>
        ok({
          itens: [
            itemDeChamado({
              origem: 'portal',
              codigo: 'CH-0044',
              assunto: 'Inversor da ponte rolante desarmando',
              solicitante: { tipo: 'contato', nome: 'Sérgio Nunes' },
              empresaCliente: { id: id(302), nome: 'Caldeiraria Anchieta' },
            }),
          ],
          total: 1,
          abas: { triagem: 0, pendentes: 1, meus: 0, todos: 1 },
        }),
      ),
    },
  })
}

describe('hub do portal: chamados', () => {
  it('mostra os quatro indicadores e os chamados dos clientes (filtrados por origem portal)', async () => {
    const s = servicos()
    renderizar(s, '/portal')
    const painel = await screen.findByRole('region', { name: 'Indicadores' })
    expect(within(painel).getByText('Em aberto')).toBeInTheDocument()
    expect(within(painel).getByText('92%')).toBeInTheDocument()
    expect(within(painel).getByText('4,7')).toBeInTheDocument()
    expect(within(painel).getByText('23 avaliações em 30 dias')).toBeInTheDocument()
    const lista = await screen.findByRole('list', { name: 'Chamados dos clientes' })
    expect(within(lista).getByText('Inversor da ponte rolante desarmando')).toBeInTheDocument()
    expect(within(lista).getByText(/Sérgio Nunes pelo portal/)).toBeInTheDocument()
    await waitFor(() =>
      expect(s.chamados.listar).toHaveBeenCalledWith(
        expect.objectContaining({ aba: 'todos', origem: 'portal' }),
      ),
    )
  })

  it('sem permissão do portal, volta ao início; o menu só mostra o item a quem tem portal.ver', async () => {
    const { historico } = renderizar(servicos({}, {}), '/portal')
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('avisa quando o portal está desligado', async () => {
    const base = servicosFalsos()
    const s = servicos({
      configuracao: {
        ...base.portal.configuracao,
        obter: vi.fn(async () =>
          ok({ ativo: false, nome: null, logoUrl: null, exigeDoisFatoresDoResponsavel: false }),
        ),
      },
    })
    renderizar(s, '/portal')
    expect(await screen.findByText(/Portal desligado/)).toBeInTheDocument()
  })

  it('sem chamados de cliente, explica', async () => {
    const s = servicos()
    s.chamados.listar = vi.fn(async () =>
      ok({ itens: [], total: 0, abas: { triagem: 0, pendentes: 0, meus: 0, todos: 0 } }),
    )
    renderizar(s, '/portal')
    expect(await screen.findByText('Nenhum chamado de cliente')).toBeInTheDocument()
  })
})

describe('hub do portal: acessos', () => {
  it('lista os acessos, mostra o selo de pedidos pendentes e suspende um acesso', async () => {
    const alterar = vi.fn(async () => ok(acesso({ situacao: 'suspenso' })))
    const base = servicosFalsos()
    const s = servicos({
      acessos: {
        ...base.portal.acessos,
        listar: vi.fn(async () =>
          ok({
            itens: [
              acesso(),
              acesso({
                id: id(303),
                contato: { id: id(304), nome: 'Ana Lyra' },
                situacao: 'convidado',
                papel: 'colega',
              }),
            ],
            total: 2,
          }),
        ),
        alterar,
        reenviar: vi.fn(async () => ok(acesso())),
      },
      pedidos: {
        ...base.portal.pedidos,
        listar: vi.fn(async () => ok({ itens: [pedido()], total: 1 })),
      },
    })
    renderizar(s, '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Acessos/ }))
    const lista = await screen.findByRole('list', { name: 'Acessos ao portal' })
    expect(within(lista).getByText('Sérgio Nunes')).toBeInTheDocument()
    expect(within(lista).getByText('Convite enviado')).toBeInTheDocument()
    await usuario.click(within(lista).getByRole('button', { name: 'Suspender' }))
    await waitFor(() => expect(alterar).toHaveBeenCalledWith(id(300), { situacao: 'suspenso' }))
    await usuario.click(within(lista).getByRole('button', { name: 'Reenviar convite' }))
    await waitFor(() => expect(s.portal.acessos.reenviar).toHaveBeenCalledWith(id(303)))
  })

  it('revoga só depois de confirmar', async () => {
    const revogar = vi.fn(async () => ok(undefined))
    const base = servicosFalsos()
    const s = servicos({
      acessos: {
        ...base.portal.acessos,
        listar: vi.fn(async () => ok({ itens: [acesso()], total: 1 })),
        revogar,
      },
    })
    renderizar(s, '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Acessos/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Revogar' }))
    expect(revogar).not.toHaveBeenCalled()
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Revogar acesso' }))
    await waitFor(() => expect(revogar).toHaveBeenCalledWith(id(300)))
  })

  it('aprova e recusa (com motivo) os pedidos de acesso dos colegas', async () => {
    const tratar = vi.fn(async () => ok(undefined))
    const base = servicosFalsos()
    const s = servicos({
      pedidos: {
        listar: vi.fn(async () => ok({ itens: [pedido()], total: 1 })),
        tratar,
      },
      acessos: { ...base.portal.acessos, listar: vi.fn(async () => ok({ itens: [], total: 0 })) },
    })
    renderizar(s, '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Acessos/ }))
    const secao = await screen.findByRole('region', { name: 'Pedidos de acesso' })
    expect(within(secao).getByText(/Joana Souza/)).toBeInTheDocument()
    await usuario.click(within(secao).getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(tratar).toHaveBeenCalledWith(id(310), { decisao: 'aprovar' }))
    await usuario.click(within(secao).getByRole('button', { name: 'Recusar' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Motivo (opcional)'), 'Fora do contrato')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Recusar pedido' }))
    await waitFor(() =>
      expect(tratar).toHaveBeenLastCalledWith(id(310), {
        decisao: 'recusar',
        motivo: 'Fora do contrato',
      }),
    )
  })

  it('dar acesso: escolhe a empresa, o contato e o papel e envia o convite', async () => {
    const dar = vi.fn(async () => ok(acesso({ situacao: 'convidado' })))
    const base = servicosFalsos()
    const s = servicos({
      acessos: {
        ...base.portal.acessos,
        listar: vi.fn(async () => ok({ itens: [], total: 0 })),
        dar,
      },
    })
    s.carteira.listar = vi.fn(async () =>
      ok({ itens: [{ id: id(302), nome: 'Caldeiraria Anchieta' }] } as never),
    )
    s.contatos.daEmpresa = vi.fn(async () =>
      ok([
        {
          id: id(301),
          nome: 'Sérgio Nunes',
          papelDecisao: null,
          cargo: 'Gerente',
          principal: true,
          ativo: true,
          telefone: null,
          temWhatsapp: false,
          email: 's@a.com',
          naoQuerContato: false,
        },
        {
          id: id(399),
          nome: 'Ex-funcionário',
          papelDecisao: null,
          cargo: null,
          principal: false,
          ativo: false,
          telefone: null,
          temWhatsapp: false,
          email: null,
          naoQuerContato: false,
        },
      ]),
    )
    renderizar(s, '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Acessos/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Dar acesso' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Empresa-cliente'), 'Anchieta')
    await usuario.click(
      await within(dialogo).findByRole('button', { name: 'Caldeiraria Anchieta' }),
    )
    const contato = await within(dialogo).findByLabelText('Contato')
    // só o contato ativo da empresa aparece
    expect(within(contato).queryByText(/Ex-funcionário/)).toBeNull()
    await usuario.selectOptions(contato, id(301))
    await usuario.selectOptions(within(dialogo).getByLabelText('Papel no portal'), 'responsavel')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() =>
      expect(dar).toHaveBeenCalledWith({
        contatoId: id(301),
        empresaClienteId: id(302),
        papel: 'responsavel',
      }),
    )
  })

  it('mostra o erro da API ao dar acesso (portal desligado)', async () => {
    const dar = vi.fn(async () =>
      falha('portal_desligado', 'Ligue o portal do cliente antes de convidar.', 409),
    )
    const base = servicosFalsos()
    const s = servicos({
      acessos: {
        ...base.portal.acessos,
        listar: vi.fn(async () => ok({ itens: [], total: 0 })),
        dar,
      },
    })
    s.carteira.listar = vi.fn(async () =>
      ok({ itens: [{ id: id(302), nome: 'Caldeiraria Anchieta' }] } as never),
    )
    s.contatos.daEmpresa = vi.fn(async () =>
      ok([
        {
          id: id(301),
          nome: 'Sérgio Nunes',
          papelDecisao: null,
          cargo: null,
          principal: true,
          ativo: true,
          telefone: null,
          temWhatsapp: false,
          email: null,
          naoQuerContato: false,
        },
      ]),
    )
    renderizar(s, '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Acessos/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Dar acesso' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Empresa-cliente'), 'Anchieta')
    await usuario.click(
      await within(dialogo).findByRole('button', { name: 'Caldeiraria Anchieta' }),
    )
    await usuario.selectOptions(await within(dialogo).findByLabelText('Contato'), id(301))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar convite' }))
    expect(
      await within(dialogo).findByText('Ligue o portal do cliente antes de convidar.'),
    ).toBeInTheDocument()
  })

  it('quem só vê (sem portal.acessos) não tem botões de gestão', async () => {
    const base = servicosFalsos()
    const s = servicos(
      {
        acessos: {
          ...base.portal.acessos,
          listar: vi.fn(async () => ok({ itens: [acesso()], total: 1 })),
        },
      },
      { 'portal.ver': true },
    )
    renderizar(s, '/portal')
    await userEvent.setup().click(await screen.findByRole('tab', { name: /Acessos/ }))
    await screen.findByRole('list', { name: 'Acessos ao portal' })
    expect(screen.queryByRole('button', { name: 'Dar acesso' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revogar' })).toBeNull()
  })
})

describe('configurações do portal', () => {
  it('liga o portal, muda o nome e exige o 2FA do Responsável', async () => {
    const atualizar = vi.fn(async (dados: Record<string, unknown>) =>
      ok({
        ativo: true,
        nome: null,
        logoUrl: null,
        exigeDoisFatoresDoResponsavel: false,
        ...dados,
      }),
    )
    const base = servicosFalsos()
    const s = servicos({
      configuracao: {
        obter: vi.fn(async () =>
          ok({ ativo: false, nome: null, logoUrl: null, exigeDoisFatoresDoResponsavel: false }),
        ),
        atualizar,
      },
      indicadores: base.portal.indicadores,
    })
    renderizar(s, '/configuracoes/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('switch', { name: 'Portal ligado' }))
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith({ ativo: true }))
    await usuario.type(screen.getByLabelText(/Nome mostrado no topo/), 'Dias Automação')
    await usuario.click(screen.getByRole('button', { name: 'Salvar nome' }))
    await waitFor(() => expect(atualizar.mock.calls).toHaveLength(2))
    expect(atualizar.mock.calls[1]).toEqual([{ nome: 'Dias Automação' }])
    await usuario.click(screen.getByRole('switch', { name: /Exigir verificação em duas etapas/ }))
    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith({ exigeDoisFatoresDoResponsavel: true }),
    )
  })
})

describe('chamado do portal na central', () => {
  const doPortal = (extra = {}) =>
    chamadoCompleto({
      origem: 'portal',
      status: 'em_atendimento',
      solicitante: { tipo: 'contato', nome: 'Sérgio Nunes' },
      empresaCliente: { id: id(302), nome: 'Caldeiraria Anchieta' },
      acoes: {
        responder: true,
        notaInterna: true,
        triar: false,
        atribuir: false,
        assumir: false,
        alterarStatus: true,
        reabrir: false,
        statusPossiveis: ['aguardando_cliente', 'resolvido'],
      },
      ...extra,
    })

  function central(c = doPortal()) {
    const base = servicosFalsos()
    return servicosFalsos({
      me: async () =>
        meComChamados({
          'chamados.ver': 'todas',
          'chamados.atender': 'todas',
          'atividades.criar': true,
        }),
      chamados: {
        ...base.chamados,
        obter: vi.fn(async () => ok(c)),
        mensagem: vi.fn(async () => ok(c)),
        aguardarCliente: vi.fn(async () => ok({ ...c, status: 'aguardando_cliente' as const })),
        tarefas: {
          listar: vi.fn(async () => ok({ itens: [] })),
          criar: vi.fn(async () =>
            ok({
              itens: [
                {
                  id: id(700),
                  titulo: 'Enviar peça',
                  situacao: 'pendente',
                  responsavel: { id: id(9), nome: 'Maria' },
                  dataInicio: '2026-10-25T12:00:00.000Z',
                },
              ],
            }),
          ),
        },
      },
    })
  }

  it('"Aguardar resposta do cliente" vem marcada e manda a mensagem e muda o estado numa ação só', async () => {
    const s = central()
    renderizar(s, `/chamados/${id(1)}`)
    const usuario = userEvent.setup()
    const caixa = await screen.findByLabelText(/^Aguardar resposta do cliente/)
    expect(caixa).toBeChecked()
    await usuario.type(
      screen.getByRole('textbox', { name: 'Responder' }),
      'Mande o contrato social, por favor.',
    )
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() =>
      expect(s.chamados.aguardarCliente).toHaveBeenCalledWith(id(1), {
        corpo: 'Mande o contrato social, por favor.',
        anexoIds: [],
      }),
    )
    expect(s.chamados.mensagem).not.toHaveBeenCalled()
  })

  it('desmarcando, envia só a mensagem; chamado interno nem mostra a opção', async () => {
    const s = central()
    const { unmount } = renderizar(s, `/chamados/${id(1)}`)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByLabelText(/^Aguardar resposta do cliente/))
    await usuario.type(screen.getByRole('textbox', { name: 'Responder' }), 'Estamos verificando.')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(s.chamados.mensagem).toHaveBeenCalled())
    expect(s.chamados.aguardarCliente).not.toHaveBeenCalled()
    unmount()

    renderizar(central(doPortal({ origem: 'interna' })), `/chamados/${id(1)}`)
    await screen.findByRole('textbox', { name: 'Responder' })
    expect(screen.queryByLabelText(/^Aguardar resposta do cliente/)).toBeNull()
  })

  it('"Criar tarefa" liga uma atividade ao chamado e mostra na lista', async () => {
    const s = central()
    renderizar(s, `/chamados/${id(1)}`)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Criar tarefa' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Título'), 'Enviar peça')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Criar tarefa' }))
    await waitFor(() =>
      expect(s.chamados.tarefas.criar).toHaveBeenCalledWith(id(1), { titulo: 'Enviar peça' }),
    )
    expect(await screen.findByText('Enviar peça')).toBeInTheDocument()
  })

  it('sem permissão de registrar atividades não oferece "Criar tarefa"', async () => {
    const base = central()
    base.me = async () => meComChamados({ 'chamados.ver': 'todas', 'chamados.atender': 'todas' })
    renderizar(base, `/chamados/${id(1)}`)
    await screen.findByRole('textbox', { name: 'Responder' })
    expect(screen.queryByRole('button', { name: 'Criar tarefa' })).toBeNull()
  })
})
