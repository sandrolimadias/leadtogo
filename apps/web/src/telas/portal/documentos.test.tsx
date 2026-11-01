import type { Documento, ItemDeDocumento } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, meComChamados } from '../chamados/fixtures'

const PERMISSOES = { 'portal.ver': true, 'portal.documentos': true } as const

const item = (extra: Partial<ItemDeDocumento> = {}): ItemDeDocumento => ({
  id: id(500),
  titulo: 'Guia rápido do portal',
  descricao: 'Passo a passo',
  alcance: 'todos',
  visivelNoPortal: true,
  arquivo: {
    nome: 'guia.pdf',
    mime: 'application/pdf',
    tamanho: 327_680,
    estado: 'limpo',
    enviado: true,
  },
  totalDownloads: 3,
  criadoEm: '2026-10-20T10:00:00.000Z',
  atualizadoEm: '2026-10-20T10:00:00.000Z',
  ...extra,
})

const documento = (extra: Partial<Documento> = {}): Documento => ({
  ...item(),
  empresas: [],
  tags: [],
  ...extra,
})

function servicos(
  troca: Record<string, unknown> = {},
  permissoes: Record<string, true> = { ...PERMISSOES },
  itens: ItemDeDocumento[] = [item()],
) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados({ 'chamados.ver': 'todas', ...permissoes }),
    portal: {
      ...base.portal,
      documentos: {
        ...base.portal.documentos,
        listar: vi.fn(async () => ok({ itens, total: itens.length })),
        obter: vi.fn(async () => ok(documento())),
        ...troca,
      },
    },
  })
}

async function abrirAba(s: ReturnType<typeof servicos>) {
  renderizar(s, '/portal')
  const usuario = userEvent.setup()
  await usuario.click(await screen.findByRole('tab', { name: 'Documentos' }))
  return usuario
}

