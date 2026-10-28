import { describe, expect, it } from 'vitest'

import { INVALIDO } from './importacao-leitura.js'
import {
  decidirOportunidade,
  lerDinheiro,
  lerLinhaDeOportunidade,
  lerMeses,
  lerPercentual,
  lerStatus,
  type OportunidadeDaLinha,
  statusExigeMotivo,
  tituloSugerido,
} from './importacao-oportunidades.js'

describe('lerDinheiro', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['0', 0],
    ['1234', 1234],
    ['1234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['R$ 1.234,56', 1234.56],
    ['r$1.234.567,8', 1234567.8],
    ['1.234', 1234],
    ['1.234.567', 1234567],
    ['1234.56', 1234.56],
    ['0.75', 0.75],
    ['1,234.56', 1234.56],
    ['1,234,567', 1234567],
    ['12,5', 12.5],
  ])('"%s" → %s', (entrada, esperado) => {
    expect(lerDinheiro(entrada)).toBe(esperado)
  })

  it.each(['-10', 'dez reais', '1,234,56', '12,345', '1.2.3,4,5', '10,999', 'abc', '2000000000'])(
    '"%s" é inválido',
    (entrada) => {
      expect(lerDinheiro(entrada)).toBe(INVALIDO)
    },
  )
})

describe('lerPercentual e lerMeses', () => {
  it('aceita inteiro com ou sem sufixo, dentro dos limites', () => {
    expect(lerPercentual('40')).toBe(40)
    expect(lerPercentual('40%')).toBe(40)
    expect(lerPercentual(' 100 % ')).toBe(100)
    expect(lerPercentual('')).toBeNull()
    expect(lerPercentual('101')).toBe(INVALIDO)
    expect(lerPercentual('40,5')).toBe(INVALIDO)
    expect(lerMeses('12')).toBe(12)
    expect(lerMeses('24 meses')).toBe(24)
    expect(lerMeses('0')).toBe(0)
    expect(lerMeses('601')).toBe(INVALIDO)
    expect(lerMeses('doze')).toBe(INVALIDO)
  })
})

describe('lerStatus', () => {
  it('entende os sinônimos, sem acento nem maiúsculas', () => {
    expect(lerStatus('')).toBeNull()
    expect(lerStatus('Ativa')).toBe('ativo')
    expect(lerStatus('GANHO')).toBe('conquistado')
    expect(lerStatus('Vendida')).toBe('conquistado')
    expect(lerStatus('perdida')).toBe('perdido')
    expect(lerStatus('Cancelado')).toBe('cancelado')
    expect(lerStatus('pausada')).toBe('suspenso')
    expect(lerStatus('talvez')).toBe(INVALIDO)
  })
})

const CAMPOS = {
  documento: 'CNPJ',
  titulo: 'Título',
  fase: 'Fase',
  status: 'Status',
  motivo: 'Motivo',
  motivoDetalhe: 'Detalhe',
  retomarEm: 'Retomar',
  dataFechamento: 'Fechamento',
  valorUnico: 'Único',
  valorMensal: 'Mensal',
  meses: 'Meses',
  probabilidade: 'Prob',
  dataPrevista: 'Previsão',
  origem: 'Origem',
  solucao: 'Solução',
  emailContato: 'Contato',
  emailResponsavel: 'Responsável',
  observacoes: 'Obs',
}
const ler = (dados: Record<string, string>) => lerLinhaDeOportunidade(dados, CAMPOS)

