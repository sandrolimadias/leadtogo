import type { Dashboard, ResultadosDoDashboard } from '@leadtogo/api-client'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConteudoDoTooltip } from '@leadtogo/ui/grafico'
import { atividade } from '@/telas/atividades/fixtures'
import { meComPapel } from '@/telas/contatos/fixtures'
import { FASES, FUNIL } from '@/telas/oportunidades/fixtures'
import { falha, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import {
  contornos,
  dashboard,
  FASE_PROPOSTA,
  FUNIL_ID,
  listaDeAssociados,
  mapa,
  MEMBRO,
  MOTIVO_PRECO,
  resultados,
  TAG_CLIENTE,
  VITORIA,
} from './fixtures'

function servicos(
  opcoes: {
    d?: Dashboard
    r?: ResultadosDoDashboard
    papel?: 'admin' | 'gestor' | 'vendedor'
  } = {},
) {
  const base = servicosFalsos()
  const carregar = vi.fn(async (_c: Record<string, unknown>) => ok(opcoes.d ?? dashboard()))
  const carregarResultados = vi.fn(async (_c: Record<string, unknown>) =>
    ok(opcoes.r ?? resultados()),
  )
  const associados = vi.fn(async (c: Record<string, unknown>) =>
    ok(listaDeAssociados(c['tipo'] as 'novos' | 'desassociados')),
  )
  const carregarMapa = vi.fn(async (_c: Record<string, unknown>) => ok(mapa()))
  const carregarContornos = vi.fn(async (_uf: string) => ok(contornos()))
  const metricas = vi.fn(async (_c: Record<string, unknown>) =>
    ok({
      de: '2026-10-01',
      ate: '2026-10-31',
      alcance: 'todas' as const,
      truncado: false,
      geral: {
        total: 17,
        abertos: 4,
        resolvidos: 13,
        tempoPrimeiraRespostaMin: 95,
        tempoResolucaoMin: 600,
        diasEmAberto: 2,
        respostaNoPrazoPct: 90,
        resolucaoNoPrazoPct: 87.5,
      },
      porArea: [],
      porResponsavel: [],
    }),
  )
  const indicadores = vi.fn(async (_j?: unknown) =>
    ok({
      periodoDias: 31,
      emAberto: 6,
      prazoEstourando: 1,
      primeiraRespostaNoPrazo: 92,
      notaMedia: 4.5,
      avaliacoes: 8,
      acessosAtivos: 30,
      pedidosPendentes: 2,
    }),
  )
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
    me: async () => meComPapel(opcoes.papel ?? 'admin'),
    dashboard: {
      carregar,
      resultados: carregarResultados,
      associados,
      mapa: carregarMapa,
      contornos: carregarContornos,
    },
    chamados: { ...base.chamados, metricas },
    portal: { ...base.portal, indicadores },
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
  } as never)
  return {
    s,
    carregar,
    resultados: carregarResultados,
    associados,
    mapa: carregarMapa,
    contornos: carregarContornos,
    metricas,
    indicadores,
    listar,
    concluir,
  }
}

const abrir = async (x: ReturnType<typeof servicos>, rota = '/') => {
  const r = renderizar(x.s, rota)
  await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
  return r
}
const RES = '/?aba=resultados'

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

