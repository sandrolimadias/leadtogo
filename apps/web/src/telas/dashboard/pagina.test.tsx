import type { Dashboard } from '@leadtogo/api-client'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConteudoDoTooltip } from '@leadtogo/ui/grafico'
import { atividade } from '@/telas/atividades/fixtures'
import { meComPapel } from '@/telas/contatos/fixtures'
import { FASES, FUNIL } from '@/telas/oportunidades/fixtures'
import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { dashboard, FASE_PROPOSTA, FUNIL_ID, MEMBRO, MOTIVO_PRECO, TAG_CLIENTE } from './fixtures'

function servicos(d: Dashboard = dashboard()) {
  const base = servicosFalsos()
  const carregar = vi.fn(async (_c: Record<string, unknown>) => ok(d))
  const listar = vi.fn(async (c: Record<string, unknown>) => {
    const itens = c['aba'] === 'hoje' ? [atividade(1, { titulo: 'Visitar o Zé' })] : []
    return ok({
      itens,
      total: itens.length,
      pagina: 1,
      porPagina: 8,
      contagens: { agendadas: 0, atrasadas: 1, realizadas: 0, hoje: itens.length, proximos7: 3 },
    })
  })
  const concluir = vi.fn(async (_id: string, _c: Record<string, unknown>) =>
    ok(atividade(1, { situacao: 'realizada' })),
  )
  const s = servicosFalsos({
    me: async () => meComPapel('admin'),
    dashboard: { carregar },
    atividades: { ...base.atividades, listar: listar, concluir },
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
  })
  return { s, carregar, listar, concluir }
}

const abrir = async (x: ReturnType<typeof servicos>, rota = '/') => {
  const r = renderizar(x.s, rota)
  await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
  return r
}

/** O jsdom não mede nada: o ResizeObserver de teste avisa um tamanho, e o Recharts desenha os gráficos de verdade. */
const original = globalThis.ResizeObserver
beforeEach(() => {
  globalThis.ResizeObserver = class {
    constructor(private readonly aviso: ResizeObserverCallback) {}
    observe = (alvo: Element) =>
      this.aviso(
        [{ target: alvo, contentRect: { width: 600, height: 320 } } as ResizeObserverEntry],
        this,
      )
    unobserve = () => {}
    disconnect = () => {}
  }
})
afterEach(() => {
  globalThis.ResizeObserver = original
})

