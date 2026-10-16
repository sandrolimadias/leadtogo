import type { ListaDeAtividades } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'
import { meComPapel } from '@/telas/contatos/fixtures'

import { atividade, TIPOS } from './fixtures'

const lista = (
  itens = [atividade(1), atividade(2, { titulo: 'Ligar para o Zé' })],
  contagens = { agendadas: itens.length, atrasadas: 1, realizadas: 4 },
): ListaDeAtividades => ({
  itens,
  total: itens.length,
  pagina: 1,
  porPagina: 25,
  contagens,
})

function servicos(resposta: ListaDeAtividades = lista()) {
  const base = servicosFalsos()
  const listar = vi.fn(async (_consulta: Record<string, unknown>) => ok(resposta))
  const concluir = vi.fn(async (_id: string, _corpo: Record<string, unknown>) =>
    ok(atividade(1, { situacao: 'realizada' })),
  )
  const cancelar = vi.fn(async (_id: string) => ok(atividade(1, { situacao: 'cancelada' })))
  const excluir = vi.fn(async (_id: string) => ok(undefined))
  const s = servicosFalsos({
    me: async () => meComPapel('admin'),
    atividades: { ...base.atividades, listar, concluir, cancelar, excluir },
    cadastros: {
      ...base.cadastros,
      tiposAtividade: {
        ...base.cadastros.tiposAtividade,
        listar: vi.fn(async () => ok(TIPOS)),
      },
    },
  })
  return { s, listar, concluir, cancelar, excluir }
}

const abrir = async (x: ReturnType<typeof servicos>, rota = '/atividades') => {
  const r = renderizar(x.s, rota)
  await screen.findByRole('heading', { name: 'Atividades' })
  return r
}

/** Sem rolagem vertical própria: nenhum ancestral (até o <main>) vira contêiner de rolagem */
function temRolagemPropria(el: Element): boolean {
  for (let a = el.parentElement; a && a.tagName !== 'MAIN'; a = a.parentElement) {
    if (/(^|\s)overflow-(y-)?(auto|scroll|hidden)(\s|$)/.test(a.className)) return true
  }
  return false
}

describe('Atividades: lista com abas', () => {
  it('abre em Agendadas, com a contagem de cada aba, e pede a aba ao servidor', async () => {
    const x = servicos()
    await abrir(x)
    expect(await screen.findByText('Atividade 1')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Agendadas/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Atrasadas/ })).toHaveTextContent('1')
    expect(screen.getByRole('tab', { name: /Realizadas/ })).toHaveTextContent('4')
    expect(x.listar.mock.calls[0]?.[0]).toMatchObject({
      aba: 'agendadas',
      pagina: 1,
      porPagina: 25,
    })
  })

  it('trocar para Atrasadas e Realizadas muda a consulta (e a URL guarda a aba)', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(screen.getByRole('tab', { name: /Atrasadas/ }))
    await waitFor(() =>
      expect(x.listar).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'atrasadas' })),
    )
    await userEvent.click(screen.getByRole('tab', { name: /Realizadas/ }))
    await waitFor(() =>
      expect(x.listar).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'realizadas' })),
    )
  })

  it('a tabela cresce com as linhas: sem rolagem própria e cabeçalho que gruda no topo', async () => {
    const x = servicos()
    await abrir(x)
    const tabela = await screen.findByRole('table')
    expect(temRolagemPropria(tabela)).toBe(false)
    for (const th of within(tabela).getAllByRole('columnheader')) {
      expect(th.className).toContain('sticky')
      expect(th.className).toContain('top-0')
    }
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toBeInTheDocument()
  })

  it('mostra atrasada em vermelho com a palavra Atrasada', async () => {
    const x = servicos(lista([atividade(1, { atrasada: true })]))
    await abrir(x)
    expect(await screen.findByText('Atrasada', { selector: 'span' })).toBeInTheDocument()
  })

  it('aba vazia explica o que aparece ali', async () => {
    const x = servicos({ ...lista([]), total: 0 })
    await abrir(x)
    expect(await screen.findByText('Nada agendado')).toBeInTheDocument()
  })

  it('o tamanho da página (25, 50 ou 100) é lembrado nas preferências, na tabela "atividades"', async () => {
    const x = servicos()
    await abrir(x)
    await screen.findByText('Atividade 1')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Linhas por página' }), '50')
    await waitFor(() =>
      expect(x.s.alterarPreferencias).toHaveBeenCalledWith({ porPagina: { atividades: 50 } }),
    )
  })

  it('concluir pede o resultado e manda para a API', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Atividade 1' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Concluir' }))
    const janela = await screen.findByRole('dialog', { name: 'Concluir atividade' })
    await userEvent.click(within(janela).getByRole('button', { name: 'Concluir' }))
    expect(await within(janela).findByText('Informe o resultado.')).toBeInTheDocument()
    expect(x.concluir).not.toHaveBeenCalled()
    await userEvent.type(within(janela).getByLabelText(/Resultado/), 'Fechou o pedido')
    await userEvent.click(within(janela).getByRole('button', { name: 'Concluir' }))
    await waitFor(() => expect(x.concluir).toHaveBeenCalled())
    expect(x.concluir.mock.calls[0]?.[0]).toBe(atividade(1).id)
    expect(x.concluir.mock.calls[0]?.[1]).toMatchObject({ resultado: 'Fechou o pedido' })
  })

  it('cancelar e excluir pedem confirmação', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Atividade 1' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar atividade' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar atividade' }))
    await waitFor(() => expect(x.cancelar).toHaveBeenCalledWith(atividade(1).id))
    // a janela precisa fechar por completo (o Radix esconde o resto da página enquanto ela está aberta)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Atividade 1' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(x.excluir).toHaveBeenCalledWith(atividade(1).id))
  })

  it('erro da API na lista aparece como alerta', async () => {
    const x = servicos()
    x.listar.mockResolvedValueOnce(falha('erro_interno', 'Falhou.', 500))
    await abrir(x)
    expect(await screen.findByText('Falhou.')).toBeInTheDocument()
  })

  it('o item do menu e o título dizem Atividades', async () => {
    const x = servicos()
    await abrir(x)
    expect(screen.getByRole('link', { name: 'Atividades' })).toHaveAttribute('href', '/atividades')
    expect(screen.queryByRole('link', { name: 'Tarefas' })).not.toBeInTheDocument()
  })
})
