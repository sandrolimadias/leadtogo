import { describe, expect, it } from 'vitest'

import {
  cepNormalizado,
  chaveDaRua,
  chaveDoBairro,
  faltasNoEndereco,
  numeroDePorta,
  semelhanca,
  semNumeroDePorta,
  textoDoEndereco,
} from './geo-normalizar.js'

describe('chaveDaRua', () => {
  it.each([
    ['AV. DR. FULANO DE TAL', 'DOUTOR FULANO DE TAL'],
    ['Rua Jerônimo Monteiro', 'JERONIMO MONTEIRO'],
    ['R PROF ALMEIDA', 'PROFESSOR ALMEIDA'],
    ['Avenida Nossa Senhora da Penha', 'NOSSA SENHORA DA PENHA'],
    ['TRAV. STA LUZIA', 'SANTA LUZIA'],
    ["Rua D'Ávila", 'DAVILA'],
    ['ROD ES 060', 'ES 060'],
  ])('%s → %s', (entrada, esperado) => {
    expect(chaveDaRua(entrada)).toBe(esperado)
  })

  it('o tipo só sai do começo e a rua de uma palavra não expande título', () => {
    expect(chaveDaRua('Rua Sete')).toBe('SETE')
    expect(chaveDaRua('S')).toBe('S')
    expect(chaveDaRua('Beco do Dr')).toBe('DO DOUTOR')
  })

  it('CNES e CNEFE chegam à mesma chave (tipo diferente, mesmo nome)', () => {
    expect(chaveDaRua('RUA DOS APOSTOLOS')).toBe(chaveDaRua('Avenida dos Apóstolos'))
  })

  it('texto vazio ou nulo dá chave vazia', () => {
    expect(chaveDaRua('')).toBe('')
    expect(chaveDaRua(null)).toBe('')
  })
})

describe('número de porta', () => {
  it.each(['S/N', 's/n', 'SN', 'S.N.', 'sem número', '', '  ', '0', '-', null, undefined])(
    '"%s" é sem número',
    (n) => {
      expect(semNumeroDePorta(n)).toBe(true)
      expect(numeroDePorta(n)).toBeNull()
    },
  )

  it('pega só os dígitos da primeira sequência', () => {
    expect(numeroDePorta('123')).toBe(123)
    expect(numeroDePorta('123-A')).toBe(123)
    expect(numeroDePorta('KM 12')).toBe(12)
    expect(numeroDePorta('Lote')).toBeNull()
  })
})

describe('CEP e bairro', () => {
  it('CEP com ou sem máscara; inválido vira nulo', () => {
    expect(cepNormalizado('29010-935')).toBe('29010935')
    expect(cepNormalizado('29010935')).toBe('29010935')
    expect(cepNormalizado('2901')).toBeNull()
    expect(cepNormalizado(null)).toBeNull()
  })

  it('bairro sem acento, em maiúsculas e com espaços limpos', () => {
    expect(chaveDoBairro('  São   Francisco ')).toBe('SAO FRANCISCO')
  })
})

describe('faltasNoEndereco', () => {
  const completo = {
    logradouro: 'Rua A',
    numero: '10',
    bairro: 'Centro',
    municipioCodigo: 3205309,
  }

  it('endereço completo não tem falta', () => {
    expect(faltasNoEndereco(completo)).toEqual([])
  })

  it('"S/N" NÃO é falta; número em branco é', () => {
    expect(faltasNoEndereco({ ...completo, numero: 'S/N' })).toEqual([])
    expect(faltasNoEndereco({ ...completo, numero: '  ' })).toEqual(['numero'])
  })

  it('lista tudo o que falta, na ordem', () => {
    expect(faltasNoEndereco({})).toEqual(['logradouro', 'numero', 'bairro', 'cidade'])
    expect(faltasNoEndereco({ ...completo, bairro: null, municipioCodigo: null })).toEqual([
      'bairro',
      'cidade',
    ])
  })
})

describe('semelhanca e textoDoEndereco', () => {
  it('semelhança vai de 0 a 1', () => {
    expect(semelhanca('ABC', 'ABC')).toBe(1)
    expect(semelhanca('', 'ABC')).toBe(0)
    expect(semelhanca('JERONIMO MONTEIRO', 'JERONIMO MONTEIRO ')).toBeGreaterThan(0.9)
    expect(semelhanca('JERONIMO MONTEIRO', 'OUTRA RUA QUALQUER')).toBeLessThan(0.5)
  })

  it('monta o texto do endereço sem partes vazias', () => {
    expect(
      textoDoEndereco(
        {
          tipoLogradouro: 'Rua',
          logradouro: 'Sete',
          numero: '5',
          bairro: null,
          cep: '29010-935',
        },
        'Vitória',
      ),
    ).toBe('Rua Sete, 5, Vitória, 29010935')
  })
})
