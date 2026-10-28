import type { ChaveDeApi, EntregaDeWebhook, Webhook } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const meCom = (papel: 'admin') =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel,
        situacao: 'ativo' as const,
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const chave = (n: number, extra: Partial<ChaveDeApi> = {}): ChaveDeApi => ({
  id: id(n),
  nome: `Chave ${n}`,
  prefixo: 'ltg_live_a1B2c3D4',
  ambiente: 'live',
  permissoes: ['empresas.ver'],
  responsavelPadrao: null,
  ipsPermitidos: [],
  expiraEm: null,
  revogadaEm: null,
  substituidaPor: null,
  ultimoUsoEm: null,
  ultimoIp: null,
  situacao: 'ativa',
  criadoEm: '2026-10-28T12:00:00.000Z',
  criadoPor: { id: id(99), nome: 'Ale' },
  ...extra,
})
const webhook = (n: number, extra: Partial<Webhook> = {}): Webhook => ({
  id: id(50 + n),
  descricao: `Webhook ${n}`,
  url: 'https://n8n.exemplo.com.br/webhook/x',
  eventos: ['empresa.criada'],
  ativo: true,
  desativadoMotivo: null,
  segredoAnteriorAte: null,
  ultimoSucessoEm: null,
  falhandoDesde: null,
  entregas24h: { sucesso: 3, falhou: 1, pendente: 0 },
  criadoEm: '2026-10-28T12:00:00.000Z',
  criadoPor: null,
  ...extra,
})
const entrega = (extra: Partial<EntregaDeWebhook> = {}): EntregaDeWebhook => ({
  id: id(80),
  eventoId: id(81),
  tipo: 'empresa.criada',
  situacao: 'falhou',
  tentativas: 8,
  statusHttp: 500,
  duracaoMs: 120,
  resposta: 'erro do destino',
  erro: 'HTTP 500',
  proximaTentativaEm: null,
  entregueEm: null,
  criadoEm: '2026-10-28T12:00:00.000Z',
  ...extra,
})

