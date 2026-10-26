import type {
  ComentarioParaModeracao,
  ItemDePublicacao,
  ListaDePublicacoes,
  Publicacao,
} from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, meComChamados } from '../chamados/fixtures'

const PERMISSOES = {
  'portal.ver': true,
  'portal.publicar': true,
  'portal.moderar': true,
} as const

const metricas = (extra = {}) => ({
  leitores: 98,
  alvo: 186,
  empresasAlcancadas: 32,
  reacoes: { curtir: 20, apoiar: 5, parabens: 4 },
  comentarios: 2,
  comentariosOcultos: 0,
  denunciasAbertas: 0,
  ...extra,
})

const item = (extra: Partial<ItemDePublicacao> = {}): ItemDePublicacao => ({
  id: id(400),
  titulo: 'Inscrições: Encontro anual de clientes',
  situacao: 'publicada',
  alcance: 'todos',
  fixada: false,
  agendadaPara: null,
  publicadaEm: '2026-10-21T10:15:00.000Z',
  atualizadoEm: '2026-10-21T10:15:00.000Z',
  comentariosBloqueados: false,
  metricas: metricas(),
  ...extra,
})

const publicacao = (extra: Partial<Publicacao> = {}): Publicacao => ({
  ...item(),
  corpo: 'Inscrições abertas para o **Encontro anual**.',
  autorNome: 'Lívia Coutinho',
  criadoEm: '2026-10-21T10:00:00.000Z',
  empresas: [],
  ...extra,
})

const comentario = (extra: Partial<ComentarioParaModeracao> = {}): ComentarioParaModeracao => ({
  id: id(410),
  autorNome: 'Marcos L.',
  empresaNome: 'Portocel Logística',
  corpo: 'Aproveitando: temos empilhadeiras à venda, chamem no privado!',
  criadoEm: '2026-10-21T12:10:00.000Z',
  oculto: false,
  ocultoMotivo: null,
  ocultoPorNome: null,
  denunciasAbertas: 1,
  motivoDaDenuncia: 'spam',
  ...extra,
})

const lista = (itens: ItemDePublicacao[], denuncias = 0): ListaDePublicacoes => ({
  itens,
  total: itens.length,
  abas: { todas: itens.length, publicadas: itens.length, agendadas: 0, rascunhos: 0 },
  denunciasAbertas: denuncias,
})

function servicos(
  troca: Record<string, unknown> = {},
  permissoes: Record<string, true> = { ...PERMISSOES },
) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados({ 'chamados.ver': 'todas', ...permissoes }),
    portal: {
      ...base.portal,
      publicacoes: {
        ...base.portal.publicacoes,
        listar: vi.fn(async () =>
          ok(lista([item({ metricas: metricas({ denunciasAbertas: 1 }) })], 1)),
        ),
        obter: vi.fn(async () => ok(publicacao({ metricas: metricas({ denunciasAbertas: 1 }) }))),
        comentarios: vi.fn(async () => ok({ itens: [comentario()] })),
        ...troca,
      },
    },
  })
}

