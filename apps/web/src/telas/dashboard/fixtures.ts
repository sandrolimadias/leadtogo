import type {
  AssociadosDoDashboard,
  ContornosDaUf,
  Dashboard,
  MapaDoDashboard,
  ResultadosDoDashboard,
} from '@leadtogo/api-client'

import { id } from '@/telas/contatos/fixtures'

export const FUNIL_ID = id(950)
export const FASE_PROPOSTA = id(953)
export const MOTIVO_PRECO = id(971)
export const TAG_CLIENTE = id(990)
export const MEMBRO = id(800)

export const dashboard = (extra: Partial<Dashboard> = {}): Dashboard => ({
  membro: { id: MEMBRO, nome: 'Alessandro Dias' },
  periodo: { chave: 'mes', rotulo: 'outubro de 2026', inicio: '2026-10-01', fim: '2026-10-31' },
  previsao: { valor: 12500, quantidade: 3, semPrevisao: 2 },
  mrr: {
    valor: 3450,
    quantidade: 4,
    anterior: 2925,
    variacao: 18,
    serie: [
      {
        mes: '2026-05',
        rotulo: 'mai/26',
        inicio: '2026-05-01',
        fimExclusivo: '2026-06-01',
        valor: 0,
        quantidade: 0,
      },
      {
        mes: '2026-06',
        rotulo: 'jun/26',
        inicio: '2026-06-01',
        fimExclusivo: '2026-07-01',
        valor: 800,
        quantidade: 1,
      },
      {
        mes: '2026-07',
        rotulo: 'jul/26',
        inicio: '2026-07-01',
        fimExclusivo: '2026-08-01',
        valor: 1200,
        quantidade: 2,
      },
      {
        mes: '2026-08',
        rotulo: 'ago/26',
        inicio: '2026-08-01',
        fimExclusivo: '2026-09-01',
        valor: 2000,
        quantidade: 2,
      },
      {
        mes: '2026-09',
        rotulo: 'set/26',
        inicio: '2026-09-01',
        fimExclusivo: '2026-10-01',
        valor: 2925,
        quantidade: 3,
      },
      {
        mes: '2026-10',
        rotulo: 'out/26',
        inicio: '2026-10-01',
        fimExclusivo: '2026-11-01',
        valor: 3450,
        quantidade: 4,
      },
    ],
  },
  conversao: { taxa: 66.7, conquistadas: 4, perdidas: 2 },
  resultado: {
    conquistadas: { quantidade: 4, total: 41400, mensal: 3450 },
    perdidasECanceladas: { quantidade: 3, total: 9000, perdidas: 2, canceladas: 1 },
  },
  motivosDePerda: [
    { id: MOTIVO_PRECO, nome: 'Preço', quantidade: 2, total: 6000 },
    { id: id(972), nome: 'Concorrente', quantidade: 1, total: 3000 },
  ],
  funil: {
    id: FUNIL_ID,
    nome: 'Vendas',
    fases: [
      { id: id(951), nome: 'Qualificação', cor: 'teal', quantidade: 3, total: 9000 },
      { id: id(952), nome: 'Diagnóstico', cor: 'blue', quantidade: 0, total: 0 },
      { id: FASE_PROPOSTA, nome: 'Proposta', cor: 'indigo', quantidade: 2, total: 20000 },
    ],
  },
  carteira: {
    total: 148,
    porStatus: [
      { id: id(991), nome: 'Lead', cor: 'teal', chaveSistema: 'lead', quantidade: 40 },
      { id: id(992), nome: 'Prospect', cor: 'amber', chaveSistema: 'prospect', quantidade: 30 },
      { id: TAG_CLIENTE, nome: 'Associado', cor: 'green', chaveSistema: 'cliente', quantidade: 70 },
      { id: id(993), nome: 'Inativo', cor: 'gray', chaveSistema: 'inativo', quantidade: 8 },
    ],
    novas: 9,
  },
  semContato: {
    dias: 60,
    total: 23,
    itens: [
      {
        id: id(1),
        nome: 'Mercado Central',
        cidade: { nome: 'Serra', uf: 'ES' },
        status: { nome: 'Associado', cor: 'green' },
        diasSemContato: null,
      },
      {
        id: id(2),
        nome: 'Padaria Sol',
        cidade: null,
        status: { nome: 'Prospect', cor: 'amber' },
        diasSemContato: 95,
      },
    ],
  },
  atividades: { hoje: 2, atrasadas: 1, proximos7: 3 },
  ...extra,
})

