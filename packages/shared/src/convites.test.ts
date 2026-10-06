import { describe, expect, it } from 'vitest'

import { aceitarConviteSchema, consultarConviteSchema, criarConviteSchema } from './convites.js'

const TOKEN = 'a'.repeat(43)

describe('schemas de convite', () => {
  it('criar: normaliza o e-mail, exige papel válido e recusa campos extras', () => {
    expect(criarConviteSchema.parse({ email: ' Ana@Exemplo.COM ', papel: 'vendedor' })).toEqual({
      email: 'ana@exemplo.com',
      papel: 'vendedor',
    })
    for (const ruim of [
      { email: 'x', papel: 'vendedor' },
      { email: 'a@b.com', papel: 'dono' },
      { email: 'a@b.com' },
      { email: 'a@b.com', papel: 'admin', tenantId: 'x' },
    ]) {
      expect(criarConviteSchema.safeParse(ruim).success).toBe(false)
    }
  })

  it('consultar e aceitar: o token é obrigatório e razoável; nome e senha são opcionais mas validados', () => {
    expect(consultarConviteSchema.safeParse({ token: TOKEN }).success).toBe(true)
    expect(consultarConviteSchema.safeParse({ token: 'curto' }).success).toBe(false)
    expect(consultarConviteSchema.safeParse({}).success).toBe(false)
    expect(aceitarConviteSchema.safeParse({ token: TOKEN }).success).toBe(true)
    expect(
      aceitarConviteSchema.safeParse({ token: TOKEN, nome: 'Ana', senha: 'senha-forte-123' })
        .success,
    ).toBe(true)
    expect(aceitarConviteSchema.safeParse({ token: TOKEN, senha: 'curta' }).success).toBe(false)
    expect(aceitarConviteSchema.safeParse({ token: TOKEN, nome: 'A' }).success).toBe(false)
    expect(aceitarConviteSchema.safeParse({ token: TOKEN, papel: 'admin' }).success).toBe(false)
  })
})
