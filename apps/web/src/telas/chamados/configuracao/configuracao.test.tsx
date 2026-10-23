import type { AreaDeAtendimento } from '@leadtogo/api-client'
import type {
  AlterarAreaEntrada,
  AlterarTriagemEntrada,
  CriarAreaEntrada,
  CriarFeriadoEntrada,
} from '@leadtogo/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, meComChamados } from '../fixtures'

const area = (extra: Partial<AreaDeAtendimento> = {}): AreaDeAtendimento => ({
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
  ...extra,
})

function servicos(
  areas: AreaDeAtendimento[],
  permissoes: Record<string, true> = { 'chamados.gerir_areas': true },
) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados(permissoes),
    chamados: {
      ...base.chamados,
      areas: {
        ...base.chamados.areas,
        listar: vi.fn(async () => ok(areas)),
        criar: vi.fn(async (dados: CriarAreaEntrada) =>
          ok(area({ ...dados, id: id(11), nome: dados.nome })),
        ),
        alterar: vi.fn(async (_id: string, dados: AlterarAreaEntrada) => ok(area({ ...dados }))),
        membros: vi.fn(async () => ok(area())),
        excluir: vi.fn(async () => ok(undefined)),
      },
      opcoesDeConfiguracao: vi.fn(async () =>
        ok({
          membros: [
            { id: id(900), nome: 'Ana Atendente' },
            { id: id(901), nome: 'Bruno Gestor' },
          ],
          perfis: [{ id: id(950), nome: 'Atendimento' }],
        }),
      ),
    },
  })
}

describe('Configurações → Chamados', () => {
  it('sem chamados.gerir_areas a rota volta para o início', async () => {
    renderizar(servicos([area()], { 'chamados.ver': true }), '/configuracoes/chamados')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Chamados' })).toBeNull())
  })

  it('lista as áreas com as metas e abre o formulário; metas vazias vão como nulo', async () => {
    const s = servicos([area({ metaRespostaMin: 90 })])
    renderizar(s, '/configuracoes/chamados')
    const lista = await screen.findByRole('list', { name: 'Áreas' })
    expect(within(lista).getByText(/Resposta: /)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Nova área' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova área' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(s.chamados.areas.criar).not.toHaveBeenCalled()

    await userEvent.type(within(dialogo).getByLabelText(/^Nome/), 'Suporte')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(s.chamados.areas.criar).toHaveBeenCalledTimes(1))
    expect(s.chamados.areas.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'Suporte',
        metaRespostaMin: null,
        metaResolucaoMin: null,
        pulaTriagem: false,
      }),
    )
  })

  it('mostra o erro da API ao excluir uma área em uso', async () => {
    const s = servicos([area({ chamadosAbertos: 3 })])
    s.chamados.areas.excluir = vi.fn(async () =>
      falha('area_em_uso', 'Esta área já teve chamados; inative em vez de excluir.', 409),
    )
    renderizar(s, '/configuracoes/chamados')
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Jurídico' }))
    expect(await screen.findByText(/já teve chamados/)).toBeInTheDocument()
  })

  it('define quem atende a área: pessoa, gestor e perfil', async () => {
    const s = servicos([area()])
    renderizar(s, '/configuracoes/chamados')
    await userEvent.click(await screen.findByRole('button', { name: 'Quem atende' }))
    const dialogo = await screen.findByRole('dialog', { name: /Quem atende/ })
    await userEvent.click(await within(dialogo).findByLabelText('Ana Atendente'))
    await userEvent.click(within(dialogo).getByLabelText('Atendimento'))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(s.chamados.areas.membros).toHaveBeenCalledTimes(1))
    expect(s.chamados.areas.membros).toHaveBeenCalledWith(id(10), {
      membros: [{ membroId: id(900), gestor: false }],
      perfilIds: [id(950)],
    })
  })

  it('triagem: começa desligada; ligar manda as pessoas escolhidas', async () => {
    const s = servicos([area()])
    s.chamados.triagem.alterar = vi.fn(async (d: AlterarTriagemEntrada) =>
      ok({ ativa: d.ativa, perfilId: null, perfilNome: null, membros: [] }),
    )
    renderizar(s, '/configuracoes/chamados')
    await userEvent.click(await screen.findByRole('tab', { name: 'Triagem' }))
    const form = await screen.findByRole('form', { name: 'Triagem' })
    const chave = within(form).getByRole('switch', { name: 'Triagem ligada' })
    expect(chave).not.toBeChecked()
    await userEvent.click(chave)
    await userEvent.click(await within(form).findByLabelText('Bruno Gestor'))
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(s.chamados.triagem.alterar).toHaveBeenCalledTimes(1))
    expect(s.chamados.triagem.alterar).toHaveBeenCalledWith({
      ativa: true,
      perfilId: null,
      membroIds: [id(901)],
    })
  })

  it('expediente: mostra as faixas, acrescenta um feriado e gera os móveis do ano', async () => {
    const s = servicos([area()])
    s.chamados.expediente.ver = vi.fn(async () =>
      ok({
        fusoHorario: 'America/Sao_Paulo',
        faixas: [{ diaSemana: 1, inicio: '08:00', fim: '18:00' }],
        feriados: [{ id: id(700), data: '2026-12-25', nome: 'Natal', recorrente: true }],
      }),
    )
    s.chamados.expediente.criarFeriado = vi.fn(async (d: CriarFeriadoEntrada) =>
      ok({ id: id(701), data: d.data, nome: d.nome, recorrente: d.recorrente }),
    )
    renderizar(s, '/configuracoes/chamados')
    await userEvent.click(await screen.findByRole('tab', { name: 'Expediente e feriados' }))
    const segunda = await screen.findByRole('listitem', { name: 'Segunda-feira' })
    expect(within(segunda).getByLabelText('Segunda-feira: início')).toHaveValue('08:00')
    expect(
      within(await screen.findByRole('listitem', { name: 'Sábado' })).getByText('Sem expediente'),
    ).toBeInTheDocument()
    expect(screen.getByText('25/12 (todo ano)')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Data'), '2026-11-20')
    await userEvent.type(screen.getByLabelText(/^Nome/), 'Consciência Negra')
    await userEvent.click(screen.getByRole('button', { name: 'Acrescentar feriado' }))
    await waitFor(() =>
      expect(s.chamados.expediente.criarFeriado).toHaveBeenCalledWith({
        data: '2026-11-20',
        nome: 'Consciência Negra',
        recorrente: false,
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Gerar feriados móveis do ano' }))
    await waitFor(() => expect(s.chamados.expediente.gerarFeriados).toHaveBeenCalledTimes(1))
  })
})