describe('hub do portal: documentos', () => {
  it('lista com estado do antivírus, alcance, downloads e visibilidade', async () => {
    await abrirAba(
      servicos({}, undefined, [
        item(),
        item({
          id: id(501),
          titulo: 'Arquivo suspeito',
          alcance: 'empresas',
          arquivo: {
            nome: 'x.zip',
            mime: 'application/zip',
            tamanho: 100,
            estado: 'infectado',
            enviado: true,
          },
        }),
        item({
          id: id(502),
          titulo: 'Em análise',
          visivelNoPortal: false,
          arquivo: {
            nome: 'y.pdf',
            mime: 'application/pdf',
            tamanho: 100,
            estado: 'pendente_varredura',
            enviado: true,
          },
        }),
      ]),
    )
    const lista = await screen.findByRole('list', { name: 'Documentos' })
    expect(within(lista).getByText('Guia rápido do portal')).toBeInTheDocument()
    expect(within(lista).getByText('Disponível')).toBeInTheDocument()
    expect(within(lista).getByText('Bloqueado pelo antivírus')).toBeInTheDocument()
    expect(within(lista).getByText('Em verificação')).toBeInTheDocument()
    expect(within(lista).getByText('Fora do portal')).toBeInTheDocument()
    expect(within(lista).getByText(/guia\.pdf · 320 KB/)).toBeInTheDocument()
    expect(within(lista).getByText(/empresas escolhidas/)).toBeInTheDocument()
    // só o limpo tem "Baixar"
    expect(within(lista).getAllByRole('button', { name: 'Baixar' })).toHaveLength(1)
  })

  it('envia um documento: cadastra, sobe o arquivo e confirma', async () => {
    const criar = vi.fn(async () =>
      ok({
        documento: documento(),
        envio: {
          url: 'https://armazenamento/envio',
          cabecalhos: {},
          expiraEm: '2026-10-21T10:00:00.000Z',
        },
      }),
    )
    const enviar = vi.fn(async () => ok(undefined))
    const confirmar = vi.fn(async () => ok(documento()))
    const usuario = await abrirAba(servicos({ criar, enviar, confirmar }))
    await usuario.click(await screen.findByRole('button', { name: 'Novo documento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo documento' })
    const enviarBotao = within(dialogo).getByRole('button', { name: 'Enviar documento' })
    expect(enviarBotao).toBeDisabled()
    await usuario.type(within(dialogo).getByLabelText(/Título/), 'Tabela de preços')
    await usuario.type(within(dialogo).getByLabelText('Descrição'), 'Valores 2027')
    const arquivo = new File(['conteúdo'], 'precos.pdf', { type: 'application/pdf' })
    await usuario.upload(within(dialogo).getByLabelText(/Arquivo/), arquivo)
    await usuario.click(enviarBotao)
    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        titulo: 'Tabela de preços',
        descricao: 'Valores 2027',
        alcance: 'todos',
        empresaIds: [],
        tagIds: [],
        arquivo: { nome: 'precos.pdf', mime: 'application/pdf', tamanho: arquivo.size },
      }),
    )
    await waitFor(() => expect(enviar).toHaveBeenCalledWith('https://armazenamento/envio', arquivo))
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(id(500)))
  })

  it('erro do antivírus não configurado aparece no diálogo e nada é enviado', async () => {
    const criar = vi.fn(async () =>
      falha(
        'anexos_indisponiveis',
        'O envio de arquivos ainda não está configurado (antivírus).',
        503,
      ),
    )
    const enviar = vi.fn(async () => ok(undefined))
    const usuario = await abrirAba(servicos({ criar, enviar }))
    await usuario.click(await screen.findByRole('button', { name: 'Novo documento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo documento' })
    await usuario.type(within(dialogo).getByLabelText(/Título/), 'Tabela de preços')
    await usuario.upload(
      within(dialogo).getByLabelText(/Arquivo/),
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
    )
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar documento' }))
    expect(await within(dialogo).findByText(/ainda não está configurado/)).toBeInTheDocument()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('tira do portal sem excluir, edita e exclui com confirmação', async () => {
    const editar = vi.fn(async () => ok(documento({ visivelNoPortal: false })))
    const excluir = vi.fn(async () => ok(undefined))
    const usuario = await abrirAba(servicos({ editar, excluir }))
    await usuario.click(await screen.findByRole('button', { name: 'Tirar do portal' }))
    await waitFor(() => expect(editar).toHaveBeenCalledWith(id(500), { visivelNoPortal: false }))
    await usuario.click(screen.getByRole('button', { name: 'Editar' }))
    const edicao = await screen.findByRole('dialog', { name: 'Editar documento' })
    expect(within(edicao).queryByLabelText(/Arquivo/)).toBeNull()
    await usuario.clear(within(edicao).getByLabelText(/Título/))
    await usuario.type(within(edicao).getByLabelText(/Título/), 'Guia atualizado')
    await usuario.click(within(edicao).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(editar).toHaveBeenLastCalledWith(id(500), {
        titulo: 'Guia atualizado',
        descricao: 'Passo a passo',
        alcance: 'todos',
        empresaIds: [],
        tagIds: [],
      }),
    )
    await usuario.click(await screen.findByRole('button', { name: 'Excluir' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Excluir documento' })
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(excluir).toHaveBeenCalledWith(id(500)))
  })

  it('mostra quem baixou', async () => {
    const baixas = vi.fn(async () =>
      ok({
        itens: [
          {
            pessoa: 'Sérgio Nunes',
            empresa: 'Caldeiraria Anchieta',
            baixadoEm: '2026-10-21T10:00:00.000Z',
          },
        ],
        total: 1,
      }),
    )
    const usuario = await abrirAba(servicos({ baixas }))
    await usuario.click(
      await screen.findByRole('button', { name: /3 downloads de Guia rápido do portal/ }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Quem baixou' })
    expect(await within(dialogo).findByText('Sérgio Nunes')).toBeInTheDocument()
    expect(within(dialogo).getByText('Caldeiraria Anchieta')).toBeInTheDocument()
  })

  it('só com "ver" (sem portal.documentos) não vê Novo documento, Editar nem Excluir', async () => {
    await abrirAba(servicos({}, { 'portal.ver': true }))
    await screen.findByRole('list', { name: 'Documentos' })
    expect(screen.queryByRole('button', { name: 'Novo documento' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull()
  })

  it('sem documentos, explica', async () => {
    await abrirAba(servicos({}, undefined, []))
    expect(await screen.findByText('Nenhum documento')).toBeInTheDocument()
  })
})