describe('Dashboard: indicadores e blocos', () => {
  it('mostra a saudação, os 4 indicadores e a carteira com as contagens', async () => {
    const x = servicos()
    await abrir(x)
    expect(await screen.findByText(/, Alessandro$/)).toBeInTheDocument()
    const previsao = await screen.findByRole('region', { name: 'Previsão do período' })
    expect(previsao).toHaveTextContent(/R\$\s12\.500,00/)
    expect(previsao).toHaveTextContent('3 oportunidades')
    expect(previsao).toHaveTextContent('2 sem previsão')
    const mrr = screen.getByRole('region', { name: 'MRR conquistado' })
    expect(mrr).toHaveTextContent(/R\$\s3\.450,00/)
    expect(mrr).toHaveTextContent('+18% sobre o período anterior')
    const conversao = screen.getByRole('region', { name: 'Taxa de conversão' })
    expect(conversao).toHaveTextContent('66,7%')
    expect(conversao).toHaveTextContent('4 conquistadas × 2 perdidas')
    const sem = screen.getByRole('region', { name: 'Sem contato há 60 dias' })
    expect(sem).toHaveTextContent('23')
    expect(within(sem).getByRole('link', { name: 'Ver as 23' })).toHaveAttribute(
      'href',
      expect.stringContaining('semContato=60'),
    )
    const carteira = screen.getByRole('region', { name: 'Carteira' })
    // o Status vem pelo nome que a empresa deu à tag (Associado), com a contagem
    expect(within(carteira).getByRole('link', { name: 'Associado 70' })).toHaveAttribute(
      'href',
      expect.stringContaining(`status=${TAG_CLIENTE}`),
    )
    expect(carteira).toHaveTextContent('148 empresas')
    expect(carteira).toHaveTextContent('9 empresas novas no período')
    const lista = within(carteira).getByRole('list', { name: 'Empresas sem contato' })
    expect(within(lista).getByText('Nunca')).toBeInTheDocument()
    expect(within(lista).getByText('95 dias')).toBeInTheDocument()
    expect(within(lista).getByRole('link', { name: /Mercado Central/ })).toBeInTheDocument()
  })

  it('o período da URL e a troca de período pedem os números do período certo', async () => {
    const x = servicos()
    await abrir(x, '/?periodo=trimestre')
    await waitFor(() => expect(x.carregar).toHaveBeenCalledWith({ periodo: 'trimestre' }))
    expect(screen.getByRole('button', { name: 'Trimestre' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await waitFor(() => expect(x.carregar).toHaveBeenLastCalledWith({ periodo: 'mes_anterior' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mês atual' }))
    await waitFor(() => expect(x.carregar).toHaveBeenLastCalledWith({ periodo: 'mes' }))
  })

  it('variação sem base e taxa sem fechamentos aparecem como "sem base" e traço', async () => {
    const d = dashboard()
    const x = servicos({
      ...d,
      mrr: { ...d.mrr, variacao: null, anterior: 0 },
      conversao: { taxa: null, conquistadas: 0, perdidas: 0 },
    })
    await abrir(x)
    expect(await screen.findByText('sem base no período anterior')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Taxa de conversão' })).toHaveTextContent('—')
  })

  it('estados vazios: cada bloco diz o que falta, sem gráfico em branco', async () => {
    const d = dashboard()
    const x = servicos({
      ...d,
      mrr: {
        ...d.mrr,
        valor: 0,
        quantidade: 0,
        serie: d.mrr.serie.map((p) => ({ ...p, valor: 0, quantidade: 0 })),
      },
      resultado: {
        conquistadas: { quantidade: 0, total: 0, mensal: 0 },
        perdidasECanceladas: { quantidade: 0, total: 0, perdidas: 0, canceladas: 0 },
      },
      motivosDePerda: [],
      funil: { ...d.funil, fases: d.funil.fases.map((f) => ({ ...f, quantidade: 0, total: 0 })) },
      carteira: {
        total: 0,
        porStatus: d.carteira.porStatus.map((s) => ({ ...s, quantidade: 0 })),
        novas: 0,
      },
      semContato: { dias: 60, total: 0, itens: [] },
    })
    await abrir(x)
    expect(await screen.findByText('Sem MRR conquistado nos últimos 6 meses.')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma oportunidade ativa neste funil.')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma oportunidade fechada neste período.')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma perda neste período.')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma empresa na sua carteira.')).toBeInTheDocument()
    expect(
      screen.getByText('Nenhum cliente ou prospect parado: todos tiveram contato no prazo.'),
    ).toBeInTheDocument()
  })

  it('carregando mostra o esqueleto e erro mostra o aviso com "Tentar de novo"', async () => {
    const x = servicos()
    x.carregar.mockResolvedValueOnce(falha('erro_interno', 'Falhou.', 500))
    await abrir(x)
    expect(
      await screen.findByText(/Não foi possível carregar o Dashboard: Falhou\./),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('region', { name: 'Previsão do período' })).toBeInTheDocument()
  })

  it('o gráfico traz o resumo em palavras para o leitor de tela e links equivalentes para o teclado', async () => {
    const x = servicos()
    await abrir(x)
    const funil = await screen.findByRole('group', {
      name: /Funil Vendas: Qualificação, 3 oportunidades/,
    })
    expect(funil).toBeInTheDocument()
    const links = screen.getByRole('navigation', { name: 'Oportunidades por fase' })
    const proposta = within(links).getByRole('link', { name: /Proposta: 2 oportunidades/ })
    expect(proposta).toHaveAttribute('href', expect.stringContaining(`fase=${FASE_PROPOSTA}`))
    expect(proposta).toHaveAttribute('href', expect.stringContaining(`funil=${FUNIL_ID}`))
    const motivos = screen.getByRole('navigation', { name: 'Oportunidades perdidas por motivo' })
    expect(within(motivos).getByRole('link', { name: /Preço: 2/ })).toHaveAttribute(
      'href',
      expect.stringContaining(`motivo=${MOTIVO_PRECO}`),
    )
    const status = screen.getByRole('navigation', { name: 'Empresas por status' })
    expect(within(status).getByRole('link', { name: 'Associado: 70' })).toHaveAttribute(
      'href',
      expect.stringContaining(`vendedor=${MEMBRO}`),
    )
  })

  it('clicar numa barra do funil leva às Oportunidades daquele funil, na fase', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    const funil = await screen.findByRole('group', { name: /Funil Vendas/ })
    const barras = await waitFor(() => {
      const b = funil.querySelectorAll('.recharts-bar-rectangle')
      expect(b.length).toBeGreaterThan(0)
      return Array.from(b)
    })
    // a terceira barra é a fase Proposta
    fireEvent.click(barras[2] as Element)
    await waitFor(() => expect(historico.location.pathname).toBe('/oportunidades'))
    expect(historico.location.search).toContain(`fase=${FASE_PROPOSTA}`)
    expect(historico.location.search).toContain('visao=lista')
  })
})

describe('Tooltip dos gráficos', () => {
  it('mostra o título, a quantidade, o valor e o percentual, e avisa que dá para clicar', () => {
    const { container } = renderizarTooltip()
    const tip = within(container).getByRole('status')
    expect(tip).toHaveTextContent('Proposta')
    expect(tip).toHaveTextContent('Oportunidades')
    expect(tip).toHaveTextContent(/R\$\s20\.000,00/)
    expect(tip).toHaveTextContent('Do funil')
    expect(tip).toHaveTextContent('69%')
    expect(tip).toHaveTextContent('Clique para ver a lista')
  })
})

import { render } from '@testing-library/react'

function renderizarTooltip() {
  return render(
    <ConteudoDoTooltip
      titulo="Proposta"
      linhas={[
        { rotulo: 'Oportunidades', valor: '2', cor: 'var(--tag-indigo-fg)' },
        { rotulo: 'Total', valor: 'R$ 20.000,00' },
        { rotulo: 'Do funil', valor: '69%' },
      ]}
      aviso="Clique para ver a lista"
    />,
  )
}

describe('Minhas atividades', () => {
  it('abas Hoje, Atrasadas e Próximos 7 dias com contagem; trocar de aba pede a janela', async () => {
    const x = servicos()
    await abrir(x)
    const card = await screen.findByRole('region', { name: 'Minhas atividades' })
    expect(await within(card).findByText('Visitar o Zé')).toBeInTheDocument()
    expect(x.listar).toHaveBeenCalledWith(expect.objectContaining({ aba: 'hoje', minhas: 'true' }))
    expect(within(card).getByRole('tab', { name: /Atrasadas/ })).toHaveTextContent('1')
    await userEvent.click(within(card).getByRole('tab', { name: /Próximos 7 dias/ }))
    await waitFor(() =>
      expect(x.listar).toHaveBeenLastCalledWith(expect.objectContaining({ aba: 'proximos7' })),
    )
    expect(within(card).getByRole('link', { name: 'Ver agenda' })).toBeInTheDocument()
    expect(
      within(card).getAllByRole('link', { name: 'Ver todas as atividades' }).length,
    ).toBeGreaterThan(0)
  })

  it('conclusão rápida na linha: pede o resultado e conclui', async () => {
    const x = servicos()
    await abrir(x)
    const card = await screen.findByRole('region', { name: 'Minhas atividades' })
    await userEvent.click(
      await within(card).findByRole('button', { name: 'Concluir Visitar o Zé' }),
    )
    await userEvent.click(within(card).getByRole('button', { name: 'Concluir atividade' }))
    expect(await within(card).findByText('Informe o resultado.')).toBeInTheDocument()
    expect(x.concluir).not.toHaveBeenCalled()
    await userEvent.type(within(card).getByLabelText(/Resultado/), 'Fechou o pedido')
    await userEvent.click(within(card).getByRole('button', { name: 'Concluir atividade' }))
    await waitFor(() => expect(x.concluir).toHaveBeenCalledTimes(1))
    expect(x.concluir.mock.calls[0]?.[0]).toBe(atividade(1).id)
    expect(x.concluir.mock.calls[0]?.[1]).toEqual({ resultado: 'Fechou o pedido' })
    // recarrega o Dashboard e as janelas (os números mudam)
    await waitFor(() => expect(x.carregar.mock.calls.length).toBeGreaterThan(1))
  })

  it('"Concluir e agendar próxima" conclui e abre o formulário com a mesma empresa, em Pendente', async () => {
    const x = servicos()
    await abrir(x)
    const card = await screen.findByRole('region', { name: 'Minhas atividades' })
    await userEvent.click(
      await within(card).findByRole('button', { name: 'Concluir Visitar o Zé' }),
    )
    await userEvent.type(within(card).getByLabelText(/Resultado/), 'Ok')
    await userEvent.click(within(card).getByRole('button', { name: 'Concluir e agendar próxima' }))
    const janela = await screen.findByRole('dialog', { name: 'Registrar atividade' })
    expect(within(janela).getByLabelText('Empresa escolhida')).toHaveTextContent('Usidantec')
    expect(within(janela).getByRole('button', { name: /Pendente/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('uma atividade que não é do usuário editar não mostra o botão Concluir; janela vazia diz o que fazer', async () => {
    const x = servicos()
    x.listar.mockResolvedValueOnce(
      ok({
        itens: [atividade(2, { titulo: 'Só leitura', editavel: false })],
        total: 1,
        pagina: 1,
        porPagina: 8,
        contagens: { agendadas: 0, atrasadas: 0, realizadas: 0, hoje: 1, proximos7: 0 },
      }),
    )
    await abrir(x)
    const card = await screen.findByRole('region', { name: 'Minhas atividades' })
    expect(await within(card).findByText('Só leitura')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /Concluir Só leitura/ })).toBeNull()
    await userEvent.click(within(card).getByRole('tab', { name: /Atrasadas/ }))
    expect(
      await within(card).findByText('Nenhuma atividade atrasada. Tudo em dia.'),
    ).toBeInTheDocument()
  })
})