// ---- aba Resultados ----

export const VITORIA = 3205309
export const SERRA = 3205002

const serie = dashboard().mrr.serie

export const resultados = (extra: Partial<ResultadosDoDashboard> = {}): ResultadosDoDashboard => ({
  periodo: {
    chave: 'mes',
    rotulo: 'outubro de 2026',
    inicio: '2026-10-01',
    fim: '2026-10-31',
    anterior: { inicio: '2026-09-01', fim: '2026-09-30' },
  },
  visao: 'minha',
  visoes: ['minha', 'equipe', 'empresa'],
  previsao: {
    valor: 12500,
    ponderado: 9800,
    quantidade: 3,
    semPrevisao: 2,
    porFunil: [
      {
        funilId: FUNIL_ID,
        funil: 'Vendas',
        faseId: FASE_PROPOSTA,
        fase: 'Negociação',
        valor: 12500,
        quantidade: 3,
      },
    ],
  },
  vendas: { total: 41400, quantidade: 4, anterior: 36000, variacao: 15 },
  mrr: { valor: 3450, quantidade: 4, anterior: 2925, variacao: 18, serie },
  conversao: { taxa: 66.7, conquistadas: 4, perdidas: 2 },
  resultado: dashboard().resultado,
  motivosDePerda: dashboard().motivosDePerda,
  funil: dashboard().funil,
  associados: {
    tag: { id: TAG_CLIENTE, nome: 'Associado', cor: 'green' },
    atual: 70,
    inicio: 68,
    novos: 5,
    desassociados: 3,
    churn: 4.4,
    historicoDesde: '2025-01-10T12:00:00.000Z',
  },
  visitas: { realizadas: 42, anterior: 30, variacao: 40 },
  atividadesRealizadas: { realizadas: 120, anterior: 150, variacao: -20 },
  ...extra,
})

export const listaDeAssociados = (
  tipo: AssociadosDoDashboard['tipo'],
  extra: Partial<AssociadosDoDashboard> = {},
): AssociadosDoDashboard => ({
  tipo,
  periodo: resultados().periodo,
  total: tipo === 'novos' ? 5 : 3,
  pagina: 1,
  porPagina: 8,
  itens:
    tipo === 'novos'
      ? [
          {
            id: id(31),
            nome: 'Supermercado Bom Preço',
            cidade: { nome: 'Vitória', uf: 'ES' },
            em: '2026-10-12T15:00:00.000Z',
            vendedor: { id: MEMBRO, nome: 'Alessandro Dias' },
            por: { id: MEMBRO, nome: 'Alessandro Dias' },
            mrr: 350,
            statusAtual: null,
          },
        ]
      : [
          {
            id: id(32),
            nome: 'Padaria Sol',
            cidade: null,
            em: '2026-10-20T15:00:00.000Z',
            vendedor: null,
            por: null,
            mrr: null,
            statusAtual: { id: id(993), nome: 'Inativo', cor: 'gray' },
          },
        ],
  ...extra,
})

export const mapa = (extra: Partial<MapaDoDashboard> = {}): MapaDoDashboard => ({
  uf: 'ES',
  periodo: resultados().periodo,
  municipios: [
    { codigo: VITORIA, nome: 'Vitória', associados: 42, empresas: 90 },
    { codigo: SERRA, nome: 'Serra', associados: 3, empresas: 40 },
  ],
  total: { associados: 46, empresas: 135 },
  foraDaUf: { associados: 1, empresas: 4 },
  semCidade: { associados: 0, empresas: 1 },
  ...extra,
})

const quadrado = (x: number, y: number): [number, number][][][] => [
  [
    [
      [x, y],
      [x + 0.1, y],
      [x + 0.1, y + 0.1],
      [x, y + 0.1],
      [x, y],
    ],
  ],
]

export const contornos = (): ContornosDaUf => ({
  uf: 'ES',
  fonte: 'IBGE, malha municipal (simplificada)',
  municipios: [
    { codigo: SERRA, nome: 'Serra', poligonos: quadrado(-40.3, -20.2) },
    { codigo: VITORIA, nome: 'Vitória', poligonos: quadrado(-40.4, -20.3) },
    { codigo: 3201308, nome: 'Cariacica', poligonos: quadrado(-40.5, -20.3) },
  ],
})
