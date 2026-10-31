import type { Chamado } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { chamadoCompleto, id, meComChamados } from './fixtures'

const TUDO = {
  'chamados.ver': 'todas',
  'chamados.criar': true,
  'chamados.atender': 'todas',
  'chamados.triar': true,
  'chamados.atribuir': true,
} as const

function servicos(chamado: Chamado, atualizado?: Chamado) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => meComChamados({ ...TUDO }),
    chamados: {
      ...base.chamados,
      obter: vi.fn(async () => ok(chamado)),
      assumir: vi.fn(async () => ok(atualizado ?? chamado)),
      alterarStatus: vi.fn(async () => ok(atualizado ?? chamado)),
      reabrir: vi.fn(async () => ok(atualizado ?? chamado)),
      mensagem: vi.fn(async () => ok(atualizado ?? chamado)),
      nota: vi.fn(async () => ok(atualizado ?? chamado)),
      triar: vi.fn(async () => ok(atualizado ?? chamado)),
      atendentes: vi.fn(async () => ok([{ id: id(900), nome: 'Ana Atendente' }])),
      areas: {
        ...base.chamados.areas,
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
      anexos: {
        pedir: vi.fn(async () =>
          ok({
            anexoId: id(60),
            url: 'https://armazenamento/put',
            cabecalhos: {},
            expiraEm: '2026-10-21T15:00:00.000Z',
          }),
        ),
        enviar: vi.fn(async () => ok(undefined)),
        confirmar: vi.fn(async () =>
          ok({
            id: id(60),
            nome: 'contrato.pdf',
            mime: 'application/pdf',
            tamanho: 2048,
            estado: 'pendente_varredura' as const,
            criadoEm: '2026-10-21T14:00:00.000Z',
          }),
        ),
        baixar: vi.fn(async () =>
          ok({ url: 'https://armazenamento/get', expiraEm: '2026-10-21T15:00:00.000Z' }),
        ),
      },
    },
  })
}

const comMensagem = (extra: Partial<Chamado> = {}) =>
  chamadoCompleto({
    mensagens: [
      {
        id: id(30),
        autor: { tipo: 'membro', id: id(900), nome: 'Ana Atendente' },
        corpo: 'Vou analisar o contrato hoje.',
        anexos: [
          {
            id: id(31),
            nome: 'minuta.pdf',
            mime: 'application/pdf',
            tamanho: 4096,
            estado: 'limpo',
            criadoEm: '2026-10-21T14:00:00.000Z',
          },
          {
            id: id(32),
            nome: 'planilha.xlsx',
            mime: 'application/vnd.ms-excel',
            tamanho: 4096,
            estado: 'infectado',
            criadoEm: '2026-10-21T14:00:00.000Z',
          },
          {
            id: id(33),
            nome: 'novo.docx',
            mime: 'application/msword',
            tamanho: 4096,
            estado: 'pendente_varredura',
            criadoEm: '2026-10-21T14:00:00.000Z',
          },
        ],
        criadoEm: '2026-10-21T14:00:00.000Z',
      },
    ],
    ...extra,
  })

