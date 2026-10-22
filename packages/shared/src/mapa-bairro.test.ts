import { describe, expect, it } from 'vitest'

import { chaveDoBairroNoMapa, rotuloDoBairro } from './mapa-bairro.js'

describe('chaveDoBairroNoMapa', () => {
  it('acentos, maiúsculas, pontuação e espaços não separam o mesmo bairro', () => {
    const iguais = [
      'Jardim Camburi',
      'JARDIM CAMBURÍ',
      '  jardim   camburi ',
      'Jardim-Camburi.',
      'Jardim Camburí,',
    ]
    for (const t of iguais) expect(chaveDoBairroNoMapa(t)).toBe('JARDIM CAMBURI')
  })

  it('abreviações viram a palavra inteira: Jd. = Jardim, Vl. = Vila, Sta. = Santa...', () => {
    expect(chaveDoBairroNoMapa('Jd. Camburi')).toBe('JARDIM CAMBURI')
    expect(chaveDoBairroNoMapa('JD CAMBURI')).toBe(chaveDoBairroNoMapa('Jardim Camburi'))
    expect(chaveDoBairroNoMapa('Vl. Velha')).toBe('VILA VELHA')
    expect(chaveDoBairroNoMapa('Sta. Lúcia')).toBe('SANTA LUCIA')
    expect(chaveDoBairroNoMapa('Sto Antônio')).toBe('SANTO ANTONIO')
    expect(chaveDoBairroNoMapa('Pq. Industrial')).toBe('PARQUE INDUSTRIAL')
    expect(chaveDoBairroNoMapa('Res. Boa Vista')).toBe('RESIDENCIAL BOA VISTA')
  })

  it('só expande a palavra inteira (não mexe no meio de outra palavra)', () => {
    expect(chaveDoBairroNoMapa('Centro')).toBe('CENTRO')
    expect(chaveDoBairroNoMapa('Jardim da Penha')).toBe('JARDIM DA PENHA')
    expect(chaveDoBairroNoMapa('Vilarinho')).toBe('VILARINHO')
  })

  it('o prefixo "Bairro" não cria outro bairro', () => {
    expect(chaveDoBairroNoMapa('Bairro Santa Lúcia')).toBe(chaveDoBairroNoMapa('Santa Lucia'))
    expect(chaveDoBairroNoMapa('Bairro')).toBe('BAIRRO')
  })

  it('vazio, nulo e "não informado" são "sem bairro" (chave vazia)', () => {
    for (const t of [
      null,
      undefined,
      '',
      '   ',
      '-',
      'S/B',
      'sem bairro',
      'Não informado',
      'N/I',
    ]) {
      expect(chaveDoBairroNoMapa(t)).toBe('')
    }
  })
})

describe('rotuloDoBairro', () => {
  it('caixa de título, com "de/da/do" em minúscula', () => {
    expect(rotuloDoBairro('JARDIM CAMBURI')).toBe('Jardim Camburi')
    expect(rotuloDoBairro('JARDIM DA PENHA')).toBe('Jardim da Penha')
    expect(rotuloDoBairro('SANTO ANTONIO DOS PINHAIS')).toBe('Santo Antonio dos Pinhais')
  })

  it('a chave vazia é "Sem bairro"', () => {
    expect(rotuloDoBairro('')).toBe('Sem bairro')
  })
})
