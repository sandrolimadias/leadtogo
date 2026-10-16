import type { Atividade, TipoAtividade } from '@leadtogo/api-client'

import { id } from '@/telas/contatos/fixtures'

export const tipo = (n: number, extra: Partial<TipoAtividade> = {}): TipoAtividade => ({
  id: id(900 + n),
  nome: `Tipo ${n}`,
  icone: 'phone',
  cor: 'blue',
  contaComo: 'contato',
  exigeEmpresa: true,
  sincronizaAgenda: false,
  ativo: true,
  ordem: n,
  chaveSistema: null,
  ...extra,
})

export const TIPO_VISITA = tipo(1, {
  nome: 'Visita',
  icone: 'map-pin',
  cor: 'orange',
  contaComo: 'visita',
  chaveSistema: 'visita',
})
export const TIPO_LIGACAO = tipo(2, { nome: 'Ligação', chaveSistema: 'ligacao' })
export const TIPO_TAREFA = tipo(3, {
  nome: 'Tarefa',
  icone: 'square-check',
  cor: 'gray',
  contaComo: 'nenhum',
  exigeEmpresa: false,
  chaveSistema: 'tarefa',
})
export const TIPOS = [TIPO_VISITA, TIPO_LIGACAO, TIPO_TAREFA]

export const atividade = (n: number, extra: Partial<Atividade> = {}): Atividade => ({
  id: id(700 + n),
  tipo: {
    id: TIPO_VISITA.id,
    nome: 'Visita',
    icone: 'map-pin',
    cor: 'orange',
    contaComo: 'visita',
  },
  titulo: `Atividade ${n}`,
  empresa: { id: id(1), nome: 'Usidantec' },
  contato: null,
  oportunidade: null,
  responsavel: { id: id(800), nome: 'Alessandro Dias' },
  dataInicio: '2026-10-20T13:00:00.000Z',
  dataFim: null,
  diaInteiro: false,
  situacao: 'pendente',
  atrasada: false,
  realizadaEm: null,
  resultado: null,
  importante: false,
  urgente: false,
  observacoes: null,
  origem: 'manual',
  criadaEm: '2026-10-10T12:00:00.000Z',
  editavel: true,
  ...extra,
})
