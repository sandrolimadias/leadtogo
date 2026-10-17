import type {
  FilaConfirmarEndereco,
  ListaDeLotesGeo,
  LoteGeo,
  PosicaoDaEmpresa,
  RegiaoGeo,
  ResumoDaGeolocalizacao,
} from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

// O mapa de verdade (WebGL) não roda no jsdom: este falso expõe o pin como um botão "soltar".
vi.mock('@/components/mapa/mapa-base', () => ({
  MapaBase: (p: {
    rotulo: string
    arrastavel?: { latitude: number; longitude: number; aoSoltar: (la: number, lo: number) => void }
  }) => (
    <div role="application" aria-label={p.rotulo}>
      {p.arrastavel ? (
        <button type="button" onClick={() => p.arrastavel?.aoSoltar(-20.1, -40.2)}>
          Soltar o pin em -20,1 e -40,2
        </button>
      ) : null}
    </div>
  ),
}))

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const me = (papel: 'admin' | 'gestor' | 'vendedor') =>
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

const resumo = (extra: Partial<ResumoDaGeolocalizacao> = {}): ResumoDaGeolocalizacao => ({
  cnefeCarregado: true,
  uf: 'ES',
  nominatimConfigurado: true,
  totalEmpresas: 120,
  exatas: 60,
  aproximadas: 30,
  semCoordenada: 20,
  aConfirmar: 8,
  ajustadasAMao: 2,
  ...extra,
})

const regioes = (): RegiaoGeo[] => [
  {
    id: 'micro:32009',
    tipo: 'microrregiao',
    nome: 'Vitória',
    uf: 'ES',
    municipios: [
      { codigoIbge: 3205309, nome: 'Vitória', uf: 'ES' },
      { codigoIbge: 3205002, nome: 'Serra', uf: 'ES' },
    ],
  },
  {
    id: id(500),
    tipo: 'personalizada',
    nome: 'Minha região',
    uf: null,
    municipios: [{ codigoIbge: 3205002, nome: 'Serra', uf: 'ES' }],
  },
]

const lote = (extra: Partial<LoteGeo> = {}): LoteGeo => ({
  id: id(900),
  nome: 'Vitória (16/10/2026)',
  escopo: 'Vitória',
  municipios: 1,
  refazerComCoordenada: false,
  situacao: 'concluido',
  totalEmpresas: 40,
  processadas: 40,
  porResultado: { exata: 25, aproximada: 12, a_confirmar: 3 },
  iniciadoEm: '2026-10-16T13:00:00.000Z',
  concluidoEm: '2026-10-16T13:20:00.000Z',
  criadoEm: '2026-10-16T13:00:00.000Z',
  criadoPor: null,
  ...extra,
})

function servicos(papel: 'admin' | 'gestor' | 'vendedor', extra: Record<string, unknown> = {}) {
  const g = {
    resumo: vi.fn(async () => ok(resumo())),
    fila: vi.fn(async () =>
      ok<FilaConfirmarEndereco>({
        itens: [
          {
            empresaId: id(100),
            nome: 'Alfa Ltda',
            endereco: 'Rua Sete, 12',
            municipio: 'Vitória',
            cep: '29000000',
            faltas: ['numero', 'bairro'],
            vendedor: 'Bia Lima',
          },
        ],
        total: 1,
        pagina: 1,
        porPagina: 25,
      }),
    ),
    regioes: {
      listar: vi.fn(async (_uf?: string) => ok(regioes())),
      criar: vi.fn(async () => ok(regioes()[1] as RegiaoGeo)),
      alterar: vi.fn(async () => ok(regioes()[1] as RegiaoGeo)),
      excluir: vi.fn(async () => ok(undefined)),
    },
    lotes: {
      previa: vi.fn(async () =>
        ok({
          escopo: 'Vitória',
          municipios: 1,
          total: 100,
          comCoordenada: 60,
          aProcessar: 40,
          ajustadasAMao: 2,
        }),
      ),
      criar: vi.fn(async () => ok(lote({ situacao: 'em_andamento', processadas: 0 }))),
      listar: vi.fn(async () =>
        ok<ListaDeLotesGeo>({ itens: [lote()], total: 1, pagina: 1, porPagina: 10 }),
      ),
      detalhar: vi.fn(async () => ok(lote())),
      cancelar: vi.fn(async () => ok(lote({ situacao: 'cancelado' }))),
      retomar: vi.fn(async () => ok(lote({ situacao: 'em_andamento' }))),
    },
    posicao: {
      ler: vi.fn(),
      ajustar: vi.fn(),
      confirmarEndereco: vi.fn(),
      geocodificarDeNovo: vi.fn(),
    },
    ...extra,
  }
  const base = servicosFalsos()
  return {
    g: g as typeof g & Record<string, never>,
    s: servicosFalsos({
      me: async () => me(papel),
      geolocalizacao: { ...base.geolocalizacao, ...g },
    }),
  }
}

