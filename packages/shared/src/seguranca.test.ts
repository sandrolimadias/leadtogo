import { describe, expect, it } from 'vitest'

import { politicaDoisFatoresSchema, politicaExige, segurancaPatchSchema } from './seguranca.js'

describe('política de 2FA', () => {
  it('os valores são admin (padrão), admin_gestor e todos', () => {
    expect(politicaDoisFatoresSchema.options).toEqual(['admin', 'admin_gestor', 'todos'])
  })

  it('cada política obriga os papéis certos', () => {
    const tabela = {
      admin: { admin: true, gestor: false, vendedor: false },
      admin_gestor: { admin: true, gestor: true, vendedor: false },
      todos: { admin: true, gestor: true, vendedor: true },
    } as const
    for (const [politica, papeis] of Object.entries(tabela)) {
      for (const [papel, esperado] of Object.entries(papeis)) {
        expect(
          politicaExige(politica as keyof typeof tabela, papel as 'admin' | 'gestor' | 'vendedor'),
          `${politica} + ${papel}`,
        ).toBe(esperado)
      }
    }
  })

  it('o PATCH aceita só um valor válido e nenhum campo extra', () => {
    expect(segurancaPatchSchema.safeParse({ doisFatoresExigido: 'todos' }).success).toBe(true)
    for (const ruim of [
      {},
      { doisFatoresExigido: 'ninguem' },
      { doisFatoresExigido: 'admin', x: 1 },
    ]) {
      expect(segurancaPatchSchema.safeParse(ruim).success).toBe(false)
    }
  })
})