describe('Chamado: conversa, notas internas e anexos', () => {
  it('mostra a descrição, a conversa, o histórico e os dados; as notas internas ficam numa seção à parte', async () => {
    const ch = comMensagem({
      notasInternas: [
        {
          id: id(40),
          autor: { id: id(900), nome: 'Ana Atendente' },
          corpo: 'Cliente inadimplente.',
          criadoEm: '2026-10-21T15:00:00.000Z',
        },
      ],
      acoes: { ...chamadoCompleto().acoes, notaInterna: true },
    })
    renderizar(servicos(ch), `/chamados/${ch.id}`)
    expect(
      await screen.findByRole('heading', { name: 'Revisar contrato do cliente' }),
    ).toBeInTheDocument()
    const conversa = screen.getByRole('region', { name: 'Conversa' })
    expect(
      within(conversa).getByText('Preciso que o contrato seja revisado até sexta.'),
    ).toBeInTheDocument()
    expect(within(conversa).getByText('Vou analisar o contrato hoje.')).toBeInTheDocument()
    // link colado ou palavra longa quebra dentro do balão em vez de vazar (a descrição é a primeira mensagem)
    for (const texto of [
      'Preciso que o contrato seja revisado até sexta.',
      'Vou analisar o contrato hoje.',
    ])
      expect(within(conversa).getByText(texto)).toHaveClass('[overflow-wrap:anywhere]')
    // a nota interna NÃO está na conversa: tem a seção própria, com o aviso de que só a equipe vê
    expect(within(conversa).queryByText('Cliente inadimplente.')).not.toBeInTheDocument()
    const notas = screen.getByRole('region', { name: 'Notas internas' })
    expect(within(notas).getByText('Cliente inadimplente.')).toBeInTheDocument()
    expect(within(notas).getByText(/só a equipe vê/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Histórico' })).getByText(/abriu o chamado/),
    ).toBeInTheDocument()
  })

  it('quem não atende não tem a seção de notas internas', async () => {
    const ch = comMensagem()
    renderizar(servicos(ch), `/chamados/${ch.id}`)
    await screen.findByRole('heading', { name: 'Revisar contrato do cliente' })
    expect(screen.queryByRole('region', { name: 'Notas internas' })).not.toBeInTheDocument()
  })

  it('anexo limpo baixa; infectado fica bloqueado; em verificação não tem botão', async () => {
    const ch = comMensagem()
    const s = servicos(ch)
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    renderizar(s, `/chamados/${ch.id}`)
    const anexos = await screen.findByRole('list', { name: 'Anexos' })
    expect(within(anexos).getByText('Verificado')).toBeInTheDocument()
    expect(within(anexos).getByText('Bloqueado (vírus)')).toBeInTheDocument()
    expect(within(anexos).getByText('Verificando')).toBeInTheDocument()
    expect(within(anexos).getAllByRole('button', { name: /Baixar/ })).toHaveLength(1)
    await userEvent.click(within(anexos).getByRole('button', { name: 'Baixar minuta.pdf' }))
    await waitFor(() => expect(s.chamados.anexos.baixar).toHaveBeenCalledWith(ch.id, id(31)))
    expect(abrir).toHaveBeenCalledWith('https://armazenamento/get', '_blank', 'noopener')
    abrir.mockRestore()
  })

  it('responder com anexo: pede a URL, envia o arquivo, confirma e só então manda a mensagem com o anexo', async () => {
    const ch = chamadoCompleto()
    const s = servicos(ch, comMensagem())
    renderizar(s, `/chamados/${ch.id}`)
    const arquivo = new File([new Uint8Array(2048)], 'contrato.pdf', { type: 'application/pdf' })
    await userEvent.upload(await screen.findByLabelText('Anexar arquivos'), arquivo)
    expect(screen.getByRole('list', { name: 'Arquivos a enviar' })).toHaveTextContent(
      'contrato.pdf',
    )
    const form = screen.getByRole('form', { name: 'Responder' })
    expect(within(form).getByRole('button', { name: 'Enviar' })).toBeDisabled()
    await userEvent.type(within(form).getByLabelText('Responder'), 'Segue o contrato.')
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar' }))
    await waitFor(() =>
      expect(s.chamados.mensagem).toHaveBeenCalledWith(ch.id, {
        corpo: 'Segue o contrato.',
        anexoIds: [id(60)],
      }),
    )
    expect(s.chamados.anexos.pedir).toHaveBeenCalledWith(ch.id, {
      nome: 'contrato.pdf',
      mime: 'application/pdf',
      tamanho: 2048,
    })
    expect(s.chamados.anexos.enviar).toHaveBeenCalledWith('https://armazenamento/put', arquivo)
    expect(s.chamados.anexos.confirmar).toHaveBeenCalledWith(ch.id, id(60))
    const ordem = [
      vi.mocked(s.chamados.anexos.pedir).mock.invocationCallOrder[0] ?? 0,
      vi.mocked(s.chamados.anexos.enviar).mock.invocationCallOrder[0] ?? 0,
      vi.mocked(s.chamados.anexos.confirmar).mock.invocationCallOrder[0] ?? 0,
      vi.mocked(s.chamados.mensagem).mock.invocationCallOrder[0] ?? 0,
    ]
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b))
    // a resposta nova entra na conversa e o campo esvazia
    expect(await screen.findByText('Vou analisar o contrato hoje.')).toBeInTheDocument()
    expect(within(form).getByLabelText('Responder')).toHaveValue('')
  })

  it('arquivo de mais de 25 MB é recusado antes de enviar; falha no envio mostra o motivo e não manda a mensagem', async () => {
    const ch = chamadoCompleto()
    const s = servicos(ch)
    vi.mocked(s.chamados.anexos.pedir).mockResolvedValueOnce(
      falha(
        'anexos_indisponiveis',
        'O envio de anexos ainda não está configurado (antivírus).',
        503,
      ),
    )
    renderizar(s, `/chamados/${ch.id}`)
    const grande = new File([new Uint8Array(1)], 'enorme.bin')
    Object.defineProperty(grande, 'size', { value: 26 * 1024 * 1024 })
    await userEvent.upload(await screen.findByLabelText('Anexar arquivos'), grande)
    expect(await screen.findByText(/passa de 25 MB/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Arquivos a enviar' })).not.toBeInTheDocument()

    await userEvent.upload(
      screen.getByLabelText('Anexar arquivos'),
      new File(['x'], 'ok.pdf', { type: 'application/pdf' }),
    )
    await userEvent.type(screen.getByRole('textbox', { name: 'Responder' }), 'Olha')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(/ainda não está configurado/)).toBeInTheDocument()
    expect(s.chamados.mensagem).not.toHaveBeenCalled()
  })
})