describe('Geolocalização: resumo e lotes (admin e gestor)', () => {
  it('mostra os números do resumo e a lista de lotes com o relatório por resultado', async () => {
    renderizar(servicos('gestor').s, '/geolocalizacao')
    const painel = await screen.findByRole('tabpanel')
    expect(await within(painel).findByText('Posição exata')).toBeInTheDocument()
    expect(within(painel).getByText('60')).toBeInTheDocument()
    expect(within(painel).getByText('8')).toBeInTheDocument()
    const lista = await screen.findByRole('list', { name: 'Lotes de geocodificação' })
    const item = within(lista).getAllByRole('listitem')[0] as HTMLElement
    expect(within(item).getByText('Vitória (16/10/2026)')).toBeInTheDocument()
    expect(within(item).getByText('Concluído')).toBeInTheDocument()
    expect(within(item).getByText('40 de 40 (100%)')).toBeInTheDocument()
    expect(within(item).getByText(/Posição exata:/)).toBeInTheDocument()
  })

  it('avisa quando o CNEFE não está carregado e quando não há Nominatim', async () => {
    const x = servicos('admin', {
      resumo: vi.fn(async () => ok(resumo({ cnefeCarregado: false, nominatimConfigurado: false }))),
    })
    renderizar(x.s, '/geolocalizacao')
    expect(
      await screen.findByText('A base de endereços do IBGE ainda não foi carregada'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Nominatim \(OpenStreetMap\) não está configurado/)).toBeInTheDocument()
  })

  it('lote por cidade: vê quantas são e quantas já têm coordenada, depois inicia', async () => {
    const x = servicos('admin')
    renderizar(x.s, '/geolocalizacao')
    await userEvent.selectOptions(await screen.findByLabelText('Cidade'), '3205309')
    await userEvent.click(screen.getByRole('button', { name: 'Ver quantas são' }))
    expect(await screen.findByText(/100 empresas,/)).toBeInTheDocument()
    expect(screen.getByText(/100 empresas,/)).toHaveTextContent('60')
    expect(x.g.lotes.previa).toHaveBeenCalledWith({ tipo: 'municipio', id: '3205309' })
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar o lote' }))
    await waitFor(() =>
      expect(x.g.lotes.criar).toHaveBeenCalledWith({
        escopo: { tipo: 'municipio', id: '3205309' },
        refazerComCoordenada: false,
      }),
    )
  })

  it('"refazer também as que já têm coordenada" manda a opção e conta todas na prévia', async () => {
    const x = servicos('admin')
    renderizar(x.s, '/geolocalizacao')
    await userEvent.selectOptions(await screen.findByLabelText('Por'), 'regiao')
    await userEvent.selectOptions(screen.getByLabelText('Região'), id(500))
    await userEvent.click(screen.getByLabelText(/Refazer também as empresas que já têm coordenada/))
    await userEvent.click(screen.getByRole('button', { name: 'Ver quantas são' }))
    expect(await screen.findByText(/vai fazer/)).toHaveTextContent('100')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar o lote' }))
    await waitFor(() =>
      expect(x.g.lotes.criar).toHaveBeenCalledWith({
        escopo: { tipo: 'regiao', id: id(500) },
        refazerComCoordenada: true,
      }),
    )
  })

  it('um erro da API (já há lote em andamento) aparece sem fechar a prévia', async () => {
    const x = servicos('admin', {})
    x.g.lotes.criar.mockResolvedValueOnce(
      falha('lote_em_andamento', 'Já existe um lote em andamento.', 409),
    )
    renderizar(x.s, '/geolocalizacao')
    await userEvent.selectOptions(await screen.findByLabelText('Cidade'), '3205309')
    await userEvent.click(screen.getByRole('button', { name: 'Ver quantas são' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar o lote' }))
    expect(await screen.findByText('Já existe um lote em andamento.')).toBeInTheDocument()
  })

  it('lote em andamento mostra o progresso e cancela; o cancelado retoma', async () => {
    const x = servicos('admin', {})
    x.g.lotes.listar.mockResolvedValue(
      ok({
        itens: [
          lote({
            situacao: 'em_andamento',
            processadas: 10,
            totalEmpresas: 40,
            porResultado: { pendente: 30, exata: 10 },
            concluidoEm: null,
          }),
          lote({ id: id(901), nome: 'Outro lote', situacao: 'cancelado', processadas: 5 }),
        ],
        total: 2,
        pagina: 1,
        porPagina: 10,
      }),
    )
    renderizar(x.s, '/geolocalizacao')
    const lista = await screen.findByRole('list', { name: 'Lotes de geocodificação' })
    const [a] = within(lista).getAllByRole('listitem') as [HTMLElement]
    expect(within(a).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    await userEvent.click(within(a).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(x.g.lotes.cancelar).toHaveBeenCalledWith(id(900)))
    await userEvent.click(
      await within(await screen.findByRole('list', { name: 'Lotes de geocodificação' })).findByRole(
        'button',
        { name: 'Retomar' },
      ),
    )
    await waitFor(() => expect(x.g.lotes.retomar).toHaveBeenCalledWith(id(901)))
  })
})

describe('Geolocalização: quem vê o quê', () => {
  it('o vendedor só tem a fila "Confirmar endereço" (sem resumo nem lotes nem regiões)', async () => {
    const x = servicos('vendedor')
    renderizar(x.s, '/geolocalizacao')
    expect(await screen.findByText('Alfa Ltda')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Resumo e lotes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Regiões' })).not.toBeInTheDocument()
    expect(x.g.resumo).not.toHaveBeenCalled()
  })

  it('a fila diz o que falta e abre a ficha', async () => {
    const { historico } = renderizar(servicos('gestor').s, '/geolocalizacao')
    await userEvent.click(await screen.findByRole('tab', { name: 'Confirmar endereço' }))
    expect(await screen.findByText('Faltam o número e o bairro.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /Abrir a ficha/ }))
    await waitFor(() => expect(historico.location.pathname).toBe(`/empresas/${id(100)}`))
  })

  it('fila vazia: nada a confirmar', async () => {
    const x = servicos('admin', {
      fila: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 25 })),
    })
    renderizar(x.s, '/geolocalizacao')
    await userEvent.click(await screen.findByRole('tab', { name: 'Confirmar endereço' }))
    expect(await screen.findByText('Nenhum endereço para confirmar')).toBeInTheDocument()
  })
})

describe('Geolocalização: regiões', () => {
  it('o administrador cria, altera e exclui as dele; as microrregiões só se leem', async () => {
    const x = servicos('admin')
    renderizar(x.s, '/geolocalizacao')
    await userEvent.click(await screen.findByRole('tab', { name: 'Regiões' }))
    expect(await screen.findByText('Minha região')).toBeInTheDocument()
    expect(screen.getByText(/Vitória/, { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Excluir Vitória/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Nova região' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova região' })
    await userEvent.type(within(dialogo).getByLabelText('Nome'), 'Grande Vitória')
    await userEvent.click(within(dialogo).getByLabelText('Serra'))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(x.g.regioes.criar).toHaveBeenCalledWith({
        nome: 'Grande Vitória',
        municipios: [3205002],
      }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Excluir Minha região' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }),
    )
    await waitFor(() => expect(x.g.regioes.excluir).toHaveBeenCalledWith(id(500)))
  })

  it('o gestor lê as regiões mas não vê os botões de editar', async () => {
    renderizar(servicos('gestor').s, '/geolocalizacao')
    await userEvent.click(await screen.findByRole('tab', { name: 'Regiões' }))
    expect(await screen.findByText('Minha região')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova região' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir Minha região' })).not.toBeInTheDocument()
  })

  it('"Marcar uma microrregião inteira" marca as cidades dela', async () => {
    const x = servicos('admin')
    renderizar(x.s, '/geolocalizacao')
    await userEvent.click(await screen.findByRole('tab', { name: 'Regiões' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nova região' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova região' })
    await userEvent.selectOptions(
      within(dialogo).getByLabelText('Marcar uma microrregião inteira'),
      'micro:32009',
    )
    expect(within(dialogo).getByLabelText('Serra')).toBeChecked()
    expect(within(dialogo).getByLabelText('Vitória')).toBeChecked()
    expect(within(dialogo).getByText('Cidades (2 marcadas)')).toBeInTheDocument()
  })
})

describe('Geolocalização: dentro das Configurações', () => {
  it('a seção Geolocalização do menu abre a mesma tela', async () => {
    renderizar(servicos('admin').s, '/configuracoes/geolocalizacao')
    expect((await screen.findAllByRole('link', { name: 'Geolocalização' })).length).toBeGreaterThan(
      1,
    )
    expect(await screen.findByRole('tab', { name: 'Resumo e lotes' })).toBeInTheDocument()
  })
})

const posicao = (extra: Partial<PosicaoDaEmpresa> = {}): PosicaoDaEmpresa => ({
  estado: 'exata',
  latitude: -20.3,
  longitude: -40.3,
  precisao: 'exata',
  aproximacao: null,
  origem: 'cnefe',
  raioM: 100,
  atualizadoEm: '2026-10-16T13:00:00.000Z',
  ajusteManual: false,
  enderecoMudouDepoisDoAjuste: false,
  centroSugerido: { latitude: -20.3, longitude: -40.3 },
  faltas: [],
  ...extra,
})
export { posicao }
