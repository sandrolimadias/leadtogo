import { describe, expect, it } from 'vitest'

import { empresaAtivaSchema, papelMembroSchema } from './me.js'

describe('schemas de /v1/me e da empresa ativa', () => {
  it('aceita um uuid e recusa o resto (e campos extras)', () => {
    const id = '01a111e8-f08a-70b7-b5f3-52998ced0a3d'
    expect(empresaAtivaSchema.parse({ empresaId: id })).toEqual({ empresaId: id })
    for (const ruim of [
      {},
      { empresaId: 'abc' },
      { empresaId: 123 },
      { empresaId: id, papel: 'admin' },
      null,
    ]) {
      expect(empresaAtivaSchema.safeParse(ruim).success).toBe(false)
    }
  })

  it('os papéis são admin, gestor e vendedor', () => {
    expect(papelMembroSchema.options).toEqual(['admin', 'gestor', 'vendedor'])
  })
})
