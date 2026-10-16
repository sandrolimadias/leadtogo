import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'
import { id, itemDeEmpresa, meComPapel } from '@/telas/contatos/fixtures'

import { atividade, TIPOS } from './fixtures'

function servicos(papel: 'admin' | 'gestor' | 'vendedor' = 'admin') {
  const base = servicosFalsos()
  const criar = vi.fn(async (_corpo: Record<string, unknown>) => ok(atividade(1)))
  const s = servicosFalsos({
    me: async () => meComPapel(papel),
    atividades: { ...base.atividades, criar },
    carteira: {
      ...base.carteira,
      listar: vi.fn(async () =>
        ok({
          itens: [itemDeEmpresa(1, { nome: 'Usidantec' })],
          total: 1,
          pagina: 1,
          porPagina: 8,
        }),
      ),
      opcoes: vi.fn(async () =>
        ok({
          vendedores: [{ id: id(800), nome: 'Alessandro Dias' }],
          unicoMembro: true,
          cidades: [],
          diasAlertaDeContato: 60,
        }),
      ),
    },
    cadastros: {
      ...base.cadastros,
      tiposAtividade: { ...base.cadastros.tiposAtividade, listar: vi.fn(async () => ok(TIPOS)) },
    },
  })
  return { s, criar }
}

async function abrirFormulario(x: ReturnType<typeof servicos>) {
  renderizar(x.s, '/atividades')
  await screen.findByRole('heading', { name: 'Atividades' })
  // o botão da barra do topo (o da página tem o mesmo nome)
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Registrar atividade' })[0] as HTMLElement,
  )
  return screen.findByRole('dialog', { name: 'Registrar atividade' })
}

async function escolherEmpresa(janela: HTMLElement) {
  // o campo de busca fica dentro da própria janela (nada de lista suspensa escondida atrás dela)
  await userEvent.type(within(janela).getByRole('searchbox', { name: 'Buscar empresa' }), 'usid')
  await userEvent.click(await within(janela).findByRole('button', { name: /Usidantec/ }))
}

