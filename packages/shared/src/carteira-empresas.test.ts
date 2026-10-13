import { describe, expect, it } from 'vitest'

import {
  alterarEmpresaCarteiraSchema,
  criarEmpresaCarteiraSchema,
  telefoneEntradaSchema,
} from './carteira-empresas.js'
import { completarCnpj } from './cnpj.js'

const CNPJ = completarCnpj('112223330001')
const CPF = '529.982.247-25'

describe('criar empresa da carteira', () => {
  it('CNPJ: aceita com máscara, guarda sem máscara e apara os textos', () => {
    const r = criarEmpresaCarteiraSchema.parse({
      tipoDocumento: 'cnpj',
      documento: `${CNPJ.slice(0, 2)}.${CNPJ.slice(2, 5)}.${CNPJ.slice(5, 8)}/${CNPJ.slice(8, 12)}-${CNPJ.slice(12)}`,
      razaoSocial: '  Metalúrgica Exemplo Ltda ',
      website: '  ',
    })
    expect(r.documento).toBe(CNPJ)
    expect(r.razaoSocial).toBe('Metalúrgica Exemplo Ltda')
    expect(r.website).toBeNull() // vazio limpa o campo
    expect(r.nomeFantasia).toBeUndefined() // ausente não mexe
  })

  it('CPF: guarda só os dígitos; CPF e CNPJ inválidos são recusados', () => {
    expect(
      criarEmpresaCarteiraSchema.parse({ tipoDocumento: 'cpf', documento: CPF, razaoSocial: 'Ana' })
        .documento,
    ).toBe('52998224725')
    const ruim = (tipoDocumento: string, documento: string) =>
      criarEmpresaCarteiraSchema.safeParse({ tipoDocumento, documento, razaoSocial: 'Ana' })
    expect(ruim('cpf', '111.111.111-11').success).toBe(false)
    expect(ruim('cnpj', '11.222.333/0001-00').success).toBe(false)
  })

  it('sem documento: não pode trazer documento; com tipo cnpj/cpf, o documento é obrigatório', () => {
    expect(
      criarEmpresaCarteiraSchema.safeParse({ tipoDocumento: 'nenhum', razaoSocial: 'Loja do Zé' })
        .success,
    ).toBe(true)
    expect(
      criarEmpresaCarteiraSchema.safeParse({
        tipoDocumento: 'nenhum',
        documento: CPF,
        razaoSocial: 'Loja do Zé',
      }).success,
    ).toBe(false)
    expect(
      criarEmpresaCarteiraSchema.safeParse({ tipoDocumento: 'cnpj', razaoSocial: 'Sem número' })
        .success,
    ).toBe(false)
  })

  it('recusa campo desconhecido, nome curto, CEP incompleto e CNAE fora da faixa', () => {
    const base = { tipoDocumento: 'nenhum', razaoSocial: 'Loja do Zé' }
    expect(criarEmpresaCarteiraSchema.safeParse({ ...base, x: 1 }).success).toBe(false)
    expect(criarEmpresaCarteiraSchema.safeParse({ ...base, razaoSocial: 'A' }).success).toBe(false)
    expect(
      criarEmpresaCarteiraSchema.safeParse({ ...base, endereco: { cep: '1234' } }).success,
    ).toBe(false)
    expect(
      criarEmpresaCarteiraSchema.safeParse({ ...base, endereco: { cep: '29.100-000' } }).success,
    ).toBe(true)
    expect(
      criarEmpresaCarteiraSchema.safeParse({ ...base, cnaes: { principal: 12, secundarios: [] } })
        .success,
    ).toBe(false)
  })

  it('no máximo 10 telefones', () => {
    const telefones = Array.from({ length: 11 }, (_, i) => ({ numero: `2730643${i}00` }))
    expect(
      criarEmpresaCarteiraSchema.safeParse({
        tipoDocumento: 'nenhum',
        razaoSocial: 'Loja do Zé',
        telefones,
      }).success,
    ).toBe(false)
  })
})

describe('alterar empresa da carteira', () => {
  it('só o que vem muda; não aceita documento nem status; corpo vazio é recusado', () => {
    expect(alterarEmpresaCarteiraSchema.parse({ website: 'https://exemplo.com.br' })).toEqual({
      website: 'https://exemplo.com.br',
    })
    expect(alterarEmpresaCarteiraSchema.safeParse({}).success).toBe(false)
    expect(alterarEmpresaCarteiraSchema.safeParse({ documento: CNPJ }).success).toBe(false)
    expect(
      alterarEmpresaCarteiraSchema.safeParse({ statusTagId: crypto.randomUUID() }).success,
    ).toBe(false)
  })

  it('null limpa o vertical; texto vazio limpa as observações', () => {
    expect(alterarEmpresaCarteiraSchema.parse({ verticalId: null, observacoes: ' ' })).toEqual({
      verticalId: null,
      observacoes: null,
    })
  })
})

describe('telefone de entrada', () => {
  it('exige número e recusa campo desconhecido', () => {
    expect(telefoneEntradaSchema.safeParse({ numero: '' }).success).toBe(false)
    expect(telefoneEntradaSchema.safeParse({ numero: '27 3064-3021', x: 1 }).success).toBe(false)
    expect(telefoneEntradaSchema.parse({ numero: '27 3064-3021', tipo: 'fixo' }).tipo).toBe('fixo')
  })
})