describe('Chamado: ações', () => {
  it('só mostra o que o servidor permite: assumir, atribuir, estado, prioridade', async () => {
    const ch = chamadoCompleto({
      acoes: {
        responder: true,
        notaInterna: true,
        triar: false,
        atribuir: true,
        assumir: true,
        alterarStatus: true,
        reabrir: false,
        statusPossiveis: ['em_atendimento', 'resolvido'],
      },
    })
    const s = servicos(ch)
    renderizar(s, `/chamados/${ch.id}`)
    expect(await screen.findByRole('button', { name: 'Atribuir…' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Assumir' }))
    await waitFor(() => expect(s.chamados.assumir).toHaveBeenCalledWith(ch.id))
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Triar' })).not.toBeInTheDocument()
    const estado = screen.getByLabelText('Mudar o estado')
    expect(
      within(estado)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Escolha o novo estado', 'Em atendimento', 'Resolvido'])
    await userEvent.selectOptions(estado, 'resolvido')
    await waitFor(() => expect(s.chamados.alterarStatus).toHaveBeenCalledWith(ch.id, 'resolvido'))
    await userEvent.selectOptions(screen.getByLabelText('Prioridade'), 'urgente')
    await waitFor(() =>
      expect(s.chamados.alterar).toHaveBeenCalledWith(ch.id, { prioridade: 'urgente' }),
    )
  })

  it('triagem: escolhe a área, a prioridade e o responsável (que vem dos atendentes da área)', async () => {
    const ch = chamadoCompleto({
      status: 'aguardando_triagem',
      area: null,
      acoes: { ...chamadoCompleto().acoes, triar: true },
    })
    const s = servicos(ch, chamadoCompleto())
    renderizar(s, `/chamados/${ch.id}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Triar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Triar chamado' })
    expect(within(dialogo).getByRole('button', { name: 'Triar' })).toBeDisabled()
    await userEvent.selectOptions(within(dialogo).getByLabelText(/Área/), id(10))
    await waitFor(() => expect(s.chamados.atendentes).toHaveBeenCalledWith(id(10)))
    await userEvent.selectOptions(
      await within(dialogo).findByLabelText('Responsável (opcional)'),
      id(900),
    )
    await userEvent.selectOptions(within(dialogo).getByLabelText('Prioridade'), 'alta')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Triar' }))
    await waitFor(() =>
      expect(s.chamados.triar).toHaveBeenCalledWith(ch.id, {
        areaId: id(10),
        prioridade: 'alta',
        responsavelId: id(900),
      }),
    )
  })

  it('resolvido dentro do prazo: reabre; erro da API aparece em português', async () => {
    const ch = chamadoCompleto({
      status: 'resolvido',
      resolvidoEm: '2026-10-21T14:00:00.000Z',
      acoes: { ...chamadoCompleto().acoes, reabrir: true, responder: false },
    })
    const s = servicos(ch, chamadoCompleto({ status: 'em_atendimento', reaberturas: 1 }))
    renderizar(s, `/chamados/${ch.id}`)
    expect(screen.queryByRole('form', { name: 'Responder' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Reabrir' }))
    await waitFor(() => expect(s.chamados.reabrir).toHaveBeenCalledWith(ch.id))

    const erro = servicos(ch)
    vi.mocked(erro.chamados.reabrir).mockResolvedValue(
      falha(
        'prazo_de_reabertura_vencido',
        'O prazo de 7 dias para reabrir já passou: abra um novo chamado.',
        409,
      ),
    )
    const { unmount } = renderizar(erro, `/chamados/${ch.id}`)
    unmount()
    renderizar(erro, `/chamados/${ch.id}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Reabrir' }))
    expect(await screen.findByText(/prazo de 7 dias/)).toBeInTheDocument()
  })

  it('chamado que não é visível mostra o erro e o caminho de volta', async () => {
    const s = servicos(chamadoCompleto())
    vi.mocked(s.chamados.obter).mockResolvedValue(
      falha('chamado_nao_encontrado', 'Chamado não encontrado.', 404),
    )
    renderizar(s, `/chamados/${id(404)}`)
    expect(await screen.findByText(/Chamado não encontrado/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Chamados/ }),
    ).toBeInTheDocument()
  })
})
