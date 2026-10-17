import { criarConexao } from '@leadtogo/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { dono } from '../testes/mundo.js'
import { ProvedorCnefe } from './provedor-cnefe.js'

// Ruas e coordenadas FICTÍCIAS (município 3205309 só como chave): nada de endereço real.
const MUN = 3205309
const app = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 1 })
const cnefe = new ProvedorCnefe(app.db)

async function limpar() {
  await dono`DELETE FROM referencia_geo.cnefe_enderecos WHERE municipio_codigo = ${MUN}`
  await dono`DELETE FROM referencia_geo.cnefe_logradouros WHERE municipio_codigo = ${MUN}`
}

beforeAll(async () => {
  await limpar()
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf, localizacao)
    VALUES (${MUN}, 'VITORIA', 'ES', ST_SetSRID(ST_MakePoint(-40.3, -20.28), 4326))
    ON CONFLICT (codigo_ibge) DO UPDATE SET localizacao = excluded.localizacao`
  await dono`INSERT INTO referencia_geo.cnefe_logradouros
    (municipio_codigo, logradouro_normalizado, logradouro, enderecos, latitude_centro, longitude_centro)
    VALUES (${MUN}, 'FICTICIA DAS PALMEIRAS', 'RUA FICTICIA DAS PALMEIRAS', 4, -20.3, -40.3),
           (${MUN}, 'OUTRA INVENTADA', 'RUA OUTRA INVENTADA', 1, -20.31, -40.31)`
  await dono`INSERT INTO referencia_geo.cnefe_enderecos
    (municipio_codigo, cep, logradouro_normalizado, numero, latitude, longitude, nivel_coordenada, especie)
    VALUES (${MUN}, '29000111', 'FICTICIA DAS PALMEIRAS', 10, -20.3010, -40.3, 1, 1),
           (${MUN}, '29000111', 'FICTICIA DAS PALMEIRAS', 20, -20.3020, -40.3, 1, 1),
           (${MUN}, '29000111', 'FICTICIA DAS PALMEIRAS', 40, -20.3040, -40.3, 1, 1),
           (${MUN}, '29000111', 'FICTICIA DAS PALMEIRAS', null, -20.3050, -40.3, 5, 1),
           (${MUN}, '29000222', 'OUTRA INVENTADA', 5, -20.31, -40.31, 1, 1)`
})
afterAll(async () => {
  await limpar()
  await app.cliente.end()
})

describe('ProvedorCnefe', () => {
  it('sabe se o CNEFE está carregado', async () => {
    expect(await cnefe.carregado()).toBe(true)
  })

  it('acha a rua pelo nome normalizado (sem tipo, sem acento) e pelo nome parecido', async () => {
    expect(await cnefe.acharRua(MUN, 'Avenida Fictícia das Palmeiras')).toEqual({
      chave: 'FICTICIA DAS PALMEIRAS',
      exata: true,
    })
    // erro de digitação: o nome parecido do mesmo município
    expect(await cnefe.acharRua(MUN, 'Rua Ficticia das Palmeras')).toEqual({
      chave: 'FICTICIA DAS PALMEIRAS',
      exata: false,
    })
    expect(await cnefe.acharRua(MUN, 'Rua Totalmente Diferente')).toBeNull()
    // a mesma rua em outro município não vale
    expect(await cnefe.acharRua(3200000, 'Rua Fictícia das Palmeiras')).toBeNull()
  })

  it('decide o ponto: número exato, interpolado e centro da rua', async () => {
    const rua = { chave: 'FICTICIA DAS PALMEIRAS', exata: true }
    const exato = await cnefe.buscarNaRua(MUN, rua, 20, '29000111')
    expect(exato).toMatchObject({ nivel: 'numero', latitude: -20.302, ambiguo: false })
    const interpolado = await cnefe.buscarNaRua(MUN, rua, 30, null)
    expect(interpolado?.nivel).toBe('numero_interpolado')
    expect(interpolado?.latitude).toBeCloseTo(-20.303, 6)
    const semNumero = await cnefe.buscarNaRua(MUN, rua, null, null)
    expect(semNumero?.nivel).toBe('rua')
  })

  it('o centro do CEP e o centro do município', async () => {
    const cep = await cnefe.centroDoCep('29000-222')
    expect(cep).toEqual({ latitude: -20.31, longitude: -40.31 })
    expect(await cnefe.centroDoCep('99999999')).toBeNull()
    expect(await cnefe.centroDoCep('abc')).toBeNull()
    const mun = await cnefe.centroDoMunicipio(MUN)
    expect(mun?.latitude).toBeCloseTo(-20.28, 6)
    expect(await cnefe.centroDoMunicipio(1)).toBeNull()
  })

  it('o app só lê: escrever no CNEFE é negado', async () => {
    await expect(
      app.cliente`DELETE FROM referencia_geo.cnefe_enderecos WHERE municipio_codigo = ${MUN}`,
    ).rejects.toThrow(/permission denied/)
  })
})
