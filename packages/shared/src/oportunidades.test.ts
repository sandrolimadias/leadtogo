import { describe, expect, it } from 'vitest'

import {
  alterarOportunidadeSchema,
  criarOportunidadeSchema,
  fecharOportunidadeSchema,
  ponderadoDaOportunidade,
  totalDaOportunidade,
} from './oportunidades.js'

const EMPRESA = '0191f2b4-0000-7000-8000-000000000001'
const MOTIVO = '0191f2b4-0000-7000-8000-000000000002'

describe('valores da oportunidade', () => {
  it('total = único + mensal × meses; ponderado = total × probabilidade', () => {
    // licença R$ 500/mês × 12 + implantação R$ 2.000 → R$ 8.000
    expect(totalDaOportunidade(2000, 500, 12)).toBe(8000)
    expect(ponderadoDaOportunidade(8000, 50)).toBe(4000)
    expect(totalDaOportunidade(10.35, 0.07, 3)).toBe(10.56)
    expect(ponderadoDaOportunidade(10.56, 33)).toBe(3.48)
    expect(totalDaOportunidade(0, 0, 0)).toBe(0)
  })
})

describe('criar oportunidade', () => {
  it('só o título e a empresa bastam; valores começam em zero; a previsão é opcional', () => {
    const o = criarOportunidadeSchema.parse({ titulo: ' Contrato anual ', empresaId: EMPRESA })
    expect(o).toMatchObject({ titulo: 'Contrato anual', valorUnico: 0, valorMensal: 0 })
    expect(o.meses).toBeUndefined()
    expect(o.dataPrevistaFechamento).toBeUndefined()
    expect(
      criarOportunidadeSchema.parse({
        titulo: 'x',
        empresaId: EMPRESA,
        dataPrevistaFechamento: null,
      }).dataPrevistaFechamento,
    ).toBeNull()
  })

  it('recusa valor negativo, com mais de 2 casas ou alto demais, meses fora de 0 a 600 e total digitado', () => {
    const base = { titulo: 'x', empresaId: EMPRESA }
    expect(criarOportunidadeSchema.safeParse({ ...base, valorUnico: -1 }).success).toBe(false)
    expect(criarOportunidadeSchema.safeParse({ ...base, valorMensal: 10.123 }).success).toBe(false)
    expect(criarOportunidadeSchema.safeParse({ ...base, valorUnico: 2_000_000_000 }).success).toBe(
      false,
    )
    expect(criarOportunidadeSchema.safeParse({ ...base, meses: -1 }).success).toBe(false)
    expect(criarOportunidadeSchema.safeParse({ ...base, meses: 601 }).success).toBe(false)
    expect(criarOportunidadeSchema.safeParse({ ...base, meses: 1.5 }).success).toBe(false)
    // o total é calculado: não existe como entrada
    expect(criarOportunidadeSchema.safeParse({ ...base, valorTotal: 100 }).success).toBe(false)
    expect(criarOportunidadeSchema.safeParse({ ...base, probabilidade: 101 }).success).toBe(false)
    expect(
      criarOportunidadeSchema.safeParse({
        ...base,
        valorUnico: 99.9,
        valorMensal: 0.01,
        meses: 600,
      }).success,
    ).toBe(true)
  })

  it('editar exige algum campo e não aceita fase nem status (mudam por mover e fechar)', () => {
    expect(alterarOportunidadeSchema.safeParse({}).success).toBe(false)
    expect(alterarOportunidadeSchema.safeParse({ faseId: EMPRESA }).success).toBe(false)
    expect(alterarOportunidadeSchema.safeParse({ status: 'perdido' }).success).toBe(false)
    expect(alterarOportunidadeSchema.safeParse({ valorMensal: 300, meses: 12 }).success).toBe(true)
  })

  it('editar aceita a data de criação como um dia', () => {
    expect(alterarOportunidadeSchema.safeParse({ criadaEm: '2026-01-15' }).success).toBe(true)
    expect(alterarOportunidadeSchema.safeParse({ criadaEm: '15/01/2026' }).success).toBe(false)
    expect(alterarOportunidadeSchema.safeParse({ criadaEm: null }).success).toBe(false)
  })
})

describe('fechar oportunidade', () => {
  it('Conquistado não pede motivo; Perdido, Cancelado e Suspenso, sim', () => {
    expect(fecharOportunidadeSchema.safeParse({ status: 'conquistado' }).success).toBe(true)
    for (const status of ['perdido', 'cancelado'] as const) {
      expect(fecharOportunidadeSchema.safeParse({ status }).success).toBe(false)
      expect(fecharOportunidadeSchema.safeParse({ status, motivoId: MOTIVO }).success).toBe(true)
    }
  })

  it('Suspenso também exige "retomar em"; ativo não é um fechamento', () => {
    expect(
      fecharOportunidadeSchema.safeParse({ status: 'suspenso', motivoId: MOTIVO }).success,
    ).toBe(false)
    expect(
      fecharOportunidadeSchema.safeParse({
        status: 'suspenso',
        motivoId: MOTIVO,
        retomarEm: '2026-12-01',
      }).success,
    ).toBe(true)
    expect(fecharOportunidadeSchema.safeParse({ status: 'ativo' }).success).toBe(false)
  })

  it('a data de fechamento é opcional e é um dia (AAAA-MM-DD)', () => {
    const conquistada = (dataFechamento: unknown) =>
      fecharOportunidadeSchema.safeParse({ status: 'conquistado', dataFechamento }).success
    expect(conquistada('2026-10-12')).toBe(true)
    expect(conquistada('12/10/2026')).toBe(false)
    expect(conquistada('2026-10-12T10:00:00Z')).toBe(false)
    expect(conquistada(null)).toBe(false)
  })
})
