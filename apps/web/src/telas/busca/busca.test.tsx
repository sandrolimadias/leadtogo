import type { BuscaRecente, ResultadoDaBuscaGlobal } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const EMPRESA = '01a111e8-f08a-70b7-b5f3-52998ced0b01'
const CONTATO = '01a111e8-f08a-70b7-b5f3-52998ced0b02'
const OPORTUNIDADE = '01a111e8-f08a-70b7-b5f3-52998ced0b03'

const RESULTADO: ResultadoDaBuscaGlobal = {
  empresas: [
    {
      id: EMPRESA,
      titulo: 'Acme Indústria',
      subtitulo: 'Vitória/ES · Ana',
      status: { nome: 'Cliente', cor: 'green' },
      destino: `/empresas/${EMPRESA}`,
    },
  ],
  contatos: [
    {
      id: CONTATO,
      titulo: 'Joana Acme',
      subtitulo: 'Acme Indústria · Diretora',
      status: null,
      destino: `/contatos/${CONTATO}`,
    },
  ],
  oportunidades: [
    {
      id: OPORTUNIDADE,
      titulo: 'Contrato Acme',
      subtitulo: 'Acme Indústria · Proposta · R$ 1.500,00',
      status: null,
      destino: `/oportunidades/${OPORTUNIDADE}`,
    },
  ],
}

const recente = (n: number, termo: string): BuscaRecente => ({
  id: `01a111e8-f08a-70b7-b5f3-52998ced0c0${n}`,
  termo,
  buscadoEm: '2026-10-29T12:00:00.000Z',
})

function servicos(
  opcoes: { resultado?: ResultadoDaBuscaGlobal; recentes?: BuscaRecente[]; erro?: boolean } = {},
) {
  const base = servicosFalsos()
  const busca = {
    buscar: vi.fn(async (_c: { q: string }) =>
      opcoes.erro
        ? falha('indisponivel', 'Fora do ar.', 503)
        : ok(opcoes.resultado ?? { empresas: [], contatos: [], oportunidades: [] }),
    ),
    recentes: vi.fn(async () => ok(opcoes.recentes ?? [])),
    registrar: vi.fn(async (termo: string) => ok([recente(9, termo)])),
    apagar: vi.fn(async () => ok(undefined)),
    limpar: vi.fn(async () => ok(undefined)),
  }
  const s = servicosFalsos({ me: async () => meDeAdmin(), busca, carteira: base.carteira })
  return { s, busca }
}

const caixa = () => screen.findByRole('combobox', { name: /Buscar empresas/ })

