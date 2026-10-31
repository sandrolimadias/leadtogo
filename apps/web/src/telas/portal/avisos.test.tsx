import type { Aviso } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, meComChamados } from '../chamados/fixtures'

const PERMISSOES = { 'portal.ver': true, 'portal.avisos': true } as const

const aviso = (extra: Partial<Aviso> = {}): Aviso => ({
  id: id(700),
  mensagem: 'O expediente de sexta termina às 14h',
  link: null,
  urgencia: 'normal',
  alcance: 'todos',
  situacao: 'enviado',
  enviarEm: '2026-10-20T12:00:00.000Z',
  enviadoEm: '2026-10-20T12:00:00.000Z',
  canceladoEm: null,
  destinatarios: 10,
  entregues: 10,
  lidos: 4,
  pushEnviados: 6,
  emailsEnfileirados: 9,
  criadoEm: '2026-10-20T11:59:00.000Z',
  empresas: [],
  tags: [],
  ...extra,
})

function servicos(
  troca: Record<string, unknown> = {},
  permissoes: Record<string, true> = { ...PERMISSOES },
  itens: Aviso[] = [aviso()],
  semana = { usados: 2, limite: 3 },
) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados({ 'chamados.ver': 'todas', ...permissoes }),
    portal: {
      ...base.portal,
      avisos: {
        ...base.portal.avisos,
        listar: vi.fn(async () => ok({ itens, total: itens.length, semana })),
        ...troca,
      },
    },
  })
}

async function abrirAba(s: ReturnType<typeof servicos>) {
  renderizar(s, '/portal')
  const usuario = userEvent.setup()
  await usuario.click(await screen.findByRole('tab', { name: 'Avisos' }))
  return usuario
}

describe('hub do portal: avisos', () => {
  it('lista o que foi enviado com entregues, lidos em % e canais', async () => {
    await abrirAba(servicos())
    const lista = await screen.findByRole('list', { name: 'Avisos' })
    expect(within(lista).getByText('O expediente de sexta termina às 14h')).toBeInTheDocument()
    expect(
      within(lista).getByText(/Entregues 10 de 10 · Lidos 40% · Push 6 · E-mail 9/),
    ).toBeInTheDocument()
    expect(within(lista).getByText('Todos os clientes')).toBeInTheDocument()
  })

  it('mostra o contador do limite e a prévia com a mensagem inteira', async () => {
    const usuario = await abrirAba(servicos())
    expect(await screen.findByText(/2 de 3/)).toBeInTheDocument()
    const previa = screen.getByRole('figure', { name: 'Como chega no celular' })
    expect(within(previa).getByText('A sua mensagem aparece aqui.')).toBeInTheDocument()
    await usuario.type(screen.getByLabelText(/Mensagem/), 'Plantão extra no sábado')
    expect(within(previa).getByText('Plantão extra no sábado')).toBeInTheDocument()
    expect(
      screen.getByText('23 de 140 caracteres. Aparece inteira na notificação.'),
    ).toBeInTheDocument()
  })

  it('envia agora depois de confirmar; o aviso vai com os dados certos', async () => {
    const criar = vi.fn(async () => ok(aviso({ situacao: 'agendado', enviadoEm: null })))
    const usuario = await abrirAba(servicos({ criar }))
    await usuario.type(await screen.findByLabelText(/Mensagem/), 'Plantão extra no sábado')
    await usuario.type(screen.getByLabelText('Link (opcional)'), '/agenda')
    await usuario.click(screen.getByRole('button', { name: 'Enviar aviso' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/todos os clientes com acesso ativo/)).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }))
    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        mensagem: 'Plantão extra no sábado',
        link: '/agenda',
        urgencia: 'normal',
        alcance: 'todos',
        empresaIds: [],
        tagIds: [],
        enviarEm: null,
      }),
    )
  })

  it('urgente vai como urgente; agendar exige o horário', async () => {
    const criar = vi.fn(async () => ok(aviso()))
    const usuario = await abrirAba(servicos({ criar }))
    await usuario.type(await screen.findByLabelText(/Mensagem/), 'Sistema fora do ar')
    await usuario.click(screen.getByRole('switch', { name: 'Urgente' }))
    await usuario.click(screen.getByRole('button', { name: 'Agendar' }))
    const botao = screen.getByRole('button', { name: 'Agendar aviso' })
    expect(botao).toBeDisabled()
    await usuario.type(screen.getByLabelText('Enviar em'), '2099-11-12T09:30')
    expect(botao).toBeEnabled()
    await usuario.click(botao)
    await usuario.click(await screen.findByRole('button', { name: 'Confirmar agendamento' }))
    await waitFor(() => expect(criar).toHaveBeenCalled())
    const enviado = (
      criar.mock.calls as unknown as [{ urgencia: string; enviarEm: string }][]
    )[0]?.[0]
    expect(enviado?.urgencia).toBe('urgente')
    expect(enviado?.enviarEm).toMatch(/^2099-11-1[23]T/)
  })

  it('no limite semanal só o urgente pode sair', async () => {
    const usuario = await abrirAba(
      servicos({}, { ...PERMISSOES }, [aviso()], { usados: 3, limite: 3 }),
    )
    await usuario.type(await screen.findByLabelText(/Mensagem/), 'Mais um aviso')
    expect(screen.getByText(/O limite foi atingido/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar aviso' })).toBeDisabled()
    await usuario.click(screen.getByRole('switch', { name: 'Urgente' }))
    expect(screen.getByRole('button', { name: 'Enviar aviso' })).toBeEnabled()
  })

  it('erro da API (limite) aparece no formulário e mantém o que foi digitado', async () => {
    const criar = vi.fn(async () =>
      falha('limite_semanal', 'Já há 3 de 3 avisos normais nesta semana.', 409),
    )
    const usuario = await abrirAba(servicos({ criar }))
    await usuario.type(await screen.findByLabelText(/Mensagem/), 'Mais um aviso')
    await usuario.click(screen.getByRole('button', { name: 'Enviar aviso' }))
    await usuario.click(await screen.findByRole('button', { name: 'Confirmar envio' }))
    expect(await screen.findByText(/Já há 3 de 3 avisos normais/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Mensagem/)).toHaveValue('Mais um aviso')
  })

  it('o aviso agendado mostra "Cancelar envio", que pede confirmação', async () => {
    const cancelar = vi.fn(async () => ok(aviso({ situacao: 'cancelado' })))
    const agendado = aviso({
      situacao: 'agendado',
      enviadoEm: null,
      enviarEm: '2099-11-12T12:00:00.000Z',
      destinatarios: 0,
      entregues: 0,
      lidos: 0,
    })
    const usuario = await abrirAba(servicos({ cancelar }, { ...PERMISSOES }, [agendado]))
    const lista = await screen.findByRole('list', { name: 'Avisos' })
    await usuario.click(within(lista).getByRole('button', { name: 'Cancelar envio' }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar envio' }))
    await waitFor(() => expect(cancelar).toHaveBeenCalledWith(id(700)))
  })

  it('quem só pode ver (portal.ver) não tem formulário nem botão de cancelar', async () => {
    await abrirAba(
      servicos({}, { 'portal.ver': true } as never, [
        aviso({ situacao: 'agendado', enviadoEm: null }),
      ]),
    )
    await screen.findByRole('list', { name: 'Avisos' })
    expect(screen.queryByRole('region', { name: 'Novo aviso' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar envio' })).toBeNull()
  })
})
