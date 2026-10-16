import type { Dashboard } from '@leadtogo/api-client'

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
