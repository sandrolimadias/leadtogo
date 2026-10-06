import { describe, expect, it } from 'vitest'

import { primeiroAcessoSchema } from './primeiro-acesso.js'

const valido = {
  nome: '  Ana Souza ',
  email: ' ANA@Exemplo.com ',
  senha: 'senha-forte-123',
  empresa: { razaoSocial: ' Empresa Exemplo Ltda ', cnpj: '12.ABC.345/01DE-35' },
}

describe('primeiroAcessoSchema', () => {
  it('normaliza: apara texto, e-mail em minúsculas e CNPJ sem máscara (letras mantidas)', () => {
    const r = primeiroAcessoSchema.parse(valido)
    expect(r.nome).toBe('Ana Souza')
    expect(r.email).toBe('ana@exemplo.com')
    expect(r.empresa.razaoSocial).toBe('Empresa Exemplo Ltda')
    expect(r.empresa.cnpj).toBe('12ABC34501DE35')
  })

  it('o CNPJ é opcional', () => {
    const r = primeiroAcessoSchema.parse({ ...valido, empresa: { razaoSocial: 'Empresa X' } })
    expect(r.empresa.cnpj).toBeUndefined()
  })

  it('recusa campos inválidos, apontando onde', () => {
    const r = primeiroAcessoSchema.safeParse({
      nome: 'A',
      email: 'não-é-email',
      senha: 'curta',
      empresa: { razaoSocial: '', cnpj: '11222333000182' },
    })
    expect(r.success).toBe(false)
    const campos = r.success ? [] : r.error.issues.map((i) => i.path.join('.')).sort()
    expect(campos).toEqual(['email', 'empresa.cnpj', 'empresa.razaoSocial', 'nome', 'senha'])
  })

  it('recusa campos desconhecidos (nada de papel ou tenant vindo do cliente)', () => {
    expect(primeiroAcessoSchema.safeParse({ ...valido, papel: 'admin' }).success).toBe(false)
    expect(primeiroAcessoSchema.safeParse({ ...valido, tenantId: 'x' }).success).toBe(false)
  })
})
