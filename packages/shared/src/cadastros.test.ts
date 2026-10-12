import { describe, expect, it } from 'vitest'

import {
  alterarTagGrupoSchema,
  alterarMotivoSchema,
  alterarOrigemSchema,
  alterarTagSchema,
  alterarTipoAtividadeSchema,
  CORES_DE_TAG,
  corDeTagSchema,
  criarMotivoSchema,
  criarOrigemSchema,
  criarSolucaoSchema,
  criarTagGrupoSchema,
  criarTagSchema,
  criarTipoAtividadeSchema,
  criarVerticalSchema,
  novaOrdemSchema,
} from './cadastros.js'

const UUID = '0199a000-0000-7000-8000-000000000001'

describe('cores de tag', () => {
  it('são as 10 da paleta do design system, nunca hexadecimal', () => {
    expect(CORES_DE_TAG).toHaveLength(10)
    expect(corDeTagSchema.safeParse('teal').success).toBe(true)
    expect(corDeTagSchema.safeParse('#0b5f70').success).toBe(false)
    expect(corDeTagSchema.safeParse('magenta').success).toBe(false)
  })
})

describe('grupos de tags', () => {
  it('criar: nome aparado, seleção obrigatória, "obrigatório" padrão falso, sem campo extra', () => {
    expect(criarTagGrupoSchema.parse({ nome: '  Interesse ', selecao: 'multipla' })).toEqual({
      nome: 'Interesse',
      selecao: 'multipla',
      obrigatorio: false,
    })
    for (const ruim of [
      { nome: '   ', selecao: 'unica' },
      { nome: 'x'.repeat(81), selecao: 'unica' },
      { nome: 'Ok' },
      { nome: 'Ok', selecao: 'varias' },
      { nome: 'Ok', selecao: 'unica', sistema: true },
    ]) {
      expect(criarTagGrupoSchema.safeParse(ruim).success, JSON.stringify(ruim)).toBe(false)
    }
  })

  it('alterar: ao menos um campo, e só os campos permitidos', () => {
    expect(alterarTagGrupoSchema.safeParse({}).success).toBe(false)
    expect(alterarTagGrupoSchema.safeParse({ ativo: false }).success).toBe(true)
    expect(alterarTagGrupoSchema.safeParse({ sistema: false }).success).toBe(false)
    expect(alterarTagGrupoSchema.safeParse({ nome: ' ' }).success).toBe(false)
  })
})

describe('tags', () => {
  it('criar: grupo uuid, cor padrão cinza, cor fora da paleta recusada', () => {
    expect(criarTagSchema.parse({ tagGrupoId: UUID, nome: ' Ouro ' })).toEqual({
      tagGrupoId: UUID,
      nome: 'Ouro',
      cor: 'gray',
    })
    expect(criarTagSchema.safeParse({ tagGrupoId: 'x', nome: 'Ouro' }).success).toBe(false)
    expect(
      criarTagSchema.safeParse({ tagGrupoId: UUID, nome: 'Ouro', cor: 'dourado' }).success,
    ).toBe(false)
  })

  it('alterar: ao menos um campo; não troca o grupo nem a chave de sistema', () => {
    expect(alterarTagSchema.safeParse({}).success).toBe(false)
    expect(alterarTagSchema.safeParse({ cor: 'red', ativo: false }).success).toBe(true)
    expect(alterarTagSchema.safeParse({ tagGrupoId: UUID }).success).toBe(false)
    expect(alterarTagSchema.safeParse({ chaveSistema: 'cliente' }).success).toBe(false)
  })
})

describe('nova ordem', () => {
  it('lista de uuids, de 1 a 500', () => {
    expect(novaOrdemSchema.safeParse({ ids: [UUID] }).success).toBe(true)
    expect(novaOrdemSchema.safeParse({ ids: [] }).success).toBe(false)
    expect(novaOrdemSchema.safeParse({ ids: ['a'] }).success).toBe(false)
  })
})

describe('verticais, soluções, origens, motivos e tipos de atividade', () => {
  it('motivo: só perdido, cancelado e suspenso; ao menos um, sem repetir', () => {
    const ok = criarMotivoSchema.safeParse({ nome: 'Preço', aplicaA: ['perdido'] })
    expect(ok.success).toBe(true)
    for (const ruim of [
      { nome: 'X', aplicaA: [] },
      { nome: 'X', aplicaA: ['conquistado'] },
      { nome: 'X', aplicaA: ['ativo'] },
      { nome: 'X', aplicaA: ['perdido', 'perdido'] },
      { nome: 'X' },
    ]) {
      expect(criarMotivoSchema.safeParse(ruim).success, JSON.stringify(ruim)).toBe(false)
    }
    expect(alterarMotivoSchema.safeParse({}).success).toBe(false)
  })

  it('tipo de atividade: padrões, ícone no formato Lucide e conta como válido', () => {
    expect(criarTipoAtividadeSchema.parse({ nome: ' Almoço ', icone: 'utensils' })).toEqual({
      nome: 'Almoço',
      icone: 'utensils',
      cor: 'gray',
      contaComo: 'nenhum',
      exigeEmpresa: true,
      sincronizaAgenda: false,
    })
    for (const ruim of [
      { nome: 'X', icone: 'Phone' },
      { nome: 'X', icone: '<script>' },
      { nome: 'X', icone: 'a b' },
      { nome: 'X', icone: 'phone', contaComo: 'tudo' },
      { nome: 'X', icone: 'phone', chaveSistema: 'visita' },
    ]) {
      expect(criarTipoAtividadeSchema.safeParse(ruim).success, JSON.stringify(ruim)).toBe(false)
    }
    expect(alterarTipoAtividadeSchema.safeParse({}).success).toBe(false)
  })

  it('solução aceita descrição vazia ou nula; vertical e origem só os campos permitidos', () => {
    expect(criarSolucaoSchema.safeParse({ nome: 'S', descricao: null }).success).toBe(true)
    expect(criarSolucaoSchema.safeParse({ nome: 'S', descricao: 'x'.repeat(501) }).success).toBe(
      false,
    )
    expect(criarVerticalSchema.safeParse({ nome: 'V', cor: 'magenta' }).success).toBe(false)
    expect(criarOrigemSchema.safeParse({ nome: 'O', chaveSistema: 'importacao' }).success).toBe(
      false,
    )
    expect(alterarOrigemSchema.safeParse({ ativo: false }).success).toBe(true)
  })
})
