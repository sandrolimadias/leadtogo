import { describe, expect, it } from 'vitest'

import {
  consultaDaBuscaGlobalSchema,
  novaBuscaRecenteSchema,
  termoComparavel,
} from './busca-global.js'

describe('busca global', () => {
  it('a consulta exige 2 letras, aceita os tipos separados por vírgula e limita o resultado', () => {
    expect(consultaDaBuscaGlobalSchema.safeParse({ q: ' a ' }).success).toBe(false)
    expect(consultaDaBuscaGlobalSchema.parse({ q: ' acme ' })).toEqual({ q: 'acme', limite: 5 })
    expect(
      consultaDaBuscaGlobalSchema.parse({ q: 'acme', tipos: 'empresas,contatos', limite: '10' }),
    ).toEqual({ q: 'acme', tipos: ['empresas', 'contatos'], limite: 10 })
    expect(consultaDaBuscaGlobalSchema.safeParse({ q: 'acme', tipos: 'tarefas' }).success).toBe(
      false,
    )
    expect(consultaDaBuscaGlobalSchema.safeParse({ q: 'acme', limite: 21 }).success).toBe(false)
    expect(consultaDaBuscaGlobalSchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false)
  })

  it('o termo recente vem aparado e com 2 a 100 caracteres', () => {
    expect(novaBuscaRecenteSchema.parse({ termo: '  Usidantec ' })).toEqual({ termo: 'Usidantec' })
    expect(novaBuscaRecenteSchema.safeParse({ termo: 'x' }).success).toBe(false)
  })

  it('o termo comparável ignora acento, caixa e espaços', () => {
    expect(termoComparavel('São  José')).toBe(termoComparavel('sao jose'))
    expect(termoComparavel(' 12.345.678/0001-90 ')).toBe('12 345 678 0001 90')
    expect(termoComparavel('%%')).toBe('%%')
  })
})
