import type { ListaDeLotesDeImportacao } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`

const me = (papel: 'admin' | 'gestor' | 'vendedor' = 'admin') =>
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

type Item = ListaDeLotesDeImportacao['itens'][number]
const lote = (n: number, extra: Partial<Item> = {}): Item => ({
  id: id(n),
  nome: `Importação ${n}`,
  tipo: 'empresas',
  nomeArquivo: `planilha_${n}.xlsx`,
  situacao: 'concluida',
  totalLinhas: 40,
  totais: { criada: 30, fora_do_perfil: 2, pulada_sem_cnpj: 3, pulada_duplicada: 4, erro: 1 },
  criadoPor: 'Alessandro Dias',
  criadoEm: '2026-10-15T13:42:00.000Z',
  concluidoEm: '2026-10-15T14:10:00.000Z',
  ...extra,
})

function servicos(
  papel: 'admin' | 'gestor' | 'vendedor' = 'admin',
  listar = vi.fn(async (_pagina?: number) =>
    ok({
      itens: [
        lote(1),
        lote(2, {
          situacao: 'desfeita',
          totais: { criada: 30, desfeitas: 28, mantidas: 2 },
        }),
      ],
      total: 2,
      pagina: 1,
      porPagina: 20,
    }),
  ),
) {
  const base = servicosFalsos()
  return {
    listar,
    s: servicosFalsos({
      me: async () => me(papel),
      importacao: { ...base.importacao, lotes: { ...base.importacao.lotes, listar } },
    }),
  }
}

describe('Importações: a lista de lotes', () => {
  it('mostra cada lote com o resumo do que fez, a situação e quem importou', async () => {
    renderizar(servicos().s, '/importacao')
    const lista = await screen.findByRole('list', { name: 'Importações' })
    const um = within(lista).getByRole('listitem', { name: 'Importação 1' })
    expect(
      within(um).getByText('40 linhas · 30 importadas · 2 fora do perfil · 7 puladas · 1 com erro'),
    ).toBeInTheDocument()
    expect(within(um).getByText('Concluída')).toBeInTheDocument()
    expect(within(um).getByText(/planilha_1\.xlsx/)).toBeInTheDocument()
    expect(within(um).getByText(/Alessandro Dias/)).toBeInTheDocument()
    const dois = within(lista).getByRole('listitem', { name: 'Importação 2' })
    expect(within(dois).getByText('Desfeita')).toBeInTheDocument()
    expect(within(dois).getByText(/28 removidas · 2 ficaram na carteira/)).toBeInTheDocument()
  })

  it('abre o lote pelo nome e leva ao envio com "Importar planilha"', async () => {
    const { historico } = renderizar(servicos().s, '/importacao')
    await userEvent.click(await screen.findByRole('link', { name: 'Importação 1' }))
    await waitFor(() => expect(historico.location.pathname).toBe(`/importacao/${id(1)}`))
  })

  it('o botão "Importar planilha" abre o envio', async () => {
    const { historico } = renderizar(servicos().s, '/importacao')
    await userEvent.click(await screen.findByRole('button', { name: 'Importar planilha' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/importacao/nova'))
  })

  it('sem importações, convida a enviar a primeira planilha', async () => {
    renderizar(
      servicos(
        'admin',
        vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 20 })),
      ).s,
      '/importacao',
    )
    expect(await screen.findByText('Nenhuma importação ainda')).toBeInTheDocument()
  })

  it('lote que parou mostra o motivo; erro de carregamento deixa tentar de novo', async () => {
    const parou = lote(3, {
      situacao: 'falhou',
      totais: { criada: 5, motivo: 'A Receita ficou fora do ar.' },
    })
    const listar = vi
      .fn()
      .mockResolvedValueOnce(falha('indisponivel', 'Sem conexão com o servidor.', 500))
      .mockResolvedValue(ok({ itens: [parou], total: 1, pagina: 1, porPagina: 20 }))
    renderizar(servicos('admin', listar).s, '/importacao')
    expect(await screen.findByText('Sem conexão com o servidor.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('A Receita ficou fora do ar.')).toBeInTheDocument()
    expect(screen.getByText('Parou')).toBeInTheDocument()
  })

  it('pagina a lista', async () => {
    const listar = vi.fn(async (pagina: number = 1) =>
      ok({ itens: [lote(pagina)], total: 45, pagina, porPagina: 20 }),
    )
    renderizar(servicos('admin', listar).s, '/importacao')
    await screen.findByText('Página 1 de 3')
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    await screen.findByText('Página 2 de 3')
    expect(listar).toHaveBeenLastCalledWith(2)
  })

  it('o vendedor não vê a lista: volta para o início', async () => {
    const { historico } = renderizar(servicos('vendedor').s, '/importacao')
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })
})
