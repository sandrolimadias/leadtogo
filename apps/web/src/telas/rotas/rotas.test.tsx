import type { OpcoesDoMapa, Rota } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { empresaDeTeste } from '@/telas/empresas/fixtures'
import { meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

// O mapa de verdade (WebGL) não roda no jsdom: o falso lista os pins e as paradas desenhadas da rota.
vi.mock('@/components/mapa/mapa-base', () => ({
  MapaBase: (p: {
    pins?: { id: string }[]
    rota?: { paradas: { id: string; numero: number }[]; emLinhaReta: boolean } | null
    aoMover?: (a: {
      oeste: number
      sul: number
      leste: number
      norte: number
      zoom: number
    }) => void
    aoClicarNoPin?: (id: string) => void
  }) => {
    useEffect(() => {
      p.aoMover?.({ oeste: -40.6, sul: -20.6, leste: -40, norte: -19.9, zoom: 14 })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
      <div role="application" aria-label="Mapa das empresas">
        {(p.pins ?? []).map((x) => (
          <button key={x.id} type="button" onClick={() => p.aoClicarNoPin?.(x.id)}>
            {`pin ${x.id}`}
          </button>
        ))}
        <p data-testid="rota-desenhada">
          {p.rota
            ? `${p.rota.paradas.map((x) => x.numero).join(',')} ${p.rota.emLinhaReta ? 'linha reta' : 'ruas'}`
            : 'sem rota'}
        </p>
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
        situacao: 'ativo',
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

const opcoes: OpcoesDoMapa = {
  uf: 'ES',
  chips: [],
  legenda: [],
  vendedores: [{ id: id(900), nome: 'Alessandro Dias' }],
  cidades: [],
  regioes: [],
  lotesDeLeads: [],
  limiteDeLeads: 500,
  centroInicial: { latitude: -20.3, longitude: -40.3, zoom: 12 },
  mapaInstalado: true,
}

const rotaSalva = (extra: Partial<Rota> = {}): Rota => ({
  id: id(500),
  codigo: 151,
  nome: 'Grande Vitória · segunda',
  data: '2026-10-26',
  responsavel: { id: id(900), nome: 'Alessandro Dias' },
  partida: 'posicao_atual',
  pontoPartida: null,
  voltarAoInicio: false,
  minutosPorVisita: 40,
  situacao: 'planejada',
  distanciaM: 12_000,
  duracaoS: 1800,
  estimativa: 'linha_reta',
  otimizadaEm: null,
  trajeto: null,
  iniciadaEm: null,
  concluidaEm: null,
  podeEditar: true,
  paradas: [
    {
      id: id(510),
      empresaId: id(100),
      empresaNome: 'Alfa Ltda',
      bairro: 'Centro',
      cidade: 'Vitória',
      uf: 'ES',
      telefone: '+552730643021',
      latitude: -20.3,
      longitude: -40.3,
      precisao: 'exata',
      ordem: 1,
      distanciaTrechoM: null,
      duracaoTrechoS: null,
      situacao: 'pendente',
      motivoPulo: null,
      atividadeId: null,
      resolvidaEm: null,
    },
  ],
  ...extra,
})

function servicos(configurada: boolean) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => me(),
    mapa: {
      ...base.mapa,
      opcoes: vi.fn(async () => ok(opcoes)),
      pontos: vi.fn(async () =>
        ok({
          total: 1,
          nivel: 'pins' as const,
          agrupamentos: [],
          pontos: [{ id: id(100), latitude: -20.3, longitude: -40.3, estado: 0, visitada: false }],
          estados: [''],
          leads: { mostrados: 0, total: 0, limite: 500 },
          limite: 2000,
          truncado: false,
          comCnefe: false,
        } as never),
      ),
    },
    carteira: {
      ...base.carteira,
      detalhar: vi.fn(async (idDaEmpresa: string) =>
        ok(
          empresaDeTeste({
            id: idDaEmpresa,
            nome: 'Alfa Ltda',
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
    rotas: {
      ...base.rotas,
      configuracao: vi.fn(async () =>
        ok({ minutosPorVisita: 40, maxParadas: 30, otimizacaoConfigurada: configurada }),
      ),
      criar: vi.fn(async () => ok(rotaSalva())),
      obter: vi.fn(async () => ok(rotaSalva())),
      listar: vi.fn(async () =>
        ok({
          total: 1,
          itens: [
            {
              id: id(500),
              codigo: 151,
              nome: 'Grande Vitória · segunda',
              data: '2026-10-26',
              responsavel: { id: id(900), nome: 'Alessandro Dias' },
              situacao: 'em_andamento' as const,
              paradas: 12,
              visitadas: 3,
              puladas: 1,
              pendentes: 8,
              distanciaM: 199_000,
              duracaoS: 4 * 3600,
              minutosPorVisita: 40,
              estimativa: 'ruas' as const,
            },
          ],
        }),
      ),
    },
  })
}

describe('Rotas: lista', () => {
  it('mostra código, andamento (planejado × realizado), situação e o aviso sem a otimização', async () => {
    renderizar(servicos(false), '/rotas')
    const lista = await screen.findByRole('list', { name: 'Rotas' })
    expect(within(lista).getByText('R-0151')).toBeInTheDocument()
    expect(within(lista).getByText(/de 12 visitadas/)).toHaveTextContent(
      '3 de 12 visitadas · 1 puladas · 8 pendentes',
    )
    expect(within(lista).getByText('Em andamento')).toBeInTheDocument()
    expect(screen.getByText(/Otimização de rotas ainda não configurada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nova rota/ })).toHaveAttribute(
      'href',
      '/mapa?rota=nova',
    )
  })
})

describe('Rotas: editor no mapa', () => {
  it('sem o serviço, "Otimizar ordem" fica desligado; "Adicionar à rota" põe a empresa e "Criar rota" salva', async () => {
    const s = servicos(false)
    const usuario = userEvent.setup()
    renderizar(s, '/mapa?rota=nova')
    const editor = await screen.findByRole('region', { name: 'Editor de rota' })
    expect(
      within(editor).getByText(/Otimização de rotas ainda não configurada/),
    ).toBeInTheDocument()
    expect(within(editor).getByRole('button', { name: /Otimizar ordem/ })).toBeDisabled()

    await usuario.click(await screen.findByRole('button', { name: `pin ${id(100)}` }))
    const painel = await screen.findByRole('complementary', { name: 'Empresa selecionada' })
    await usuario.click(await within(painel).findByRole('button', { name: /Adicionar à rota/ }))
    expect(await within(painel).findByText(/Na rota · parada 1/)).toBeInTheDocument()
    expect(
      within(editor).getByRole('list', { name: 'Paradas na ordem de visita' }),
    ).toHaveTextContent('Alfa Ltda')
    expect(screen.getByTestId('rota-desenhada')).toHaveTextContent('1 linha reta')

    await usuario.click(within(editor).getByRole('button', { name: 'Criar rota' }))
    await waitFor(() => expect(s.rotas.criar).toHaveBeenCalled())
    expect(s.rotas.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaIds: [id(100)],
        partida: 'posicao_atual',
        otimizada: false,
      }),
    )
  })

  it('com o serviço configurado, "Otimizar ordem" liga com duas paradas', async () => {
    const s = servicos(true)
    renderizar(s, `/mapa?rota=${id(500)}`)
    const editor = await screen.findByRole('region', { name: 'Editor de rota' })
    expect(within(editor).getByText('Editando R-0151')).toBeInTheDocument()
    expect(within(editor).queryByText(/ainda não configurada/)).not.toBeInTheDocument()
    // uma parada só: não há o que otimizar
    expect(within(editor).getByRole('button', { name: /Otimizar ordem/ })).toBeDisabled()
  })
})

describe('Rotas: da tela da rota para o mapa e de volta (sem recarregar)', () => {
  it('as duas telas leem a mesma rota sem quebrar (o cache de uma não serve à outra)', async () => {
    const s = servicos(true)
    const usuario = userEvent.setup()
    const { historico } = renderizar(s, `/rotas/${id(500)}`)
    expect(
      await screen.findByRole('heading', { name: 'Grande Vitória · segunda' }),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: /Editar no mapa/ }))
    const editor = await screen.findByRole('region', { name: 'Editor de rota' })
    expect(within(editor).getByText('Editando R-0151')).toBeInTheDocument()

    historico.push(`/rotas/${id(500)}`)
    expect(
      await screen.findByRole('heading', { name: 'Grande Vitória · segunda' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Paradas' })).toHaveTextContent('Alfa Ltda')
  })
})