describe('Configurações → Integrações', () => {
  it('só quem tem integracoes.gerir vê a seção', async () => {
    const semIntegracoes = meDeAdmin({
      empresas: [
        {
          id: A,
          razaoSocial: 'Aurora Ltda',
          nomeFantasia: 'Aurora',
          papel: 'vendedor',
          situacao: 'ativo' as const,
          ativa: true,
          perfil: { id: id(500), nome: 'Cadastrista' },
          permissoes: { 'cadastros.gerir': true },
        },
      ],
      empresaAtivaId: A,
      administradorDeConta: false,
      doisFatoresObrigatorio: false,
    })
    renderizar(servicosFalsos({ me: async () => semIntegracoes }), '/configuracoes')
    const menu = await screen.findByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Tags/ })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: /Integrações/ })).toBeNull()
  })

  it('o Administrador vê a seção no menu', async () => {
    renderizar(servicosFalsos({ me: async () => meCom('admin') }), '/configuracoes/integracoes')
    const menu = await screen.findByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Integrações/ })).toBeInTheDocument()
  })

  it('cria a chave com um modelo de permissões e mostra o token uma vez', async () => {
    const usuario = userEvent.setup()
    const s = servicosFalsos({ me: async () => meCom('admin') })
    s.integracoes.chaves.listar = vi.fn(async () => ok({ itens: [chave(1)] }))
    s.integracoes.chaves.criar = vi.fn(async () =>
      ok({ chave: chave(2, { nome: 'n8n — Omie' }), token: 'ltg_live_TOKENDETESTE' }),
    )
    renderizar(s, '/configuracoes/integracoes')
    expect(await screen.findByText('Chave 1')).toBeInTheDocument()
    expect(screen.getByText('ltg_live_a1B2c3D4…')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Nova chave' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova chave de API' })
    await usuario.type(within(dialogo).getByLabelText(/Nome/), 'n8n — Omie')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Leitura da carteira' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Criar chave' }))
    await waitFor(() =>
      expect(s.integracoes.chaves.criar).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'n8n — Omie',
          permissoes: ['empresas.ver', 'contatos.ver', 'oportunidades.ver', 'atividades.ver'],
          ipsPermitidos: [],
        }),
      ),
    )
    const segredo = await screen.findByRole('dialog', { name: 'Chave criada' })
    expect(within(segredo).getByText('ltg_live_TOKENDETESTE')).toBeInTheDocument()
    await usuario.click(within(segredo).getByRole('button', { name: 'Já guardei' }))
    await waitFor(() => expect(screen.queryByText('ltg_live_TOKENDETESTE')).toBeNull())
  })

  it('revoga a chave depois da confirmação', async () => {
    const usuario = userEvent.setup()
    const s = servicosFalsos({ me: async () => meCom('admin') })
    s.integracoes.chaves.listar = vi.fn(async () => ok({ itens: [chave(1)] }))
    s.integracoes.chaves.revogar = vi.fn(async () => ok(chave(1, { situacao: 'revogada' })))
    renderizar(s, '/configuracoes/integracoes')
    await screen.findByText('Chave 1')
    await usuario.click(screen.getByRole('button', { name: 'Revogar' }))
    const confirmar = await screen.findByRole('dialog', { name: 'Revogar a chave "Chave 1"?' })
    await usuario.click(within(confirmar).getByRole('button', { name: 'Revogar' }))
    await waitFor(() => expect(s.integracoes.chaves.revogar).toHaveBeenCalledWith(id(1)))
  })

  it('cadastra o webhook com os eventos, mostra o segredo e abre o log com reenvio', async () => {
    const usuario = userEvent.setup()
    const s = servicosFalsos({ me: async () => meCom('admin') })
    s.integracoes.webhooks.listar = vi.fn(async () => ok({ itens: [webhook(1)] }))
    s.integracoes.webhooks.criar = vi.fn(async () =>
      ok({ webhook: webhook(2), segredo: 'whsec_SEGREDODETESTE' }),
    )
    s.integracoes.webhooks.entregas = vi.fn(async () =>
      ok({ itens: [entrega()], total: 1, pagina: 1, porPagina: 25 }),
    )
    s.integracoes.webhooks.reenviar = vi.fn(async () => ok(entrega({ situacao: 'pendente' })))
    renderizar(s, '/configuracoes/integracoes')
    await usuario.click(await screen.findByRole('tab', { name: /Webhooks/ }))
    expect(await screen.findByText('Webhook 1')).toBeInTheDocument()
    expect(screen.getByText(/3 entregues · 1 falharam/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Novo webhook' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo webhook' })
    await usuario.type(within(dialogo).getByLabelText(/Descrição/), 'n8n — cobrança')
    await usuario.type(
      within(dialogo).getByLabelText(/Endereço/),
      'https://n8n.exemplo.com.br/webhook/cobranca',
    )
    await usuario.click(within(dialogo).getByRole('checkbox', { name: /Tag da empresa alterada/ }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Criar webhook' }))
    await waitFor(() =>
      expect(s.integracoes.webhooks.criar).toHaveBeenCalledWith({
        descricao: 'n8n — cobrança',
        url: 'https://n8n.exemplo.com.br/webhook/cobranca',
        eventos: ['empresa.tag_alterada'],
      }),
    )
    const segredo = await screen.findByRole('dialog', { name: 'Segredo do webhook' })
    expect(within(segredo).getByText('whsec_SEGREDODETESTE')).toBeInTheDocument()
    await usuario.click(within(segredo).getByRole('button', { name: 'Já guardei' }))

    await usuario.click(screen.getByRole('button', { name: 'Entregas' }))
    const log = await screen.findByRole('dialog', { name: 'Entregas: Webhook 1' })
    expect(await within(log).findByText('HTTP 500')).toBeInTheDocument()
    await usuario.click(within(log).getByRole('button', { name: 'Reenviar' }))
    await waitFor(() =>
      expect(s.integracoes.webhooks.reenviar).toHaveBeenCalledWith(id(51), id(80)),
    )
  })
})
