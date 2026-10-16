import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'
import { id, itemDeEmpresa, meComPapel } from '@/telas/contatos/fixtures'

import { FASES, FUNIL, kanban, oportunidade } from './fixtures'

function servicos(papel: 'admin' | 'gestor' | 'vendedor' = 'admin') {
  const base = servicosFalsos()
  const criar = vi.fn(async (_c: Record<string, unknown>) => ok(oportunidade(9)))
  const alterar = vi.fn(async (_i: string, _c: Record<string, unknown>) => ok(oportunidade(1)))
  const s = servicosFalsos({
    me: async () => meComPapel(papel),
    oportunidades: {
      ...base.oportunidades,
      kanban: vi.fn(async () => ok(kanban())),
      criar,
      alterar,
    },
    carteira: {
      ...base.carteira,
      listar: vi.fn(async () =>
        ok({ itens: [itemDeEmpresa(1, { nome: 'Usidantec' })], total: 1, pagina: 1, porPagina: 6 }),
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
    funis: {
      ...base.funis,
      listar: vi.fn(async () =>
        ok([
          {
            id: FUNIL.id,
            nome: FUNIL.nome,
            padrao: true,
            ativo: true,
            ordem: 0,
            fases: FASES.map((f, i) => ({ ...f, funilId: FUNIL.id, ativo: true, ordem: i })),
          },
        ]),
      ),
    },
    cadastros: {
      ...base.cadastros,
      solucoes: {
        ...base.cadastros.solucoes,
        listar: vi.fn(async () =>
          ok([
            { id: id(980), nome: 'Licença anual', cor: 'blue' as const, ativo: true, ordem: 0 },
          ] as never),
        ),
      },
    },
  })
  return { s, criar, alterar }
}

async function abrirFormulario(x: ReturnType<typeof servicos>) {
  renderizar(x.s, '/oportunidades')
  await screen.findByRole('heading', { name: 'Oportunidades', level: 1 })
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Nova oportunidade' })[0] as HTMLElement,
  )
  return screen.findByRole('dialog', { name: 'Nova oportunidade' })
}

async function escolherEmpresa(j: HTMLElement) {
  await userEvent.type(within(j).getByRole('searchbox', { name: 'Buscar empresa' }), 'usid')
  await userEvent.click(await within(j).findByRole('button', { name: /Usidantec/ }))
}

describe('Nova oportunidade', () => {
  it('o total e o ponderado aparecem na hora: único + mensal × meses (12 por padrão com valor mensal)', async () => {
    const x = servicos()
    const j = await abrirFormulario(x)
    await userEvent.type(within(j).getByLabelText('Valor único (R$)'), '2000')
    await userEvent.type(within(j).getByLabelText('Valor mensal (R$)'), '500')
    // sem duração e com valor mensal: 12 meses → 2.000 + 500 × 12 = 8.000; fase Qualificação = 10% → 800
    expect(within(j).getByText(/Total do contrato:/)).toHaveTextContent(/R\$\s8\.000,00/)
    expect(within(j).getByText(/Ponderado:/)).toHaveTextContent(/R\$\s800,00/)
    await userEvent.type(within(j).getByLabelText('Duração (meses)'), '6')
    expect(within(j).getByText(/Total do contrato:/)).toHaveTextContent(/R\$\s5\.000,00/)
  })

  it('o nome é sugerido (Empresa – Solução) até a pessoa digitar o dela', async () => {
    const x = servicos()
    const j = await abrirFormulario(x)
    await escolherEmpresa(j)
    await userEvent.selectOptions(within(j).getByLabelText('Solução'), 'Licença anual')
    expect(within(j).getByLabelText(/Nome da oportunidade/)).toHaveValue(
      'Usidantec – Licença anual',
    )
    await userEvent.clear(within(j).getByLabelText(/Nome da oportunidade/))
    await userEvent.type(within(j).getByLabelText(/Nome da oportunidade/), 'Contrato 2027')
    await userEvent.selectOptions(within(j).getByLabelText('Solução'), '')
    expect(within(j).getByLabelText(/Nome da oportunidade/)).toHaveValue('Contrato 2027')
  })

  it('sem preencher, mostra o que falta; a data prevista é opcional', async () => {
    const x = servicos()
    const j = await abrirFormulario(x)
    await userEvent.click(within(j).getByRole('button', { name: 'Criar oportunidade' }))
    expect(await within(j).findByText('Escolha a empresa.')).toBeInTheDocument()
    expect(within(j).getByText('Informe o nome da oportunidade.')).toBeInTheDocument()
    expect(x.criar).not.toHaveBeenCalled()
    await userEvent.type(within(j).getByLabelText('Valor único (R$)'), '-5')
    await userEvent.click(within(j).getByRole('button', { name: 'Criar oportunidade' }))
    expect(await within(j).findByText('Informe um valor de zero para cima.')).toBeInTheDocument()
  })

  it('cria com os valores digitados (e sem total: ele é calculado pelo banco)', async () => {
    const x = servicos()
    const j = await abrirFormulario(x)
    await escolherEmpresa(j)
    await userEvent.type(within(j).getByLabelText(/Nome da oportunidade/), 'Contrato anual')
    await userEvent.type(within(j).getByLabelText('Valor único (R$)'), '2000')
    await userEvent.type(within(j).getByLabelText('Valor mensal (R$)'), '500,50')
    await userEvent.click(within(j).getByRole('button', { name: 'Criar oportunidade' }))
    await waitFor(() => expect(x.criar).toHaveBeenCalledTimes(1))
    const corpo = x.criar.mock.calls[0]?.[0] ?? {}
    expect(corpo).toMatchObject({
      titulo: 'Contrato anual',
      empresaId: itemDeEmpresa(1).id,
      funilId: FUNIL.id,
      faseId: FASES[0]!.id,
      valorUnico: 2000,
      valorMensal: 500.5,
      meses: 12,
      dataPrevistaFechamento: null,
    })
    expect(corpo).not.toHaveProperty('valorTotal')
    // probabilidade não digitada: vale a da fase (o servidor decide); responsável: o padrão
    expect(corpo).not.toHaveProperty('probabilidade')
    expect(corpo).not.toHaveProperty('responsavelId')
  })

  it('probabilidade digitada vai ao servidor (editada à mão); a dica explica', async () => {
    const x = servicos()
    const j = await abrirFormulario(x)
    expect(within(j).getByText('Sugerida pela fase: 10%')).toBeInTheDocument()
    await escolherEmpresa(j)
    await userEvent.type(within(j).getByLabelText(/Nome da oportunidade/), 'X')
    await userEvent.type(within(j).getByLabelText('Probabilidade (%)'), '80')
    expect(within(j).getByText(/Editada à mão/)).toBeInTheDocument()
    await userEvent.click(within(j).getByRole('button', { name: 'Criar oportunidade' }))
    await waitFor(() => expect(x.criar).toHaveBeenCalled())
    expect(x.criar.mock.calls[0]?.[0]).toMatchObject({ probabilidade: 80 })
  })
})
