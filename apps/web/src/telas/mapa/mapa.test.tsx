import type { OpcoesDoMapa, PontosDoMapa } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { empresaDeTeste } from '@/telas/empresas/fixtures'
import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

// O mapa de verdade (WebGL) não roda no jsdom: este falso lista os pins e as bolhas como botões.
vi.mock('@/components/mapa/mapa-base', () => ({
  MapaBase: (p: {
    pins?: { id: string; rotulo: string; cor: string; visitada?: boolean; selecionado?: boolean }[]
    bolhas?: { id: string; total: number; rotulo?: string; texto?: string }[]
    areas?: unknown[]
    fonteDosDados?: string
    aoMover?: (a: {
      oeste: number
      sul: number
      leste: number
      norte: number
      zoom: number
    }) => void
    aoClicarNoPin?: (id: string) => void
    aoClicarNaBolha?: (id: string) => void
    aoClicarNoMapa?: (la: number, lo: number) => void
  }) => {
    useEffect(() => {
      p.aoMover?.({ oeste: -40.6, sul: -20.6, leste: -40, norte: -19.9, zoom: 12 })
      // só uma vez: é a área inicial do mapa
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
      <div role="application" aria-label="Mapa das empresas" data-areas={(p.areas ?? []).length}>
        {p.fonteDosDados ? <p>{p.fonteDosDados}</p> : null}
        {(p.pins ?? []).map((x) => (
          <button
            key={x.id}
            type="button"
            data-cor={x.cor}
            data-visitada={String(x.visitada ?? false)}
            data-selecionado={String(x.selecionado ?? false)}
            onClick={() => p.aoClicarNoPin?.(x.id)}
          >
            {`pin ${x.rotulo}`}
          </button>
        ))}
        {(p.bolhas ?? []).map((b) => (
          <button key={b.id} type="button" onClick={() => p.aoClicarNaBolha?.(b.id)}>
            {b.rotulo ?? `bolha ${b.total}`}
            {b.texto ? ` (${b.texto})` : ''}
          </button>
        ))}
        <button type="button" onClick={() => p.aoClicarNoMapa?.(-20.3, -40.3)}>
          Tocar no mapa em -20,3 e -40,3
        </button>
        <button type="button" onClick={() => p.aoClicarNoMapa?.(-20.2, -40.2)}>
          Tocar no mapa em -20,2 e -40,2
        </button>
      </div>
    )
  },
}))

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const me = (papel: 'admin' | 'gestor' | 'vendedor' = 'gestor') =>
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

const TAG_LEAD = id(601)
const TAG_PROSPECT = id(602)
const TAG_CLIENTE = id(603)

const opcoes = (extra: Partial<OpcoesDoMapa> = {}): OpcoesDoMapa => ({
  uf: 'ES',
  chips: [
    {
      tagId: TAG_LEAD,
      chave: 'lead',
      nome: 'Leads',
      cor: 'verde-agua',
      ligadoAoAbrir: true,
      total: 10,
      porLote: true,
    },
    {
      tagId: TAG_PROSPECT,
      chave: 'prospect',
      nome: 'Prospects',
      cor: 'ambar',
      ligadoAoAbrir: false,
      total: 5,
      porLote: false,
    },
    {
      tagId: TAG_CLIENTE,
      chave: 'cliente',
      nome: 'Associados',
      cor: 'verde',
      ligadoAoAbrir: true,
      total: 11,
      porLote: false,
    },
  ],
  legenda: [
    {
      chave: `tag:${TAG_LEAD}`,
      fixa: false,
      nomePadrao: 'Lead',
      corPadrao: 'verde-agua',
      nome: 'Leads',
      cor: 'verde-agua',
      personalizada: true,
      regra: 'x',
    },
    {
      chave: `tag:${TAG_CLIENTE}`,
      fixa: false,
      nomePadrao: 'Cliente',
      corPadrao: 'verde',
      nome: 'Associados',
      cor: 'verde',
      personalizada: true,
      regra: 'x',
    },
    {
      chave: 'sem_visita',
      fixa: true,
      nomePadrao: 'Sem visita há 60+ dias',
      corPadrao: 'alerta',
      nome: 'Sem visita há 60+ dias',
      cor: 'alerta',
      personalizada: false,
      regra: 'x',
    },
    {
      chave: 'visita_tentada',
      fixa: true,
      nomePadrao: 'Visita tentada',
      corPadrao: 'indigo',
      nome: 'Visita tentada',
      cor: 'indigo',
      personalizada: false,
      regra: 'x',
    },
  ],
  vendedores: [{ id: id(900), nome: 'Alessandro Dias' }],
  cidades: [{ codigoIbge: 3205309, nome: 'Vitória' }],
  regioes: [{ id: 'micro:32009', nome: 'Vitória (microrregião)' }],
  lotesDeLeads: [{ id: id(700), nome: 'Lote de outubro', comCoordenada: 30 }],
  limiteDeLeads: 500,
  centroInicial: { latitude: -20.3, longitude: -40.3, zoom: 9 },
  mapaInstalado: true,
  ...extra,
})

const pontos = (extra: Partial<PontosDoMapa> = {}): PontosDoMapa => ({
  total: 2,
  pontos: [
    {
      id: id(100),
      nome: 'Alfa Ltda',
      latitude: -20.3,
      longitude: -40.3,
      estado: `tag:${TAG_CLIENTE}`,
      visitada: true,
      precisao: 'exata',
      origem: 'cnefe',
      cidade: 'Vitória',
    },
    {
      id: id(101),
      nome: 'Beta Ltda',
      latitude: -20.31,
      longitude: -40.31,
      estado: 'sem_visita',
      visitada: false,
      precisao: 'aproximada',
      origem: 'nominatim',
      cidade: 'Serra',
    },
  ],
  agrupamentos: [],
  leads: { mostrados: 0, total: 0, limite: 500 },
  ...extra,
})

function servicos(
  papel: 'admin' | 'gestor' | 'vendedor' = 'gestor',
  extra: Record<string, unknown> = {},
) {
  const m = {
    opcoes: vi.fn(async () => ok(opcoes())),
    legenda: {
      ler: vi.fn(async () => ok({ entradas: opcoes().legenda })),
      alterar: vi.fn(async () => ok({ entradas: opcoes().legenda })),
      restaurar: vi.fn(async () => ok({ entradas: opcoes().legenda })),
    },
    pontos: vi.fn(async (_c: unknown) => ok(pontos())),
    proximas: vi.fn(async (_c: unknown) =>
      ok({
        total: 2,
        limite: 500,
        itens: [
          {
            id: id(110),
            nome: 'Gama Ltda',
            cidade: 'Vitória',
            latitude: -20.31,
            longitude: -40.3,
            estado: 'x',
            visitada: false,
            distanciaM: 1200,
          },
          {
            id: id(111),
            nome: 'Delta Ltda',
            cidade: 'Serra',
            latitude: -20.32,
            longitude: -40.3,
            estado: 'x',
            visitada: true,
            distanciaM: 3400,
          },
        ],
      }),
    ),
    selecao: vi.fn(async (_d: unknown) =>
      ok({
        total: 1,
        limite: 500,
        itens: [
          {
            id: id(120),
            nome: 'Épsilon Ltda',
            cidade: 'Vitória',
            latitude: -20.25,
            longitude: -40.25,
            estado: 'x',
            visitada: false,
            distanciaM: null,
          },
        ],
      }),
    ),
    cobertura: vi.fn(async () =>
      ok({
        municipios: [
          {
            codigoIbge: 3205309,
            nome: 'Vitória',
            latitude: -20.28,
            longitude: -40.3,
            total: 40,
            visitadas: 12,
            faltam: 28,
          },
        ],
      }),
    ),
    ...extra,
  }
  const base = servicosFalsos()
  return {
    m: m as typeof m & Record<string, never>,
    s: servicosFalsos({
      me: async () => me(papel),
      mapa: m,
      carteira: {
        ...base.carteira,
        detalhar: vi.fn(async (idDaEmpresa: string) =>
          ok(
            empresaDeTeste({
              id: idDaEmpresa,
              nome: idDaEmpresa === id(100) ? 'Alfa Ltda' : 'Outra Ltda',
              ultimaVisitaEm: '2026-10-01T12:00:00.000Z',
              posicao: {
                estado: 'exata',
                latitude: -20.3,
                longitude: -40.3,
                precisao: 'exata',
                aproximacao: null,
                origem: 'cnefe',
                raioM: 100,
                atualizadoEm: null,
                ajusteManual: false,
                enderecoMudouDepoisDoAjuste: false,
                centroSugerido: null,
                faltas: [],
              },
            }),
          ),
        ),
      },
      tags: {
        ...base.tags,
        listar: vi.fn(async () =>
          ok([
            {
              id: id(800),
              nome: 'Interesse',
              selecao: 'multipla' as const,
              obrigatorio: false,
              sistema: false,
              automatico: false,
              ativo: true,
              ordem: 0,
              tags: [
                {
                  id: id(801),
                  tagGrupoId: id(800),
                  nome: 'Quente',
                  cor: 'red' as const,
                  ativo: true,
                  ordem: 0,
                  chaveSistema: null,
                  apareceNoMapa: true,
                  visivelAoAbrir: true,
                },
              ],
            },
          ]),
        ),
      },
    }),
  }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, '/mapa')
  await screen.findByRole('application', { name: 'Mapa das empresas' })
  return r
}