describe('busca global na barra do topo', () => {
  it('com a caixa vazia mostra as buscas recentes; o x apaga uma e "Limpar histórico" apaga todas', async () => {
    const { s, busca } = servicos({ recentes: [recente(1, 'usidantec'), recente(2, 'padaria')] })
    renderizar(s, '/')
    const u = userEvent.setup()
    await u.click(await caixa())
    const lista = await screen.findByRole('listbox', { name: 'Busca global' })
    const grupo = within(lista).getByRole('group', { name: 'Buscas recentes' })
    expect(
      within(grupo)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['usidantec', 'padaria'])

    await u.click(screen.getByRole('button', { name: 'Remover "padaria" das buscas recentes' }))
    expect(busca.apagar).toHaveBeenCalledWith(recente(2, 'padaria').id)
    await waitFor(() => expect(within(grupo).getAllByRole('option')).toHaveLength(1))

    await u.click(screen.getByRole('button', { name: 'Limpar histórico' }))
    expect(busca.limpar).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('clicar numa busca recente coloca o termo na caixa e busca', async () => {
    const { s, busca } = servicos({ recentes: [recente(1, 'acme')], resultado: RESULTADO })
    renderizar(s, '/')
    const u = userEvent.setup()
    await u.click(await caixa())
    await u.click(await screen.findByRole('option', { name: 'acme' }))
    expect(await caixa()).toHaveValue('acme')
    await waitFor(() => expect(busca.buscar).toHaveBeenCalledWith({ q: 'acme', limite: 5 }))
    expect(await screen.findByRole('option', { name: /^Acme Indústria/ })).toBeInTheDocument()
  })

  it('digitando, sugere por tipo; ↓ e Enter abrem a ficha e gravam o termo', async () => {
    const { s, busca } = servicos({ resultado: RESULTADO })
    const { historico } = renderizar(s, '/')
    const u = userEvent.setup()
    await u.type(await caixa(), 'acme')
    const lista = await screen.findByRole('listbox', { name: 'Busca global' })
    await within(lista).findByRole('group', { name: 'Empresas' })
    expect(within(lista).getByRole('group', { name: 'Contatos' })).toHaveTextContent('Joana Acme')
    expect(within(lista).getByRole('group', { name: 'Oportunidades' })).toHaveTextContent(
      'Contrato Acme',
    )
    expect(within(lista).getByText('Cliente')).toBeInTheDocument()

    await u.keyboard('{ArrowDown}{ArrowDown}')
    const campo = await caixa()
    const marcada = document.getElementById(campo.getAttribute('aria-activedescendant') ?? '')
    expect(marcada).toHaveTextContent('Joana Acme')
    expect(marcada).toHaveAttribute('aria-selected', 'true')
    await u.keyboard('{Enter}')
    await waitFor(() => expect(historico.location.pathname).toBe(`/contatos/${CONTATO}`))
    expect(busca.registrar).toHaveBeenCalledWith('acme')
  })

  it('Enter sem item marcado abre a tela /busca; "Ver todos os resultados" também', async () => {
    const { s, busca } = servicos({ resultado: RESULTADO })
    const { historico } = renderizar(s, '/')
    const u = userEvent.setup()
    await u.type(await caixa(), 'acme{Enter}')
    await waitFor(() => expect(historico.location.pathname).toBe('/busca'))
    expect(historico.location.search).toContain('q=acme')
    expect(busca.registrar).toHaveBeenCalledWith('acme')
  })

  it('pede 2 letras, avisa quando não acha e quando a busca falha; Esc fecha', async () => {
    const vazio = servicos()
    renderizar(vazio.s, '/')
    const u = userEvent.setup()
    await u.type(await caixa(), 'a')
    expect(await screen.findByText('Digite ao menos 2 letras.')).toBeInTheDocument()
    await u.type(await caixa(), 'x')
    expect(await screen.findByText('Nada encontrado para “ax”.')).toBeInTheDocument()
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(vazio.busca.registrar).not.toHaveBeenCalled()
  })

  it('a busca que falha oferece "Tentar de novo"', async () => {
    const { s } = servicos({ erro: true })
    renderizar(s, '/')
    const u = userEvent.setup()
    await u.type(await caixa(), 'acme')
    const lista = await screen.findByRole('listbox', { name: 'Busca global' })
    expect(await within(lista).findByText(/Não foi possível buscar agora/)).toBeInTheDocument()
    expect(within(lista).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('Ctrl+K e "/" levam o foco à busca', async () => {
    const { s } = servicos()
    renderizar(s, '/')
    const u = userEvent.setup()
    const campo = await caixa()
    expect(campo).not.toHaveFocus()
    await u.keyboard('{Control>}k{/Control}')
    expect(campo).toHaveFocus()
    campo.blur()
    await u.keyboard('/')
    expect(campo).toHaveFocus()
    expect(campo).toHaveValue('')
  })
})

describe('tela /busca', () => {
  it('mostra as seções do termo da URL, com "Ver todos" para a lista do tipo', async () => {
    const { s, busca } = servicos({ resultado: RESULTADO })
    renderizar(s, '/busca?q=acme')
    const empresas = await screen.findByRole('region', { name: 'Empresas' })
    expect(within(empresas).getByRole('button', { name: /Acme Indústria/ })).toBeInTheDocument()
    expect(within(empresas).getByRole('link', { name: /Ver todos em Empresas/ })).toHaveAttribute(
      'href',
      '/empresas?busca=acme',
    )
    expect(
      within(screen.getByRole('region', { name: 'Oportunidades' })).getByRole('link', {
        name: /Ver todos em Oportunidades/,
      }),
    ).toHaveAttribute('href', '/oportunidades?visao=lista&busca=acme')
    expect(busca.buscar).toHaveBeenCalledWith({ q: 'acme', limite: 5 })
  })

  it('escolher um resultado grava o termo e abre a ficha', async () => {
    const { s, busca } = servicos({ resultado: RESULTADO })
    const { historico } = renderizar(s, '/busca?q=acme')
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: /Contrato Acme/ }))
    await waitFor(() => expect(historico.location.pathname).toBe(`/oportunidades/${OPORTUNIDADE}`))
    expect(busca.registrar).toHaveBeenCalledWith('acme')
  })

  it('com o campo vazio, mostra as buscas recentes', async () => {
    const { s } = servicos({ recentes: [recente(1, 'usidantec')] })
    renderizar(s, '/busca')
    const recentes = await screen.findByRole('region', { name: 'Buscas recentes' })
    const u = userEvent.setup()
    await u.click(within(recentes).getByRole('button', { name: 'usidantec' }))
    expect(screen.getByRole('searchbox', { name: 'O que você procura?' })).toHaveValue('usidantec')
  })

  it('sem resultado, diz o que fazer', async () => {
    const { s } = servicos()
    renderizar(s, '/busca?q=zzz')
    expect(await screen.findByText('Nada encontrado para “zzz”')).toBeInTheDocument()
  })
})
