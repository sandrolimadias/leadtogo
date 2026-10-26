import type { Evento, ItemDeEvento, ParticipanteDoEvento } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, meComChamados } from '../chamados/fixtures'

const PERMISSOES = { 'portal.ver': true, 'portal.agenda': true } as const

const item = (extra: Partial<ItemDeEvento> = {}): ItemDeEvento => ({
  id: id(600),
  titulo: 'Encontro anual de clientes',
  situacao: 'publicado',
  alcance: 'todos',
  inicioEm: '2099-11-12T21:30:00.000Z',
  fimEm: '2099-11-13T01:00:00.000Z',
  local: 'Auditório',
  vagasTotais: 2,
  vagasPorEmpresa: 1,
  prazoConfirmacao: null,
  confirmados: 2,
  listaDeEspera: 1,
  ...extra,
})

const evento = (extra: Partial<Evento> = {}): Evento => ({
  ...item(),
  descricao: 'Um dia de **troca**.',
  linkOnline: null,
  publicadoEm: '2026-10-20T10:00:00.000Z',
  canceladoEm: null,
  canceladoMotivo: null,
  criadoEm: '2026-10-20T09:00:00.000Z',
  empresas: [],
  ...extra,
})

const pessoa = (extra: Partial<ParticipanteDoEvento> = {}): ParticipanteDoEvento => ({
  id: id(610),
  pessoa: 'Ana Alves',
  email: 'ana@alfa.com.br',
  empresa: 'Caldeiraria Alfa',
  situacao: 'confirmado',
  entrouNaFilaEm: '2026-10-21T10:00:00.000Z',
  confirmadoEm: '2026-10-21T10:00:00.000Z',
  promovidoEm: null,
  posicaoNaFila: null,
  ...extra,
})

function servicos(
  troca: Record<string, unknown> = {},
  permissoes: Record<string, true> = { ...PERMISSOES },
  itens: ItemDeEvento[] = [item()],
) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados({ 'chamados.ver': 'todas', ...permissoes }),
    portal: {
      ...base.portal,
      eventos: {
        ...base.portal.eventos,
        listar: vi.fn(async () =>
          ok({
            itens,
            total: itens.length,
            abas: { proximos: itens.length, passados: 0, rascunhos: 0 },
          }),
        ),
        obter: vi.fn(async () => ok(evento())),
        participantes: vi.fn(async () =>
          ok({
            confirmados: [
              pessoa(),
              pessoa({
                id: id(611),
                pessoa: 'Bruno Barros',
                empresa: 'Metalúrgica Beta',
                email: 'bruno@beta.com.br',
              }),
            ],
            listaDeEspera: [
              pessoa({
                id: id(612),
                pessoa: 'Alice Araújo',
                situacao: 'lista_espera',
                confirmadoEm: null,
                posicaoNaFila: 1,
              }),
            ],
          }),
        ),
        ...troca,
      },
    },
  })
}

async function abrirAba(s: ReturnType<typeof servicos>) {
  renderizar(s, '/portal')
  const usuario = userEvent.setup()
  await usuario.click(await screen.findByRole('tab', { name: 'Agenda' }))
  return usuario
}

