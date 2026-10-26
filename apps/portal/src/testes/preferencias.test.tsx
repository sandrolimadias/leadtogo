import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { id, ok, renderizar, servicosFalsos } from './fakes'

const push = vi.hoisted(() => ({
  estadoDoPush: vi.fn<() => Promise<string>>(),
  ativarPushNesteAparelho: vi.fn(),
  desativarPushNesteAparelho: vi.fn(),
  estaInstalado: vi.fn(() => false),
  registrarServiceWorker: vi.fn(),
}))
vi.mock('@/casca/push', () => push)

beforeEach(() => {
  push.estadoDoPush.mockResolvedValue('desativado')
  push.ativarPushNesteAparelho.mockReset()
  push.desativarPushNesteAparelho.mockReset()
})

const abrir = async (servicos = servicosFalsos()) => {
  renderizar(servicos, '/perfil')
  const usuario = userEvent.setup()
  await usuario.click(await screen.findByRole('tab', { name: 'Notificações' }))
  return { servicos, usuario }
}

describe('preferências: e-mail e horário de silêncio', () => {
  it('mostra o padrão; o botão só liga quando há mudança; salva o e-mail por tipo', async () => {
    const { servicos, usuario } = await abrir()
    const salvar = await screen.findByRole('button', { name: 'Salvar preferências' })
    expect(salvar).toBeDisabled()
    expect(screen.getByLabelText(/Chamados/)).toBeChecked()
    await usuario.click(screen.getByLabelText(/Avisos da equipe/))
    expect(salvar).toBeEnabled()
    await usuario.click(salvar)
    await waitFor(() =>
      expect(servicos.preferencias.salvar).toHaveBeenCalledWith({
        silencioInicio: null,
        silencioFim: null,
        emailChamados: true,
        emailEventos: true,
        emailAvisos: false,
      }),
    )
  })

  it('liga o silêncio com 22:00 às 07:00 e deixa ajustar os horários', async () => {
    const { servicos, usuario } = await abrir()
    await usuario.click(await screen.findByRole('switch', { name: 'Silenciar avisos normais' }))
    const das = screen.getByLabelText('Das')
    const ate = screen.getByLabelText('Até')
    expect(das).toHaveValue('22:00')
    expect(ate).toHaveValue('07:00')
    await usuario.clear(das)
    await usuario.type(das, '21:30')
    await usuario.click(screen.getByRole('button', { name: 'Salvar preferências' }))
    await waitFor(() =>
      expect(servicos.preferencias.salvar).toHaveBeenCalledWith(
        expect.objectContaining({ silencioInicio: '21:30', silencioFim: '07:00' }),
      ),
    )
  })

  it('desligar o silêncio manda os dois horários nulos', async () => {
    const servicos = servicosFalsos({
      preferencias: {
        obter: vi.fn(async () =>
          ok({
            silencioInicio: '22:00',
            silencioFim: '07:00',
            emailChamados: true,
            emailEventos: true,
            emailAvisos: true,
          }),
        ),
        salvar: vi.fn(async (d) => ok(d)),
      },
    })
    const { usuario } = await abrir(servicos)
    await usuario.click(await screen.findByRole('switch', { name: 'Silenciar avisos normais' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar preferências' }))
    await waitFor(() =>
      expect(servicos.preferencias.salvar).toHaveBeenCalledWith(
        expect.objectContaining({ silencioInicio: null, silencioFim: null }),
      ),
    )
  })
})

describe('avisos no aparelho (push)', () => {
  it('ativar pede a permissão por um clique e registra a inscrição na API', async () => {
    push.ativarPushNesteAparelho.mockResolvedValue({
      endpoint: 'https://push.exemplo.com/abc',
      keys: { p256dh: 'k', auth: 'a' },
    })
    const { servicos, usuario } = await abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }))
    await waitFor(() =>
      expect(servicos.push.inscrever).toHaveBeenCalledWith({
        endpoint: 'https://push.exemplo.com/abc',
        keys: { p256dh: 'k', auth: 'a' },
      }),
    )
    expect(push.ativarPushNesteAparelho).toHaveBeenCalledWith('chave-publica')
    expect(
      await screen.findByRole('button', { name: 'Desativar neste aparelho' }),
    ).toBeInTheDocument()
  })

  it('se a pessoa não dá a permissão, nada é enviado à API', async () => {
    push.ativarPushNesteAparelho.mockResolvedValue(null)
    const { servicos, usuario } = await abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }))
    await waitFor(() => expect(push.ativarPushNesteAparelho).toHaveBeenCalled())
    expect(servicos.push.inscrever).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeInTheDocument()
  })

  it('desativar cancela no navegador e revoga na API', async () => {
    push.estadoDoPush.mockResolvedValue('ativo')
    push.desativarPushNesteAparelho.mockResolvedValue('https://push.exemplo.com/abc')
    const { servicos, usuario } = await abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Desativar neste aparelho' }))
    await waitFor(() =>
      expect(servicos.push.remover).toHaveBeenCalledWith('https://push.exemplo.com/abc'),
    )
    expect(
      await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['bloqueado', /bloqueadas neste navegador/],
    ['instalar_primeiro', /instale o portal primeiro/],
    ['sem_suporte', /não recebe notificações do portal/],
  ])('estado %s explica o que fazer, sem botão de ativar', async (estado, texto) => {
    push.estadoDoPush.mockResolvedValue(estado)
    await abrir()
    const secao = await screen.findByRole('region', { name: 'Avisos no aparelho' })
    expect(await within(secao).findByText(texto)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeNull()
  })

  it('servidor sem chaves VAPID: esconde o botão e explica', async () => {
    const servicos = servicosFalsos({
      push: {
        configuracao: vi.fn(async () =>
          ok({ disponivel: false, chavePublica: null, inscricoes: 0 }),
        ),
        inscrever: vi.fn(),
        remover: vi.fn(),
      },
    })
    await abrir(servicos)
    expect(await screen.findByText(/ainda não estão disponíveis/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeNull()
    void id
  })
})