describe('Dashboard: as duas abas', () => {
  it('abre em Minhas atividades (sem período nem resultados) e troca para Resultados pela aba', async () => {
    const x = servicos()
    const { historico } = await abrir(x)
    expect(await screen.findByText(/, Alessandro$/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Minhas atividades/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByRole('region', { name: 'Minhas atividades' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Período' })).toBeNull()
    expect(x.resultados).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('tab', { name: /Resultados/ }))
    await waitFor(() => expect(historico.location.search).toContain('aba=resultados'))
    await waitFor(() =>
      expect(x.resultados).toHaveBeenCalledWith({ periodo: 'mes', visao: 'minha' }),
    )
    expect(await screen.findByRole('region', { name: 'Vendas no período' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Minhas atividades' })).toBeNull()
  })
})

describe('Dashboard Resultados: indicadores', () => {
  it('os oito cards, sem o "Sem contato há 60 dias"', async () => {
    const x = servicos()
    await abrir(x, RES)
    const previsao = await screen.findByRole('region', { name: 'Previsão (fase final)' })
    expect(previsao).toHaveTextContent(/R\$\s12\.500,00/)
    expect(previsao).toHaveTextContent('3 oportunidades')
    expect(previsao).toHaveTextContent(/R\$\s9\.800,00 ponderado/)
    expect(previsao).toHaveTextContent('2 sem data prevista')
    const vendas = screen.getByRole('region', { name: 'Vendas no período' })
    expect(vendas).toHaveTextContent(/R\$\s41\.400,00/)
    expect(vendas).toHaveTextContent('4 vendas · +15% sobre o período anterior')
    expect(screen.getByRole('region', { name: 'MRR conquistado' })).toHaveTextContent(
      '+18% sobre o período anterior',
    )
    expect(screen.getByRole('region', { name: 'Taxa de conversão' })).toHaveTextContent('66,7%')
    // o nome que a empresa deu ao Status Cliente
    const assoc = screen.getByRole('region', { name: 'Associados' })
    expect(assoc).toHaveTextContent('70')
    expect(assoc).toHaveTextContent('+5 novos · −3 saíram')
    expect(within(assoc).getByRole('link', { name: 'Ver empresas' })).toHaveAttribute(
      'href',
      expect.stringContaining(`status=${TAG_CLIENTE}`),
    )
    const churn = screen.getByRole('region', { name: 'Churn' })
    expect(churn).toHaveTextContent('4,4%')
    expect(churn).toHaveTextContent('3 de 68 saíram')
    expect(screen.getByRole('region', { name: 'Visitas realizadas' })).toHaveTextContent(
      '42+40% sobre o período anterior',
    )
    expect(screen.getByRole('region', { name: 'Atividades realizadas' })).toHaveTextContent(
      'sem as visitas · -20% sobre o período anterior',
    )
    expect(screen.queryByRole('region', { name: /Sem contato/ })).toBeNull()
    expect(screen.getByText('outubro de 2026 · 01/10/2026 a 31/10/2026')).toBeInTheDocument()
  })

  it('sem base: churn com traço e a frase do que falta', async () => {
    const r = resultados()
    const x = servicos({
      r: {
        ...r,
        associados: { ...r.associados, inicio: 0, churn: null, desassociados: 0 },
        vendas: { ...r.vendas, variacao: null },
      },
    })
    await abrir(x, RES)
    const churn = await screen.findByRole('region', { name: 'Churn' })
    expect(churn).toHaveTextContent('—')
    expect(churn).toHaveTextContent('sem associados no início do período')
    expect(screen.getByRole('region', { name: 'Vendas no período' })).toHaveTextContent(
      'sem base no período anterior',
    )
  })

  it('erro mostra o aviso com "Tentar de novo"', async () => {
    const x = servicos()
    x.resultados.mockResolvedValueOnce(falha('erro_interno', 'Falhou.', 500))
    await abrir(x, RES)
    expect(
      await screen.findByText(/Não foi possível carregar os resultados: Falhou\./),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('region', { name: 'Vendas no período' })).toBeInTheDocument()
  })
})

describe('Dashboard Resultados: período e visão', () => {
  it('Mês atual, Mês anterior, Trimestre, Semestre e Ano; o período da URL vale', async () => {
    const x = servicos()
    await abrir(x, `${RES}&periodo=semestre`)
    await waitFor(() =>
      expect(x.resultados).toHaveBeenCalledWith({ periodo: 'semestre', visao: 'minha' }),
    )
    expect(screen.getByRole('button', { name: 'Semestre' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Ano' }))
    await waitFor(() =>
      expect(x.resultados).toHaveBeenLastCalledWith({ periodo: 'ano', visao: 'minha' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mês atual' }))
    await waitFor(() =>
      expect(x.resultados).toHaveBeenLastCalledWith({ periodo: 'mes', visao: 'minha' }),
    )
  })

  it('anos anteriores no seletor e um período específico com validação', async () => {
    const x = servicos()
    const { historico } = await abrir(x, RES)
    const ano = new Date().getFullYear() - 2
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Anos anteriores' }),
      String(ano),
    )
    await waitFor(() =>
      expect(x.resultados).toHaveBeenLastCalledWith({
        periodo: 'ano_anterior',
        ano,
        visao: 'minha',
      }),
    )
    expect(historico.location.search).toContain(`ano=${ano}`)

    await userEvent.click(screen.getByRole('button', { name: 'Período específico' }))
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-05-10' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-05-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O fim vem antes do início.')
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-06-20' } })
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() =>
      expect(x.resultados).toHaveBeenLastCalledWith({
        periodo: 'personalizado',
        de: '2026-05-10',
        ate: '2026-06-20',
        visao: 'minha',
      }),
    )
    // o ano escolhido antes sai da URL
    expect(historico.location.search).not.toContain('ano=')
  })

  it('visão Minha, Equipe e Empresa para quem vê todas; o vendedor não tem o seletor', async () => {
    const x = servicos()
    await abrir(x, RES)
    const visao = await screen.findByRole('group', { name: 'Visão' })
    await userEvent.click(within(visao).getByRole('button', { name: 'Empresa' }))
    await waitFor(() =>
      expect(x.resultados).toHaveBeenLastCalledWith({ periodo: 'mes', visao: 'empresa' }),
    )
    expect(x.mapa).toHaveBeenLastCalledWith({ periodo: 'mes', visao: 'empresa' })

    const v = servicos({ papel: 'vendedor', r: { ...resultados(), visoes: ['minha'] } })
    document.body.innerHTML = ''
    await abrir(v, RES)
    await screen.findByRole('region', { name: 'Vendas no período' })
    expect(screen.queryByRole('group', { name: 'Visão' })).toBeNull()
  })
})

describe('Dashboard Resultados: entradas e saídas de associados', () => {
  it('novos com o MRR; desassociados com o Status de agora e quem tirou; "Ver todos" abre a lista inteira', async () => {
    const x = servicos()
    await abrir(x, RES)
    const cartao = await screen.findByRole('region', { name: 'Associados: entradas e saídas' })
    const novos = await within(cartao).findByRole('list', { name: 'Novos associados' })
    expect(novos).toHaveTextContent('Supermercado Bom Preço')
    expect(novos).toHaveTextContent('Vitória/ES · Alessandro Dias')
    expect(novos).toHaveTextContent(/R\$\s350,00\/mês/)
    expect(x.associados).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'novos', pagina: 1, porPagina: 8 }),
    )
    await userEvent.click(within(cartao).getByRole('tab', { name: /Desassociados/ }))
    const fora = await within(cartao).findByRole('list', { name: 'Desassociados' })
    expect(fora).toHaveTextContent('Padaria Sol')
    expect(fora).toHaveTextContent('Sem cidade · por Sistema')
    expect(within(fora).getByText('Inativo')).toBeInTheDocument()

    // 5 novos e 3 desassociados cabem no cartão (até 8): sem "Ver todos"
    expect(within(cartao).queryByRole('button', { name: /Ver todos/ })).toBeNull()
  })

  it('"Ver todos" quando passa de 8: painel com a lista paginada de 50', async () => {
    const r = resultados()
    const x = servicos({ r: { ...r, associados: { ...r.associados, novos: 12 } } })
    await abrir(x, RES)
    const cartao = await screen.findByRole('region', { name: 'Associados: entradas e saídas' })
    await userEvent.click(await within(cartao).findByRole('button', { name: 'Ver todos (12)' }))
    const painel = await screen.findByRole('dialog', { name: 'Novos associados' })
    expect(await within(painel).findByText('Supermercado Bom Preço')).toBeInTheDocument()
    expect(x.associados).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'novos', porPagina: 50 }),
    )
  })
})

describe('Dashboard Resultados: mapas do estado', () => {
  it('azul dos associados e vermelho das empresas, com a legenda lateral por cidade', async () => {
    const x = servicos()
    await abrir(x, RES)
    const azul = await screen.findByRole('region', { name: 'Associados por município' })
    const vermelho = screen.getByRole('region', { name: 'Empresas no cadastro por município' })
    await waitFor(() => expect(x.contornos).toHaveBeenCalledWith('ES'))
    const svg = await within(azul).findByRole('img')
    expect(svg).toHaveAccessibleName(
      'Associados por município: 2 de 3 municípios do ES; mais em Vitória, 42 associados.',
    )
    const caminhos = svg.querySelectorAll('path[data-municipio]')
    expect(caminhos).toHaveLength(3)
    // Vitória é a mais escura (o token puro); Cariacica, sem associados, o fundo neutro
    const de = (codigo: number) => svg.querySelector(`path[data-municipio="${codigo}"]`)
    expect(de(VITORIA)?.getAttribute('fill')).toContain('var(--tag-blue-fg) 100%')
    expect(de(3201308)?.getAttribute('fill')).toBe('var(--surface-sunken)')
    expect(
      within(vermelho)
        .getByRole('img')
        .querySelector(`path[data-municipio="${VITORIA}"]`)
        ?.getAttribute('fill'),
    ).toContain('var(--tag-red-fg)')

    const cidades = within(azul).getByRole('list', { name: /Cidades/ })
    const vitoria = within(cidades).getByRole('link', { name: /Vitória\s*42/ })
    expect(vitoria).toHaveAttribute('href', expect.stringContaining(`cidade=${VITORIA}`))
    expect(vitoria).toHaveAttribute('href', expect.stringContaining(`status=${TAG_CLIENTE}`))
    // visão Minha: só a carteira do usuário
    expect(vitoria).toHaveAttribute('href', expect.stringContaining(`vendedor=${MEMBRO}`))
    const vitoriaVermelha = within(
      within(vermelho).getByRole('list', { name: /Cidades/ }),
    ).getByRole('link', { name: /Vitória\s*90/ })
    expect(vitoriaVermelha.getAttribute('href')).not.toContain('status=')

    fireEvent.mouseEnter(de(VITORIA) as Element)
    expect(within(azul).getByText('Vitória: 42 associados (91,3% do total)')).toBeInTheDocument()
    expect(azul).toHaveTextContent('1 fora do ES · Limites municipais: IBGE')
    expect(vermelho).toHaveTextContent('4 fora do ES · 1 sem cidade')
  })

  it('sem o endereço da empresa que usa o CRM: diz como resolver', async () => {
    const x = servicos()
    x.mapa.mockResolvedValue(ok(mapa({ uf: null, municipios: [] })))
    await abrir(x, RES)
    expect(
      await screen.findByText(/Cadastre a cidade da sua empresa em Configurações → Empresa/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastrar o endereço' })).toHaveAttribute(
      'href',
      '/configuracoes/empresa',
    )
    expect(x.contornos).not.toHaveBeenCalled()
  })
})

describe('Dashboard Resultados: chamados e portal do cliente', () => {
  it('os cards das métricas dos chamados e do portal, no período', async () => {
    const x = servicos()
    await abrir(x, RES)
    const chamados = await screen.findByRole('region', { name: 'Chamados' })
    expect(x.metricas).toHaveBeenCalledWith({ de: '2026-10-01', ate: '2026-10-31' })
    expect(await within(chamados).findByText('17')).toBeInTheDocument()
    expect(chamados).toHaveTextContent('87,5%')
    expect(within(chamados).getByRole('link', { name: 'Ver métricas' })).toBeInTheDocument()
    const portal = screen.getByRole('region', { name: 'Portal do cliente' })
    expect(x.indicadores).toHaveBeenCalledWith({ de: '2026-10-01', ate: '2026-10-31' })
    expect(await within(portal).findByText('4,5')).toBeInTheDocument()
    expect(portal).toHaveTextContent('Prazo estourando')
  })

  it('sem as permissões, as faixas não aparecem', async () => {
    const x = servicos({ papel: 'vendedor', r: { ...resultados(), visoes: ['minha'] } })
    await abrir(x, RES)
    await screen.findByRole('region', { name: 'Vendas no período' })
    expect(screen.queryByRole('region', { name: 'Chamados' })).toBeNull()
    expect(x.metricas).not.toHaveBeenCalled()
  })
})

describe('Dashboard Resultados: gráficos', () => {
  it('o gráfico do funil traz o resumo para o leitor de tela e links equivalentes para o teclado', async () => {
    const x = servicos()
    await abrir(x, RES)
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
  })

  it('clicar numa barra do funil leva às Oportunidades daquele funil, na fase', async () => {
    const x = servicos()
    const { historico } = await abrir(x, RES)
    const funil = await screen.findByRole('group', { name: /Funil Vendas/ })
    const barras = await waitFor(() => {
      const b = funil.querySelectorAll('.recharts-bar-rectangle')
      expect(b.length).toBeGreaterThan(0)
      return Array.from(b)
    })
    fireEvent.click(barras[2] as Element)
    await waitFor(() => expect(historico.location.pathname).toBe('/oportunidades'))
    expect(historico.location.search).toContain(`fase=${FASE_PROPOSTA}`)
  })

  it('tooltip: título, quantidade, valor e percentual, e avisa que dá para clicar', () => {
    const { container } = render(
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
    const tip = within(container).getByRole('status')
    expect(tip).toHaveTextContent('Proposta')
    expect(tip).toHaveTextContent('69%')
    expect(tip).toHaveTextContent('Clique para ver a lista')
  })
})

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
    expect(x.concluir.mock.calls[0]?.[1]).toEqual({ resultado: 'Fechou o pedido' })
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
  })
})
