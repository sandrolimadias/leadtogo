import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { chamadoCompleto, id, itemDeChamado, meComChamados } from './fixtures'

const abas = (extra: Partial<Record<'triagem' | 'pendentes' | 'meus' | 'todos', number>> = {}) => ({
  triagem: 0,
  pendentes: 2,
  meus: 1,
  todos: 5,
  ...extra,
})

function servicos(permissoes = { 'chamados.ver': 'todas', 'chamados.criar': true } as const) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados({ ...permissoes }),
    chamados: {
      ...base.chamados,
      listar: vi.fn(async () =>
        ok({
          itens: [
            itemDeChamado(),
            itemDeChamado({
              id: id(2),
              numero: 43,
              codigo: 'CH-0043',
              assunto: 'Boleto vencido',
              prioridade: 'urgente',
              status: 'em_atendimento',
              responsavel: { id: id(900), nome: 'Ana Atendente' },
              prazoResposta: {
                metaMin: 60,
                consumidoMin: 300,
                venceEm: '2026-10-20T15:00:00.000Z',
                atrasado: true,
                cumpridoEm: null,
                pausado: false,
              },
            }),
          ],
          total: 2,
          abas: abas(),
        }),
      ),
      areas: {
        listar: vi.fn(async () =>
          ok([
            {
              id: id(10),
              nome: 'Jurídico',
              descricao: null,
              visivelNoPortal: false,
              metaRespostaMin: null,
              metaResolucaoMin: null,
              pulaTriagem: false,
              ativa: true,
              ordem: 0,
              chaveSistema: 'juridico',
              membros: [],
              chamadosAbertos: 0,
            },
          ]),
        ),
      },
      abrir: vi.fn(async () => ok(chamadoCompleto({ id: id(77), codigo: 'CH-0077' }))),
    },
  })
}

describe('Chamados: lista', () => {
  it('mostra as abas com as contagens, os chamados com estado, prioridade, responsável e prazo atrasado', async () => {
    renderizar(servicos(), '/chamados')
    expect(await screen.findByRole('heading', { name: 'Chamados' })).toBeInTheDocument()
    const lista = await screen.findByRole('list', { name: 'Chamados' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(
      within(itens[0] as HTMLElement).getByRole('link', { name: /Revisar contrato do cliente/ }),
    ).toBeInTheDocument()
    expect(within(itens[0] as HTMLElement).getByText('Pendente de atendimento')).toBeInTheDocument()
    expect(within(itens[0] as HTMLElement).getByText('Ninguém ainda')).toBeInTheDocument()
    const segundo = within(itens[1] as HTMLElement)
    expect(segundo.getByText('Urgente')).toBeInTheDocument()
    expect(segundo.getByText('Ana Atendente')).toBeInTheDocument()
    expect(segundo.getByText('Resposta atrasada')).toBeInTheDocument()

    const abasDaTela = screen.getByRole('tablist', { name: 'Filas de chamados' })
    expect(within(abasDaTela).getByRole('tab', { name: /Pendentes\s*2/ })).toBeInTheDocument()
    expect(within(abasDaTela).getByRole('tab', { name: /Meus\s*1/ })).toBeInTheDocument()
    expect(within(abasDaTela).getByRole('tab', { name: /Todos\s*5/ })).toBeInTheDocument()
    // sem fila de triagem, a aba não aparece
    expect(within(abasDaTela).queryByRole('tab', { name: /Triagem/ })).not.toBeInTheDocument()
  })

  it('a aba Triagem só aparece com fila; trocar de aba refaz a consulta', async () => {
    const s = servicos()
    vi.mocked(s.chamados.listar).mockResolvedValue(
      ok({ itens: [], total: 0, abas: abas({ triagem: 3 }) }),
    )
    renderizar(s, '/chamados')
    const triagem = await screen.findByRole('tab', { name: /Triagem\s*3/ })
    await userEvent.click(triagem)
    await waitFor(() =>
      expect(s.chamados.listar).toHaveBeenLastCalledWith(
        expect.objectContaining({ aba: 'triagem' }),
      ),
    )
    await userEvent.click(screen.getByRole('tab', { name: /Meus/ }))
    await waitFor(() =>
      expect(s.chamados.listar).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'meus' })),
    )
  })

  it('busca e filtros vão para a consulta', async () => {
    const s = servicos()
    renderizar(s, '/chamados')
    await screen.findByRole('list', { name: 'Chamados' })
    await userEvent.type(screen.getByLabelText('Buscar'), 'CH-0043')
    await userEvent.selectOptions(screen.getByLabelText('Prioridade'), 'urgente')
    await waitFor(() =>
      expect(s.chamados.listar).toHaveBeenLastCalledWith(
        expect.objectContaining({ busca: 'CH-0043', prioridade: 'urgente', pagina: 1 }),
      ),
    )
  })

  it('"Abrir chamado" pede o assunto, manda a área ("não sei" = sem área) e abre o chamado novo', async () => {
    const s = servicos()
    s.chamados.obter = vi.fn(async () => ok(chamadoCompleto({ id: id(77), codigo: 'CH-0077' })))
    renderizar(s, '/chamados')
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir chamado' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Abrir chamado' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Abrir chamado' }))
    expect(
      await within(dialogo).findByText('Descreva o assunto em poucas palavras.'),
    ).toBeInTheDocument()
    expect(s.chamados.abrir).not.toHaveBeenCalled()

    await userEvent.type(within(dialogo).getByLabelText(/Assunto/), 'Contrato novo')
    await userEvent.type(
      within(dialogo).getByLabelText('O que está acontecendo'),
      'Preciso de revisão.',
    )
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Abrir chamado' }))
    await waitFor(() =>
      expect(s.chamados.abrir).toHaveBeenCalledWith({
        assunto: 'Contrato novo',
        descricao: 'Preciso de revisão.',
        areaId: null,
        prioridade: 'normal',
      }),
    )
    expect(await screen.findByText('CH-0077')).toBeInTheDocument()
  })

  it('sem chamados.criar não há botão; sem chamados.ver a tela nem abre', async () => {
    renderizar(servicos({ 'chamados.ver': 'todas' } as never), '/chamados')
    await screen.findByRole('list', { name: 'Chamados' })
    expect(screen.queryByRole('button', { name: 'Abrir chamado' })).not.toBeInTheDocument()
  })

  it('perfil sem chamados.ver volta ao início e o menu não mostra Chamados', async () => {
    const base = servicosFalsos()
    renderizar(
      servicosFalsos({ me: async () => meComChamados({}), chamados: base.chamados }),
      '/chamados',
    )
    expect(await screen.findByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Chamados' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Chamados' })).not.toBeInTheDocument()
  })

  it('lista vazia e erro de carregamento', async () => {
    const vazia = servicos()
    vi.mocked(vazia.chamados.listar).mockResolvedValue(
      ok({ itens: [], total: 0, abas: abas({ pendentes: 0, meus: 0, todos: 0 }) }),
    )
    const { unmount } = renderizar(vazia, '/chamados')
    expect(await screen.findByText('Nenhum chamado aqui')).toBeInTheDocument()
    unmount()
    const quebrada = servicos()
    vi.mocked(quebrada.chamados.listar).mockResolvedValue({
      ok: false,
      erro: { codigo: 'x', mensagem: 'Servidor fora do ar.', status: 500 },
    })
    renderizar(quebrada, '/chamados')
    expect(await screen.findByText(/Servidor fora do ar/)).toBeInTheDocument()
  })
})