describe('hub do portal: publicações', () => {
  it('lista, mostra o aviso das denúncias, o alcance e as métricas do detalhe', async () => {
    const s = servicos()
    renderizar(s, '/portal')
    await userEvent.setup().click(await screen.findByRole('tab', { name: /Publicações/ }))
    const itens = await screen.findByRole('list', { name: 'Publicações' })
    expect(within(itens).getByText('Inscrições: Encontro anual de clientes')).toBeInTheDocument()
    expect(
      within(itens).getByText(/53% de alcance · 29 reações · 2 comentários/),
    ).toBeInTheDocument()
    expect(within(itens).getByText('1 denúncia')).toBeInTheDocument()
    expect(screen.getByText('1 comentário denunciado aguarda análise')).toBeInTheDocument()
    const metricasDoDetalhe = await screen.findByRole('region', { name: 'Métricas da publicação' })
    expect(within(metricasDoDetalhe).getByText('53%')).toBeInTheDocument()
    expect(within(metricasDoDetalhe).getByText('98 de 186 clientes')).toBeInTheDocument()
    expect(within(metricasDoDetalhe).getByText('32')).toBeInTheDocument()
    expect(screen.getByText('Encontro anual').tagName).toBe('STRONG')
  })

  it('modera: mantém, oculta com motivo e bloqueia os comentários', async () => {
    const moderar = vi.fn(async () => ok({ itens: [comentario({ denunciasAbertas: 0 })] }))
    const bloquear = vi.fn(async () => ok(publicacao({ comentariosBloqueados: true })))
    renderizar(servicos({ moderar, bloquearComentarios: bloquear }), '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Publicações/ }))
    const comentarios = await screen.findByRole('list', { name: 'Comentários da publicação' })
    expect(within(comentarios).getByText(/Propaganda ou spam · 1 denúncia/)).toBeInTheDocument()
    expect(within(comentarios).getByText(/Portocel Logística · /)).toBeInTheDocument()

    await usuario.click(within(comentarios).getByRole('button', { name: 'Manter' }))
    await waitFor(() => expect(moderar).toHaveBeenCalledWith(id(400), id(410), { acao: 'manter' }))

    await usuario.click(within(comentarios).getByRole('button', { name: 'Ocultar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ocultar comentário' })
    const confirmar = within(dialogo).getByRole('button', { name: 'Ocultar' })
    expect(confirmar).toBeDisabled()
    await usuario.type(within(dialogo).getByLabelText(/Motivo/), 'Propaganda')
    await usuario.click(confirmar)
    await waitFor(() =>
      expect(moderar).toHaveBeenCalledWith(id(400), id(410), {
        acao: 'ocultar',
        motivo: 'Propaganda',
      }),
    )

    await usuario.click(screen.getByRole('button', { name: 'Bloquear comentários' }))
    await waitFor(() => expect(bloquear).toHaveBeenCalledWith(id(400), true))
  })

  it('cria uma publicação para todos e publica agora', async () => {
    const criar = vi.fn(async () => ok(publicacao()))
    renderizar(servicos({ criar }), '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Publicações/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Nova publicação' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova publicação' })
    expect(within(dialogo).getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
    await usuario.type(within(dialogo).getByLabelText(/Título/), 'Feriado de novembro')
    await usuario.type(within(dialogo).getByLabelText(/Texto/), 'Fechado na segunda.')
    await usuario.selectOptions(within(dialogo).getByLabelText('Quando'), 'publicada')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Publicar' }))
    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        titulo: 'Feriado de novembro',
        corpo: 'Fechado na segunda.',
        alcance: 'todos',
        empresaIds: [],
        situacao: 'publicada',
        agendadaPara: null,
      }),
    )
  })

  it('agendar exige a data; erro da API aparece no diálogo', async () => {
    const criar = vi.fn(async () =>
      falha('agenda_no_passado', 'Escolha um horário no futuro para agendar.', 422),
    )
    renderizar(servicos({ criar }), '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Publicações/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Nova publicação' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova publicação' })
    await usuario.type(within(dialogo).getByLabelText(/Título/), 'Aviso futuro')
    await usuario.type(within(dialogo).getByLabelText(/Texto/), 'Texto')
    await usuario.selectOptions(within(dialogo).getByLabelText('Quando'), 'agendada')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Agendar' }))
    expect(await within(dialogo).findByText('Informe quando publicar.')).toBeInTheDocument()
    expect(criar).not.toHaveBeenCalled()
  })

  it('a pré-visualização mostra o Markdown e nunca HTML', async () => {
    renderizar(servicos(), '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Publicações/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Nova publicação' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova publicação' })
    await usuario.type(within(dialogo).getByLabelText(/Texto/), 'Veja **isto** <b>x</b>')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Pré-visualizar' }))
    const previa = within(dialogo).getByRole('region', { name: 'Pré-visualização' })
    expect(within(previa).getByText('isto').tagName).toBe('STRONG')
    expect(previa.querySelector('b')).toBeNull()
  })

  it('só com "moderar" não vê Nova publicação nem Editar; só com "publicar" não vê a moderação', async () => {
    const soModerar = renderizar(servicos({}, { 'portal.moderar': true }), '/portal')
    await userEvent.setup().click(await screen.findByRole('tab', { name: /Publicações/ }))
    await screen.findByRole('list', { name: 'Comentários da publicação' })
    expect(screen.queryByRole('button', { name: 'Nova publicação' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    soModerar.unmount()

    const comentarios = vi.fn(async () => ok({ itens: [comentario()] }))
    renderizar(servicos({ comentarios }, { 'portal.publicar': true }), '/portal')
    expect(await screen.findByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Comentários da publicação' })).toBeNull()
    expect(comentarios).not.toHaveBeenCalled()
    expect(screen.queryByRole('tab', { name: /Chamados/ })).toBeNull()
  })

  it('edita e fixa uma publicação já publicada; a situação não pode voltar a rascunho', async () => {
    const editar = vi.fn(async () => ok(publicacao()))
    const fixar = vi.fn(async () => ok(publicacao({ fixada: true })))
    renderizar(servicos({ editar, fixar }), '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Publicações/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Fixar' }))
    await waitFor(() => expect(fixar).toHaveBeenCalledWith(id(400), true))
    await usuario.click(screen.getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar publicação' })
    expect(within(dialogo).queryByLabelText('Quando')).toBeNull()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() =>
      expect(editar).toHaveBeenCalledWith(
        id(400),
        expect.objectContaining({
          situacao: 'publicada',
          titulo: 'Inscrições: Encontro anual de clientes',
        }),
      ),
    )
  })

  it('exclui com confirmação', async () => {
    const excluir = vi.fn(async () => ok(undefined))
    renderizar(servicos({ excluir }), '/portal')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: /Publicações/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir publicação' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(excluir).toHaveBeenCalledWith(id(400)))
  })

  it('sem publicações, explica', async () => {
    renderizar(servicos({ listar: vi.fn(async () => ok(lista([]))) }), '/portal')
    await userEvent.setup().click(await screen.findByRole('tab', { name: /Publicações/ }))
    expect(await screen.findByText('Nenhuma publicação')).toBeInTheDocument()
  })
})