describe('Mapa: chips, pins e legenda', () => {
  it('chips gerados das tags de Status (Prospect desligado ao abrir) e a legenda do tenant', async () => {
    const x = servicos()
    await abrir(x)
    const grupo = await screen.findByRole('group', { name: 'Status das empresas' })
    expect(within(grupo).getByRole('button', { name: /Leads/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(grupo).getByRole('button', { name: /Prospects/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(grupo).getByRole('button', { name: /Associados/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const legenda = screen.getByRole('region', { name: 'Legenda do mapa' })
    expect(within(legenda).getByText('Associados')).toBeInTheDocument()
    expect(within(legenda).getByText('Sem visita há 60+ dias')).toBeInTheDocument()
    expect(within(legenda).getByText('Visita tentada')).toBeInTheDocument()
    expect(within(legenda).getByText(/Visto no pin = já visitada alguma vez/)).toBeInTheDocument()
    await waitFor(() => expect(x.m.pontos).toHaveBeenCalled())
    const chamada = x.m.pontos.mock.calls[0]?.[0] as { statusTagIds: string[]; zoom: number }
    expect(chamada.statusTagIds).toEqual([TAG_LEAD, TAG_CLIENTE])
  })

  it('cada pin leva a cor do estado da legenda e o visto de visitada', async () => {
    await abrir(servicos())
    const alfa = await screen.findByRole('button', { name: 'pin Alfa Ltda, Vitória' })
    expect(alfa).toHaveAttribute('data-cor', '--tag-green-fg')
    expect(alfa).toHaveAttribute('data-visitada', 'true')
    const beta = screen.getByRole('button', { name: 'pin Beta Ltda, Serra' })
    expect(beta).toHaveAttribute('data-cor', '--danger')
    expect(beta).toHaveAttribute('data-visitada', 'false')
    expect(await screen.findByText(/nesta área/)).toHaveTextContent('2 empresas')
  })

  it('ligar um chip refaz a consulta com o Status; desligar todos manda lista vazia', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: /Prospects/ }))
    await waitFor(() => {
      const ultima = x.m.pontos.mock.calls.at(-1)?.[0] as { statusTagIds: string[] }
      expect(ultima.statusTagIds).toEqual([TAG_LEAD, TAG_CLIENTE, TAG_PROSPECT])
    })
    await userEvent.click(screen.getByRole('button', { name: /Associados/ }))
    await userEvent.click(screen.getByRole('button', { name: /Leads/ }))
    await userEvent.click(screen.getByRole('button', { name: /Prospects/ }))
    await waitFor(() => {
      const ultima = x.m.pontos.mock.calls.at(-1)?.[0] as { statusTagIds: string[] }
      expect(ultima.statusTagIds).toEqual([])
    })
  })

  it('mostra "Fonte: IBGE – CNEFE 2022" só quando algum pin veio do CNEFE', async () => {
    await abrir(servicos())
    expect(await screen.findByText('Fonte: IBGE – CNEFE 2022')).toBeInTheDocument()
  })

  it('sem pin do CNEFE, a fonte não aparece', async () => {
    const x = servicos()
    x.m.pontos.mockResolvedValue(
      ok(pontos({ pontos: pontos().pontos.map((q) => ({ ...q, origem: 'nominatim' as const })) })),
    )
    await abrir(x)
    await screen.findByRole('button', { name: 'pin Alfa Ltda, Vitória' })
    expect(screen.queryByText(/CNEFE 2022/)).toBeNull()
  })

  it('"Clientes sem visita 60+ dias" liga o atalho e manda semVisitaDias=60', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(
      await screen.findByRole('button', { name: /Clientes sem visita 60\+ dias/ }),
    )
    await waitFor(() => {
      const ultima = x.m.pontos.mock.calls.at(-1)?.[0] as { semVisitaDias?: number }
      expect(ultima.semVisitaDias).toBe(60)
    })
  })

  it('a busca filtra pelo texto (com um respiro para não consultar a cada tecla)', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.type(
      await screen.findByRole('searchbox', { name: 'Buscar empresa, bairro ou cidade' }),
      'alfa',
    )
    await waitFor(() => {
      const ultima = x.m.pontos.mock.calls.at(-1)?.[0] as { busca?: string }
      expect(ultima.busca).toBe('alfa')
    })
  })

  it('leads só por lote: avisa e, com o lote marcado, manda `lotes` e mostra o contador', async () => {
    const x = servicos()
    x.m.pontos.mockResolvedValue(ok(pontos({ leads: { mostrados: 30, total: 120, limite: 500 } })))
    await abrir(x)
    expect(await screen.findByText(/Os leads só aparecem por lote/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
    const gaveta = await screen.findByRole('dialog', { name: 'Filtros' })
    await userEvent.click(within(gaveta).getByLabelText(/Lote de outubro/))
    await waitFor(() => {
      const ultima = x.m.pontos.mock.calls.at(-1)?.[0] as { lotes: string[] }
      expect(ultima.lotes).toEqual([id(700)])
    })
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Ver no mapa' }))
    expect(await screen.findByText(/leads: 30 de 120 \(até 500\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Os leads só aparecem por lote/)).not.toBeInTheDocument()
  })

  it('filtros da gaveta: visitada, vendedor, cidade, região e precisão', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: /^Filtros/ }))
    const g = await screen.findByRole('dialog', { name: 'Filtros' })
    await userEvent.selectOptions(within(g).getByLabelText('Visitada'), 'nunca')
    await userEvent.selectOptions(within(g).getByLabelText('Vendedor'), id(900))
    await userEvent.selectOptions(within(g).getByLabelText('Cidade'), '3205309')
    await userEvent.selectOptions(within(g).getByLabelText('Região'), 'micro:32009')
    await userEvent.selectOptions(within(g).getByLabelText('Precisão da posição'), 'aproximada')
    await waitFor(() => {
      expect(x.m.pontos.mock.calls.at(-1)?.[0]).toMatchObject({
        visitada: 'nunca',
        vendedorId: id(900),
        municipioCodigo: 3205309,
        regiaoId: 'micro:32009',
        precisao: 'aproximada',
      })
    })
    expect(screen.getByRole('button', { name: /^Filtros/, hidden: true })).toHaveTextContent('5')
    await userEvent.click(within(g).getByRole('button', { name: 'Limpar' }))
    await waitFor(() => {
      expect(x.m.pontos.mock.calls.at(-1)?.[0]).not.toHaveProperty('visitada')
    })
  })

  it('visitada no período mostra as datas', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: /^Filtros/ }))
    const g = await screen.findByRole('dialog', { name: 'Filtros' })
    await userEvent.selectOptions(within(g).getByLabelText('Visitada'), 'periodo')
    await userEvent.type(within(g).getByLabelText('De'), '2026-09-01')
    await userEvent.type(within(g).getByLabelText('Até'), '2026-09-30')
    await waitFor(() => {
      expect(x.m.pontos.mock.calls.at(-1)?.[0]).toMatchObject({
        visitada: 'periodo',
        visitaDe: '2026-09-01',
        visitaAte: '2026-09-30',
      })
    })
  })

  it('o vendedor não vê o filtro de vendedor (a API não manda a lista)', async () => {
    const x = servicos('vendedor', { opcoes: vi.fn(async () => ok(opcoes({ vendedores: [] }))) })
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: /^Filtros/ }))
    const g = await screen.findByRole('dialog', { name: 'Filtros' })
    expect(within(g).queryByLabelText('Vendedor')).not.toBeInTheDocument()
  })

  it('muitas empresas viram bolhas; sem o mapa base há um aviso', async () => {
    const x = servicos('gestor', {
      opcoes: vi.fn(async () => ok(opcoes({ mapaInstalado: false }))),
    })
    x.m.pontos.mockResolvedValue(
      ok(
        pontos({
          total: 900,
          pontos: [],
          agrupamentos: [
            { latitude: -20.3, longitude: -40.3, total: 450 },
            { latitude: -20.1, longitude: -40.1, total: 450 },
          ],
        }),
      ),
    )
    await abrir(x)
    expect(await screen.findAllByRole('button', { name: 'bolha 450' })).toHaveLength(2)
    expect(screen.getByText(/O mapa base ainda não foi instalado/)).toBeInTheDocument()
  })

  it('erro ao carregar as empresas da área mostra "Tentar de novo"', async () => {
    const x = servicos()
    x.m.pontos.mockResolvedValueOnce(falha('x', 'Falhou.', 500))
    await abrir(x)
    expect(
      await screen.findByText(/Não consegui carregar as empresas desta área/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('erro nas opções: avisa e não abre o mapa', async () => {
    const x = servicos('gestor', { opcoes: vi.fn(async () => falha('x', 'Sem opções.', 500)) })
    renderizar(x.s, '/mapa')
    expect(await screen.findByText(/Não consegui abrir o mapa/)).toBeInTheDocument()
  })
})

describe('Mapa: painel da empresa', () => {
  it('clicar no pin abre o painel com tags, selo, carteira, última visita e as ações', async () => {
    await abrir(servicos())
    await userEvent.click(await screen.findByRole('button', { name: 'pin Alfa Ltda, Vitória' }))
    const painel = await screen.findByRole('complementary', { name: 'Empresa selecionada' })
    expect(await within(painel).findByRole('heading', { name: 'Alfa Ltda' })).toBeInTheDocument()
    expect(within(painel).getByText('Posição exata')).toBeInTheDocument()
    expect(within(painel).getByText(/Carteira de Alessandro Dias/)).toBeInTheDocument()
    expect(within(painel).getByText(/Visitada há/)).toBeInTheDocument()
    expect(within(painel).getByRole('link', { name: /Ligar/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^tel:/),
    )
    expect(within(painel).getByRole('link', { name: /WhatsApp/ })).toBeInTheDocument()
    expect(within(painel).getByRole('link', { name: /Abrir ficha/ })).toBeInTheDocument()
    expect(within(painel).getByRole('button', { name: /Empresas próximas/ })).toBeInTheDocument()
    expect(within(painel).queryByText(/Na rota/)).not.toBeInTheDocument()
    expect(within(painel).queryByText(/Check-in/)).not.toBeInTheDocument()
    for (const aba of ['Atividades', 'Oportunidades', 'Contatos']) {
      expect(within(painel).getByRole('tab', { name: aba })).toBeInTheDocument()
    }
  })

  it('o pin selecionado fica marcado e o painel fecha', async () => {
    await abrir(servicos())
    await userEvent.click(await screen.findByRole('button', { name: 'pin Alfa Ltda, Vitória' }))
    await screen.findByRole('complementary', { name: 'Empresa selecionada' })
    expect(screen.getByRole('button', { name: 'pin Alfa Ltda, Vitória' })).toHaveAttribute(
      'data-selecionado',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel da empresa' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Empresa selecionada' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('"Abrir ficha" leva à ficha da empresa', async () => {
    const { historico } = await abrir(servicos())
    await userEvent.click(await screen.findByRole('button', { name: 'pin Alfa Ltda, Vitória' }))
    await userEvent.click(await screen.findByRole('link', { name: /Abrir ficha/ }))
    await waitFor(() => expect(historico.location.pathname).toBe(`/empresas/${id(100)}`))
  })
})

describe('Mapa: empresas próximas, seleção e cobertura', () => {
  it('"Empresas próximas" abre a barra de raio (2, 5, 10, 25 km); por padrão sem as visitadas', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'pin Alfa Ltda, Vitória' }))
    await userEvent.click(await screen.findByRole('button', { name: /Empresas próximas/ }))
    const barra = await screen.findByRole('group', { name: 'Empresas por raio' })
    await waitFor(() => expect(x.m.proximas).toHaveBeenCalled())
    expect(x.m.proximas.mock.calls[0]?.[0]).toMatchObject({
      latitude: -20.3,
      longitude: -40.3,
      raioKm: 5,
      incluirVisitadas: 'false',
      excluirEmpresaId: id(100),
    })
    expect(within(barra).getByRole('button', { name: '5 km' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(within(barra).getByRole('button', { name: '25 km' }))
    await waitFor(() => expect(x.m.proximas.mock.calls.at(-1)?.[0]).toMatchObject({ raioKm: 25 }))
    await userEvent.click(within(barra).getByLabelText('Incluir já visitadas'))
    await waitFor(() =>
      expect(x.m.proximas.mock.calls.at(-1)?.[0]).toMatchObject({ incluirVisitadas: 'true' }),
    )
    const lista = await screen.findByRole('region', { name: /Empresas até 25 km de Alfa Ltda/ })
    expect(within(lista).getByText('Gama Ltda')).toBeInTheDocument()
    expect(within(lista).getByText(/Vitória · a 1,2 km/)).toBeInTheDocument()
    expect(within(lista).getByText('Visitada')).toBeInTheDocument()
  })

  it('seleção por raio: toca no centro, escolhe o raio e lista; abrir um item abre o painel dele', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: /Selecionar por raio/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Tocar no mapa em -20,3 e -40,3' }))
    await waitFor(() => expect(x.m.proximas).toHaveBeenCalled())
    expect(x.m.proximas.mock.calls[0]?.[0]).toMatchObject({
      latitude: -20.3,
      longitude: -40.3,
      raioKm: 5,
    })
    await userEvent.click(await screen.findByRole('button', { name: /Gama Ltda/ }))
    expect(
      await screen.findByRole('complementary', { name: 'Empresa selecionada' }),
    ).toBeInTheDocument()
  })

  it('seleção por retângulo: dois toques marcam a área e a lista vem da API', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: /Selecionar por retângulo/ }))
    expect(screen.getByText('Toque no primeiro canto do retângulo.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tocar no mapa em -20,3 e -40,3' }))
    expect(screen.getByText('Toque no canto oposto.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tocar no mapa em -20,2 e -40,2' }))
    await waitFor(() => expect(x.m.selecao).toHaveBeenCalled())
    expect(x.m.selecao.mock.calls[0]?.[0]).toMatchObject({
      tipo: 'retangulo',
      oeste: -40.3,
      leste: -40.2,
      sul: -20.3,
      norte: -20.2,
      incluirVisitadas: false,
    })
    expect(await screen.findByText('Épsilon Ltda')).toBeInTheDocument()
    expect(screen.getByRole('application', { name: 'Mapa das empresas' })).toHaveAttribute(
      'data-areas',
      '1',
    )
  })

  it('aplica uma tag a todas as empresas da lista', async () => {
    const x = servicos('gestor')
    const aplicar = vi.fn(async (_ids: string[], _tag: string) =>
      ok({ aplicadas: 2, semMudanca: 0, ignoradas: 0 }),
    )
    x.s.carteira.aplicarTagEmMassa = aplicar
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: /Selecionar por raio/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Tocar no mapa em -20,3 e -40,3' }))
    const lista = await screen.findByRole('region', { name: /Empresas até 5 km/ })
    await userEvent.selectOptions(
      await within(lista).findByLabelText('Aplicar uma tag a todas da lista'),
      id(801),
    )
    await userEvent.click(within(lista).getByRole('button', { name: 'Aplicar a 2 empresas' }))
    await waitFor(() => expect(aplicar).toHaveBeenCalledWith([id(110), id(111)], id(801)))
  })

  it('cobertura por município: as bolhas dizem quantas faltam e a lista mostra visitadas e faltam', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(
      await screen.findByRole('button', { name: /Mostrar a cobertura por município/ }),
    )
    expect(
      await screen.findByRole('button', { name: /Vitória: 12 de 40 visitadas, faltam 28/ }),
    ).toBeInTheDocument()
    const lista = await screen.findByRole('region', { name: 'Cobertura por município' })
    expect(within(lista).getByText(/12 de 40 · faltam 28/)).toBeInTheDocument()
  })
})