describe('lerLinhaDeOportunidade', () => {
  it('lê a linha completa de uma oportunidade ativa', () => {
    const r = ler({
      CNPJ: '11.222.333/0001-81',
      Título: ' Contrato 2027 ',
      Fase: 'Proposta',
      Status: '',
      Único: 'R$ 2.000,00',
      Mensal: '500',
      Meses: '',
      Prob: '60%',
      Previsão: '15/12/2026',
      Origem: 'Indicação',
      Solução: 'ERP',
      Contato: 'Ana@Cliente.com.br',
      Responsável: 'vendedor@empresa.com',
      Obs: 'veio do CRM antigo',
    })
    expect(r).toEqual({
      ok: true,
      avisos: [],
      oportunidade: {
        titulo: 'Contrato 2027',
        fase: 'Proposta',
        status: 'ativo',
        motivo: null,
        motivoDetalhe: null,
        retomarEm: null,
        dataFechamento: null,
        valorUnico: 2000,
        valorMensal: 500,
        meses: null,
        probabilidade: 60,
        dataPrevista: '2026-12-15',
        origem: 'Indicação',
        solucao: 'ERP',
        emailContato: 'ana@cliente.com.br',
        emailResponsavel: 'vendedor@empresa.com',
        observacoes: 'veio do CRM antigo',
      },
    })
  })

  it('linha só com o CNPJ: Ativa, valores zerados, o resto nulo', () => {
    const r = ler({ CNPJ: '11222333000181' })
    expect(r.ok && r.oportunidade).toMatchObject({
      status: 'ativo',
      valorUnico: 0,
      valorMensal: 0,
      meses: null,
      probabilidade: null,
      fase: null,
      titulo: null,
    })
  })

  it.each([
    [{ Status: 'talvez' }, 'Status desconhecido'],
    [{ Único: 'muito' }, 'Valor único inválido'],
    [{ Mensal: '-5' }, 'Valor mensal inválido'],
    [{ Meses: '1000' }, 'Meses inválido'],
    [{ Prob: '150' }, 'Probabilidade inválida'],
    [{ Previsão: '31/02/2027' }, 'Data prevista de fechamento inválida'],
    [{ Status: 'Perdida', Fechamento: 'ontem' }, 'Data de fechamento inválida'],
    [{ Status: 'Suspensa' }, 'exige a data em "Retomar em"'],
  ])('pula a linha: %o', (dados, motivo) => {
    const r = ler({ CNPJ: '11222333000181', ...dados })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.motivo).toContain(motivo)
  })

  it('o que não vale para o status é ignorado, com aviso', () => {
    const ativa = ler({
      CNPJ: '1',
      Retomar: '10/01/2027',
      Fechamento: '01/10/2026',
      Motivo: 'Preço',
      Detalhe: 'caro',
    })
    expect(ativa.ok && ativa.oportunidade).toMatchObject({
      retomarEm: null,
      dataFechamento: null,
      motivo: null,
      motivoDetalhe: null,
    })
    expect(ativa.ok && ativa.avisos).toHaveLength(4)

    const ganha = ler({ CNPJ: '1', Status: 'Ganha', Motivo: 'Preço', Detalhe: 'fechou rápido' })
    expect(ganha.ok && ganha.oportunidade).toMatchObject({
      status: 'conquistado',
      motivo: null,
      motivoDetalhe: 'fechou rápido',
    })
  })

  it('e-mail inválido vira aviso e o campo fica vazio', () => {
    const r = ler({ CNPJ: '1', Contato: 'sem-arroba', Responsável: 'x@y' })
    expect(r.ok && r.oportunidade.emailContato).toBeNull()
    expect(r.ok && r.oportunidade.emailResponsavel).toBeNull()
    expect(r.ok && r.avisos).toHaveLength(2)
  })
})

const base: OportunidadeDaLinha = {
  titulo: null,
  fase: null,
  status: 'ativo',
  motivo: null,
  motivoDetalhe: null,
  retomarEm: null,
  dataFechamento: null,
  valorUnico: 0,
  valorMensal: 0,
  meses: null,
  probabilidade: null,
  dataPrevista: null,
  origem: null,
  solucao: null,
  emailContato: null,
  emailResponsavel: null,
  observacoes: null,
}
// 28/10/2026 às 15h em São Paulo
const AGORA = new Date('2026-10-28T18:00:00Z')

describe('decidirOportunidade', () => {
  it('ativa: sem data de fechamento e sem aviso', () => {
    expect(decidirOportunidade(base, AGORA)).toEqual({ ok: true, dataFechamento: null, avisos: [] })
  })

  it('fechada com data: o início do dia no fuso', () => {
    const r = decidirOportunidade(
      { ...base, status: 'perdido', dataFechamento: '2026-03-10' },
      AGORA,
    )
    expect(r).toEqual({
      ok: true,
      dataFechamento: new Date('2026-03-10T03:00:00Z'),
      avisos: [],
    })
  })

  it('fechada sem data: fica a da importação, com aviso', () => {
    const r = decidirOportunidade({ ...base, status: 'conquistado' }, AGORA)
    expect(r.ok && r.dataFechamento).toBeNull()
    expect(r.ok && r.avisos).toHaveLength(1)
  })

  it('data de fechamento no futuro e retomada no passado pulam; hoje vale', () => {
    expect(
      decidirOportunidade({ ...base, status: 'perdido', dataFechamento: '2026-10-29' }, AGORA).ok,
    ).toBe(false)
    expect(
      decidirOportunidade({ ...base, status: 'perdido', dataFechamento: '2026-10-28' }, AGORA).ok,
    ).toBe(true)
    expect(
      decidirOportunidade({ ...base, status: 'suspenso', retomarEm: '2026-10-27' }, AGORA).ok,
    ).toBe(false)
    expect(
      decidirOportunidade({ ...base, status: 'suspenso', retomarEm: '2026-10-28' }, AGORA).ok,
    ).toBe(true)
  })
})

describe('apoio', () => {
  it('statusExigeMotivo e tituloSugerido', () => {
    expect(
      ['ativo', 'conquistado', 'perdido', 'cancelado', 'suspenso'].map((s) =>
        statusExigeMotivo(s as OportunidadeDaLinha['status']),
      ),
    ).toEqual([false, false, true, true, true])
    expect(tituloSugerido('Padaria Pão Bom', 'ERP')).toBe('Padaria Pão Bom – ERP')
    expect(tituloSugerido('Padaria Pão Bom', null)).toBe('Padaria Pão Bom')
  })
})