describe('hub do portal: agenda', () => {
  it('lista o evento com as vagas e mostra confirmados e lista de espera com a posição', async () => {
    await abrirAba(servicos())
    const lista = await screen.findByRole('list', { name: 'Eventos' })
    expect(within(lista).getByText('Encontro anual de clientes')).toBeInTheDocument()
    expect(within(lista).getByText('2 de 2 vagas · 1 na fila')).toBeInTheDocument()
    const confirmados = await screen.findByRole('list', { name: 'Confirmados' })
    expect(within(confirmados).getByText('Ana Alves')).toBeInTheDocument()
    expect(
      within(confirmados).getByText(/Metalúrgica Beta · bruno@beta\.com\.br/),
    ).toBeInTheDocument()
    const fila = screen.getByRole('list', { name: 'Lista de espera' })
    expect(within(fila).getByText('1º')).toBeInTheDocument()
    expect(within(fila).getByText('Alice Araújo')).toBeInTheDocument()
    expect(screen.getByText('troca').tagName).toBe('STRONG')
    expect(screen.getByText(/2 vagas · até 1 por empresa/)).toBeInTheDocument()
  })

  it('tira um participante com confirmação', async () => {
    const removerParticipante = vi.fn(async () => ok({ confirmados: [], listaDeEspera: [] }))
    const usuario = await abrirAba(servicos({ removerParticipante }))
    const confirmados = await screen.findByRole('list', { name: 'Confirmados' })
    await usuario.click(within(confirmados).getByRole('button', { name: 'Tirar Ana Alves' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Tirar do evento' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Tirar' }))
    await waitFor(() => expect(removerParticipante).toHaveBeenCalledWith(id(600), id(610)))
  })

  it('cria um evento como rascunho com vagas, prazo e alcance', async () => {
    const criar = vi.fn(async () => ok(evento({ situacao: 'rascunho' })))
    const usuario = await abrirAba(servicos({ criar }))
    await usuario.click(await screen.findByRole('button', { name: 'Novo evento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo evento' })
    const criarBotao = within(dialogo).getByRole('button', { name: 'Criar evento' })
    expect(criarBotao).toBeDisabled()
    await usuario.type(within(dialogo).getByLabelText(/Título/), 'Treinamento novo módulo')
    await usuario.type(within(dialogo).getByLabelText(/Início/), '2099-12-01T09:00')
    await usuario.type(within(dialogo).getByLabelText(/Fim/), '2099-12-01T12:00')
    await usuario.type(within(dialogo).getByLabelText('Vagas totais'), '30')
    await usuario.type(within(dialogo).getByLabelText('Vagas por empresa'), '2')
    await usuario.click(criarBotao)
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1))
    expect(criar).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Treinamento novo módulo',
        descricao: null,
        local: null,
        linkOnline: null,
        vagasTotais: 30,
        vagasPorEmpresa: 2,
        prazoConfirmacao: null,
        alcance: 'todos',
        empresaIds: [],
      }),
    )
  })

  it('erro da API aparece no diálogo do evento', async () => {
    const criar = vi.fn(async () =>
      falha('requisicao_invalida', 'O fim precisa ser depois do início', 400),
    )
    const usuario = await abrirAba(servicos({ criar }))
    await usuario.click(await screen.findByRole('button', { name: 'Novo evento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo evento' })
    await usuario.type(within(dialogo).getByLabelText(/Título/), 'Evento com erro')
    await usuario.type(within(dialogo).getByLabelText(/Início/), '2099-12-01T09:00')
    await usuario.type(within(dialogo).getByLabelText(/Fim/), '2099-12-01T08:00')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Criar evento' }))
    expect(
      await within(dialogo).findByText('O fim precisa ser depois do início'),
    ).toBeInTheDocument()
  })

  it('rascunho: publica e exclui; publicado: cancela com motivo', async () => {
    const publicar = vi.fn(async () => ok(evento()))
    const excluir = vi.fn(async () => ok(undefined))
    const rascunho = servicos(
      {
        obter: vi.fn(async () => ok(evento({ situacao: 'rascunho', publicadoEm: null }))),
        publicar,
        excluir,
      },
      undefined,
      [item({ situacao: 'rascunho', confirmados: 0, listaDeEspera: 0 })],
    )
    const usuario = await abrirAba(rascunho)
    await usuario.click(await screen.findByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(publicar).toHaveBeenCalledWith(id(600)))
    await usuario.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialogoExcluir = await screen.findByRole('dialog', { name: 'Excluir evento' })
    await usuario.click(within(dialogoExcluir).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(excluir).toHaveBeenCalledWith(id(600)))
  })

  it('cancelar o evento exige o motivo', async () => {
    const cancelar = vi.fn(async () =>
      ok(evento({ situacao: 'cancelado', canceladoMotivo: 'Chuva forte' })),
    )
    const usuario = await abrirAba(servicos({ cancelar }))
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar evento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Cancelar evento' })
    const confirmar = within(dialogo).getByRole('button', { name: 'Cancelar evento' })
    expect(confirmar).toBeDisabled()
    await usuario.type(within(dialogo).getByLabelText(/Motivo/), 'Chuva forte')
    await usuario.click(confirmar)
    await waitFor(() => expect(cancelar).toHaveBeenCalledWith(id(600), { motivo: 'Chuva forte' }))
  })

  it('só com "ver" (sem portal.agenda) não vê Novo evento, Editar nem tirar participantes', async () => {
    await abrirAba(servicos({}, { 'portal.ver': true }))
    await screen.findByRole('list', { name: 'Confirmados' })
    expect(screen.queryByRole('button', { name: 'Novo evento' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Tirar/ })).toBeNull()
  })

  it('sem eventos, explica', async () => {
    await abrirAba(servicos({}, undefined, []))
    expect(await screen.findByText('Nenhum evento')).toBeInTheDocument()
  })
})
