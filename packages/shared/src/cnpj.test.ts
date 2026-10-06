import { describe, expect, it } from 'vitest'

import { cnpjValido, completarCnpj, normalizarCnpj } from './cnpj.js'

describe('CNPJ alfanumérico', () => {
  it('valida CNPJs numéricos conhecidos, com e sem máscara', () => {
    expect(cnpjValido('11222333000181')).toBe(true)
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('00.000.000/0001-91')).toBe(true) // Banco do Brasil
  })

  it('valida o exemplo alfanumérico da Receita (12.ABC.345/01DE-35)', () => {
    expect(cnpjValido('12ABC34501DE35')).toBe(true)
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true)
    expect(cnpjValido('12abc34501de35')).toBe(true) // minúsculas
  })

  it('recusa dígito verificador errado, tamanho errado e caracteres inválidos', () => {
    expect(cnpjValido('11222333000182')).toBe(false)
    expect(cnpjValido('12ABC34501DE36')).toBe(false)
    expect(cnpjValido('1122233300018')).toBe(false)
    expect(cnpjValido('112223330001811')).toBe(false)
    expect(cnpjValido('12ABC34501DEAB')).toBe(false) // DVs precisam ser numéricos
    expect(cnpjValido('12ABC34501D!35')).toBe(false)
    expect(cnpjValido('')).toBe(false)
  })

  it('recusa sequências repetidas', () => {
    for (const c of ['00000000000000', '11111111111111', 'AAAAAAAAAAAAAA'])
      expect(cnpjValido(c)).toBe(false)
  })

  it('completa os dígitos verificadores de uma base de 12 caracteres', () => {
    expect(completarCnpj('112223330001')).toBe('11222333000181')
    expect(completarCnpj('12ABC34501DE')).toBe('12ABC34501DE35')
    for (const base of ['A1B2C3D4E5F6', 'ZZZZZZZZ0001', '000000000001'])
      expect(cnpjValido(completarCnpj(base))).toBe(true)
    expect(() => completarCnpj('curto')).toThrow()
  })

  it('normaliza sem tirar letras', () => {
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35')
    expect(normalizarCnpj(' 11.222.333/0001-81 ')).toBe('11222333000181')
  })
})
