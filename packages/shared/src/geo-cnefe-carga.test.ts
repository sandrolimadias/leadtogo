import { describe, expect, it } from 'vitest'

import { converterLinhaDoCnefe, dividirLinhaDoCsv } from './geo-cnefe-carga.js'

describe('converterLinhaDoCnefe', () => {
  const base = {
    COD_MUNICIPIO: '3205309',
    CEP: '29010935',
    DSC_LOCALIDADE: 'CENTRO',
    NOM_TIPO_SEGLOGR: 'AVENIDA',
    NOM_TITULO_SEGLOGR: 'DOUTOR',
    NOM_SEGLOGR: 'FULANO FICTICIO',
    NUM_ENDERECO: '1000',
    DSC_MODIFICADOR: '',
    LATITUDE: '-20.318642',
    LONGITUDE: '-40.3300531',
    COD_ESPECIE: '1',
    NV_GEO_COORD: '1',
  }

  it('converte e normaliza a rua (a mesma chave da consulta)', () => {
    expect(converterLinhaDoCnefe(base)).toEqual({
      municipioCodigo: 3205309,
      cep: '29010935',
      localidade: 'CENTRO',
      logradouroNormalizado: 'DOUTOR FULANO FICTICIO',
      logradouroOriginal: 'AVENIDA DOUTOR FULANO FICTICIO',
      numero: 1000,
      modificador: null,
      latitude: -20.318642,
      longitude: -40.3300531,
      nivelCoordenada: 1,
      especie: 1,
    })
  })

  it('número zero ou vazio é S/N (nulo); sem coordenada ou município a linha é descartada', () => {
    expect(converterLinhaDoCnefe({ ...base, NUM_ENDERECO: '0' })?.numero).toBeNull()
    expect(converterLinhaDoCnefe({ ...base, NUM_ENDERECO: '' })?.numero).toBeNull()
    expect(converterLinhaDoCnefe({ ...base, LATITUDE: '' })).toBeNull()
    expect(converterLinhaDoCnefe({ ...base, LONGITUDE: 'x' })).toBeNull()
    expect(converterLinhaDoCnefe({ ...base, COD_MUNICIPIO: '' })).toBeNull()
  })

  it('aceita vírgula decimal e CEP inválido vira nulo', () => {
    const r = converterLinhaDoCnefe({ ...base, LATITUDE: '-20,5', CEP: '123' })
    expect(r?.latitude).toBe(-20.5)
    expect(r?.cep).toBeNull()
  })
})

describe('dividirLinhaDoCsv', () => {
  it('divide por ponto e vírgula, com aspas e aspas duplas', () => {
    expect(dividirLinhaDoCsv('a;"b;c";"d ""e""";;f')).toEqual(['a', 'b;c', 'd "e"', '', 'f'])
  })
})
