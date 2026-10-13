import { describe, expect, it } from 'vitest'

import { completarCnpj } from './cnpj.js'
import { cpfValido, formatarCnpj, formatarCpf, normalizarCpf } from './cpf.js'

describe('CPF', () => {
  it('valida com e sem máscara', () => {
    // CPFs de exemplo conhecidos como válidos (gerados por algoritmo, sem pessoa real)
    for (const ok of ['529.982.247-25', '52998224725', '111.444.777-35']) {
      expect(cpfValido(ok), ok).toBe(true)
    }
  })
  it('recusa dígito errado, repetidos, tamanho errado e texto', () => {
    for (const ruim of [
      '529.982.247-24',
      '111.111.111-11',
      '000.000.000-00',
      '5299822472',
      '529982247255',
      'abc',
      '',
    ]) {
      expect(cpfValido(ruim), ruim).toBe(false)
    }
  })
  it('normaliza e formata', () => {
    expect(normalizarCpf('529.982.247-25')).toBe('52998224725')
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
    expect(formatarCpf('123')).toBe('123')
  })
})

describe('formatarCnpj', () => {
  it('formata o numérico e o alfanumérico', () => {
    expect(formatarCnpj('12345678000195')).toBe('12.345.678/0001-95')
    const alfa = completarCnpj('12ABC3450001')
    expect(formatarCnpj(alfa)).toBe(`12.ABC.345/0001-${alfa.slice(12)}`)
    expect(formatarCnpj('123')).toBe('123')
  })
})
