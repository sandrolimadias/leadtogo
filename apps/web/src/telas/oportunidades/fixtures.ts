import type { KanbanDeOportunidades, Oportunidade } from '@leadtogo/api-client'

import { id } from '@/telas/contatos/fixtures'

export const FUNIL = { id: id(950), nome: 'Vendas' }
export const FASES = [
  {
    id: id(951),
    nome: 'Qualificação',
    cor: 'teal' as const,
    probabilidadePadrao: 10,
    diasAlertaParada: 14,
  },
  {
    id: id(952),
    nome: 'Diagnóstico',
    cor: 'blue' as const,
    probabilidadePadrao: 25,
    diasAlertaParada: 14,
  },
  {
    id: id(953),
    nome: 'Proposta',
    cor: 'indigo' as const,
    probabilidadePadrao: 50,
    diasAlertaParada: null,
  },
]

export const oportunidade = (n: number, extra: Partial<Oportunidade> = {}): Oportunidade => ({
  id: id(960 + n),
  titulo: `Oportunidade ${n}`,
  empresa: { id: id(1), nome: 'Usidantec' },
  contato: null,
  solucao: null,
  origem: null,
  funil: FUNIL,
  fase: { id: FASES[0]!.id, nome: FASES[0]!.nome, cor: FASES[0]!.cor },
  status: 'ativo',
  faseParouEm: null,
  motivo: null,
  motivoDetalhe: null,
  suspensaAte: null,
  responsavel: { id: id(800), nome: 'Alessandro Dias' },
  valorUnico: 2000,
  valorMensal: 500,
  meses: 12,
  valorTotal: 8000,
  valorPonderado: 800,
  probabilidade: 10,
  probabilidadeManual: false,
  dataPrevistaFechamento: null,
  dataFechamento: null,
  faseDesde: '2026-10-10T12:00:00.000Z',
  diasParada: 2,
  parada: false,
  ultimaAtividadeEm: null,
  proximaAtividade: null,
  observacoes: null,
  criadaEm: '2026-10-10T12:00:00.000Z',
  editavel: true,
  excluivel: true,
  empresaViraClientePadrao: true,
  ...extra,
})

export const kanban = (
  porFase: Oportunidade[][] = [[oportunidade(1), oportunidade(2)], [], [oportunidade(3)]],
  extra: Partial<KanbanDeOportunidades> = {},
): KanbanDeOportunidades => ({
  funil: FUNIL,
  fases: FASES.map((f, i) => {
    const itens = porFase[i] ?? []
    return {
      ...f,
      quantidade: itens.length,
      total: itens.reduce((n, o) => n + o.valorTotal, 0),
      itens,
      semMostrar: 0,
    }
  }),
  resumo: { ativas: porFase.flat().length, total: 24000, mensal: 1500, ponderado: 2400 },
  suspensas: 0,
  ...extra,
})