describe('Registrar atividade', () => {
  it('abre pela barra do topo com Visita, situação Realizada e a data de agora', async () => {
    const x = servicos()
    const janela = await abrirFormulario(x)
    expect(await within(janela).findByRole('button', { name: /Visita/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(janela).getByRole('button', { name: 'Realizada' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(janela).getByLabelText(/Quando aconteceu/)).not.toHaveValue('')
    // o resultado explica o efeito do tipo na carteira
    expect(
      within(janela).getByText(/Atualiza a última visita e o último contato da empresa/),
    ).toBeInTheDocument()
  })

  it('sem preencher, mostra o que falta e não envia', async () => {
    const x = servicos()
    const janela = await abrirFormulario(x)
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar atividade' }))
    expect(await within(janela).findByText('Informe o título.')).toBeInTheDocument()
    expect(within(janela).getByText('Escolha a empresa.')).toBeInTheDocument()
    expect(within(janela).getByText('Informe o resultado.')).toBeInTheDocument()
    expect(x.criar).not.toHaveBeenCalled()
  })

  it('registra a atividade realizada com o responsável padrão (ele mesmo)', async () => {
    const x = servicos()
    const janela = await abrirFormulario(x)
    await escolherEmpresa(janela)
    await userEvent.type(within(janela).getByLabelText(/Título/), 'Visita de rotina')
    await userEvent.type(
      within(janela).getByLabelText(/Resultado/),
      'Conversamos sobre a renovação.',
    )
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar atividade' }))
    await waitFor(() => expect(x.criar).toHaveBeenCalledTimes(1))
    const corpo = x.criar.mock.calls[0]?.[0] ?? {}
    expect(corpo).toMatchObject({
      tipoAtividadeId: TIPOS[0]?.id,
      titulo: 'Visita de rotina',
      empresaId: itemDeEmpresa(1).id,
      situacao: 'realizada',
      resultado: 'Conversamos sobre a renovação.',
      diaInteiro: false,
      importante: false,
      urgente: false,
    })
    expect(corpo).not.toHaveProperty('responsavelId')
    expect(typeof corpo['dataInicio']).toBe('string')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Registrar atividade' })).not.toBeInTheDocument(),
    )
  })

  it('"Registrar e agendar próxima" reabre com a mesma empresa e tipo, Pendente e data vazia', async () => {
    const x = servicos()
    const janela = await abrirFormulario(x)
    await escolherEmpresa(janela)
    await userEvent.click(within(janela).getByRole('button', { name: /Ligação/ }))
    await userEvent.type(within(janela).getByLabelText(/Título/), 'Ligar de novo')
    await userEvent.type(within(janela).getByLabelText(/Resultado/), 'Pediu retorno.')
    await userEvent.click(
      within(janela).getByRole('button', { name: 'Registrar e agendar próxima' }),
    )
    await waitFor(() => expect(x.criar).toHaveBeenCalledTimes(1))

    const nova = await screen.findByRole('dialog', { name: 'Registrar atividade' })
    await waitFor(() =>
      expect(within(nova).getByRole('button', { name: /Ligação/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    expect(within(nova).getByLabelText('Empresa escolhida')).toHaveTextContent('Usidantec')
    expect(within(nova).getByRole('button', { name: /Pendente/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(nova).getByLabelText(/Data e hora/)).toHaveValue('')
    expect(within(nova).queryByLabelText(/Resultado/)).not.toBeInTheDocument()
    expect(within(nova).getByLabelText(/Título/)).toHaveValue('')
  })

  it('ao abrir, nenhuma empresa aparece: os resultados só vêm depois de digitar (e apagar o texto os esconde)', async () => {
    const x = servicos()
    const janela = await abrirFormulario(x)
    expect(within(janela).queryByRole('list', { name: 'Empresas encontradas' })).toBeNull()
    expect(within(janela).queryByRole('region', { name: /Resultados/ })).toBeNull()
    expect(x.s.carteira.listar).not.toHaveBeenCalled()
    const busca = within(janela).getByRole('searchbox', { name: 'Buscar empresa' })
    await userEvent.type(busca, 'usid')
    expect(await within(janela).findByRole('list', { name: 'Empresas encontradas' })).toBeVisible()
    // apagar o texto esconde tudo de novo
    await userEvent.clear(busca)
    expect(within(janela).queryByRole('region', { name: /Resultados/ })).toBeNull()
  })

  it('a empresa se acha pelo campo de busca (nome ou CNPJ), dentro da janela, e dá para trocar', async () => {
    const x = servicos()
    const janela = await abrirFormulario(x)
    const busca = within(janela).getByRole('searchbox', { name: 'Buscar empresa' })
    await userEvent.type(busca, '12.345.678/0001-95')
    await waitFor(() =>
      expect(x.s.carteira.listar).toHaveBeenLastCalledWith(
        expect.objectContaining({ busca: '12.345.678/0001-95' }),
      ),
    )
    await userEvent.click(await within(janela).findByRole('button', { name: /Usidantec/ }))
    expect(within(janela).getByLabelText('Empresa escolhida')).toHaveTextContent('Usidantec')
    expect(within(janela).queryByRole('searchbox', { name: 'Buscar empresa' })).toBeNull()
    await userEvent.click(within(janela).getByRole('button', { name: 'Trocar empresa' }))
    expect(within(janela).getByRole('searchbox', { name: 'Buscar empresa' })).toHaveValue('')
  })

  it('Tarefa não exige empresa', async () => {
    const x = servicos()
    const janela = await abrirFormulario(x)
    await userEvent.click(await within(janela).findByRole('button', { name: /Tarefa/ }))
    await userEvent.type(within(janela).getByLabelText(/Título/), 'Emitir relatório')
    await userEvent.type(within(janela).getByLabelText(/Resultado/), 'Emitido.')
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar atividade' }))
    await waitFor(() => expect(x.criar).toHaveBeenCalledTimes(1))
    expect(x.criar.mock.calls[0]?.[0]).not.toHaveProperty('empresaId')
  })

  it('data no futuro (erro da API) aparece no campo da data', async () => {
    const x = servicos()
    x.criar.mockResolvedValueOnce(
      falha('atividade_no_futuro', 'Uma atividade realizada não pode ter data no futuro.', 400),
    )
    const janela = await abrirFormulario(x)
    await escolherEmpresa(janela)
    await userEvent.type(within(janela).getByLabelText(/Título/), 'Visita')
    await userEvent.type(within(janela).getByLabelText(/Resultado/), 'Ok')
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar atividade' }))
    expect(
      await within(janela).findByText('Uma atividade realizada não pode ter data no futuro.'),
    ).toBeInTheDocument()
    // a janela continua aberta com o que foi digitado
    expect(within(janela).getByLabelText(/Título/)).toHaveValue('Visita')
  })

  it('"Mais opções" tem a Oportunidade para todos; o Responsável só para administrador e gestor', async () => {
    const vend = servicos('vendedor')
    const j1 = await abrirFormulario(vend)
    await userEvent.click(within(j1).getByRole('button', { name: 'Mais opções' }))
    expect(within(j1).getByLabelText('Oportunidade')).toBeInTheDocument()
    expect(within(j1).queryByLabelText('Responsável')).not.toBeInTheDocument()
  })
})
