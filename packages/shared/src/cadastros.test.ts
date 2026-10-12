import { describe, expect, it } from 'vitest'

import {
  alterarTagGrupoSchema,
  alterarTagSchema,
  CORES_DE_TAG,
  corDeTagSchema,
  criarTagGrupoSchema,
  criarTagSchema,
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
