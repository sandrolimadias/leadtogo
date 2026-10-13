import { describe, expect, it } from 'vitest'

import {
  aniversarioSchema,
  alterarContatoSchema,
  criarContatoSchema,
  emailEntradaSchema,
} from './carteira-contatos.js'

const EMPRESA = '0199a000-0000-7000-8000-000000000001'

describe('criar contato', () => {
  it('só o nome é obrigatório; textos aparados e vazios viram nulo', () => {
    const r = criarContatoSchema.parse({ nome: '  Ana Souza ', observacoes: '  ', linkedinUrl: '' })
    expect(r.nome).toBe('Ana Souza')
    expect(r.observacoes).toBeNull()
    expect(r.linkedinUrl).toBeNull()
    expect(r.telefones).toBeUndefined()
  })

  it('aceita o vínculo inicial com a empresa, o cargo e o principal', () => {
    const r = criarContatoSchema.parse({
      nome: 'Ana',
      vinculo: { empresaId: EMPRESA, cargo: ' Compradora ', principal: true },
    })
    expect(r.vinculo).toEqual({ empresaId: EMPRESA, cargo: 'Compradora', principal: true })
  })

  it('recusa nome curto, campo desconhecido, LinkedIn fora do padrão e mais de 10 telefones', () => {
    expect(criarContatoSchema.safeParse({ nome: 'A' }).success).toBe(false)
    expect(criarContatoSchema.safeParse({ nome: 'Ana', x: 1 }).success).toBe(false)
    expect(
      criarContatoSchema.safeParse({ nome: 'Ana', linkedinUrl: 'https://exemplo.com/ana' }).success,
    ).toBe(false)
    expect(
      criarContatoSchema.safeParse({ nome: 'Ana', linkedinUrl: 'https://www.linkedin.com/in/ana' })
        .success,
    ).toBe(true)
    const telefones = Array.from({ length: 11 }, (_, i) => ({ numero: `2730643${i}00` }))
    expect(criarContatoSchema.safeParse({ nome: 'Ana', telefones }).success).toBe(false)
  })
})

describe('e-mail', () => {
  it('vai para minúsculas e sem espaços; recusa o que não é e-mail', () => {
    expect(emailEntradaSchema.parse({ email: ' Ana@Exemplo.COM ' }).email).toBe('ana@exemplo.com')
    expect(emailEntradaSchema.safeParse({ email: 'ana@' }).success).toBe(false)
  })
})

describe('aniversário (dia e mês, sem ano)', () => {
  it('aceita 29/02 e recusa 31/02, 31/04, mês 13 e dia 0', () => {
    expect(aniversarioSchema.safeParse({ dia: 29, mes: 2 }).success).toBe(true)
    for (const ruim of [
      { dia: 31, mes: 2 },
      { dia: 31, mes: 4 },
      { dia: 1, mes: 13 },
      { dia: 0, mes: 5 },
    ]) {
      expect(aniversarioSchema.safeParse(ruim).success, JSON.stringify(ruim)).toBe(false)
    }
  })
})

describe('alterar contato', () => {
  it('só o que vem muda; corpo vazio é recusado; null limpa o papel e o aniversário', () => {
    expect(alterarContatoSchema.parse({ observacoes: 'x' })).toEqual({ observacoes: 'x' })
    expect(alterarContatoSchema.safeParse({}).success).toBe(false)
    expect(alterarContatoSchema.parse({ papelDecisaoId: null, aniversario: null })).toEqual({
      papelDecisaoId: null,
      aniversario: null,
    })
  })
})
