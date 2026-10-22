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

  it('o PATCH aceita o 2FA de cada perfil (id → sim/não) e nada mais', () => {
    const id = '0192f0a0-0000-7000-8000-0000000000f3'
    expect(segurancaPatchSchema.safeParse({ perfis: { [id]: true } }).success).toBe(true)
    for (const ruim of [
      {},
      { perfis: {} },
      { perfis: { [id]: 'sim' } },
      { perfis: { 'nao-e-uuid': true } },
      { perfis: { [id]: true }, x: 1 },
      { doisFatoresExigido: 'todos' },
    ]) {
      expect(segurancaPatchSchema.safeParse(ruim).success).toBe(false)
    }
  })
})
