import { afterAll, describe, expect, it } from 'vitest'

import { conectarApp, conectarOwner } from './conexoes.js'

const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

describe('geolocalização (migração 0026)', () => {
  it('empresas ganhou a posição, a precisão, a origem e o ajuste manual', async () => {
    const colunas = await owner<{ coluna: string; tipo: string }[]>`
      SELECT column_name AS coluna, udt_name AS tipo FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name LIKE 'geo\_%' OR
            (table_schema = 'public' AND table_name = 'empresas' AND column_name = 'localizacao')`
    const porNome = Object.fromEntries(colunas.map((c) => [c.coluna, c.tipo]))
    expect(porNome).toEqual({
      localizacao: 'geography',
      geo_precisao: 'geo_precisao',
      geo_aproximacao: 'geo_aproximacao',
      geo_origem: 'geo_origem',
      geo_endereco_consultado: 'text',
      geo_ajuste_manual: 'bool',
      geo_atualizado_em: 'timestamptz',
    })
  })

  it('a origem aceita as cinco fontes previstas e a precisão só exata ou aproximada', async () => {
    const [origem] = await owner<{ valores: string[] }[]>`
      SELECT array_agg(enumlabel::text ORDER BY enumsortorder) AS valores
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'geo_origem'`
    expect(origem?.valores).toEqual(['cnefe', 'nominatim', 'cep', 'manual', 'checkin'])
    const [precisao] = await owner<{ valores: string[] }[]>`
      SELECT array_agg(enumlabel::text ORDER BY enumsortorder) AS valores
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'geo_precisao'`
    expect(precisao?.valores).toEqual(['exata', 'aproximada'])
  })

  it('as tags ganharam as flags do mapa, ligadas por padrão', async () => {
    const colunas = await owner<{ coluna: string; padrao: string }[]>`
      SELECT column_name AS coluna, column_default AS padrao FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tags'
        AND column_name IN ('aparece_no_mapa', 'visivel_ao_abrir')`
    expect(colunas.map((c) => [c.coluna, c.padrao]).sort()).toEqual([
      ['aparece_no_mapa', 'true'],
      ['visivel_ao_abrir', 'true'],
    ])
  })

  it('o schema referencia_geo existe e o app só lê o CNEFE (nada de escrita)', async () => {
    await owner`INSERT INTO referencia_geo.cnefe_logradouros
      (municipio_codigo, logradouro_normalizado, logradouro, enderecos, latitude_centro, longitude_centro)
      VALUES (3205309, 'TESTE GEO', 'RUA TESTE GEO', 1, -20.3, -40.3)`
    try {
      expect(
        await app`SELECT 1 FROM referencia_geo.cnefe_logradouros WHERE logradouro_normalizado = 'TESTE GEO'`,
      ).toHaveLength(1)
      await expect(app`DELETE FROM referencia_geo.cnefe_logradouros`).rejects.toThrow(
        /permission denied/,
      )
      await expect(
        app`INSERT INTO referencia_geo.cnefe_enderecos (municipio_codigo, logradouro_normalizado, latitude, longitude, nivel_coordenada, especie)
          VALUES (3205309, 'X', 0, 0, 1, 1)`,
      ).rejects.toThrow(/permission denied/)
    } finally {
      await owner`DELETE FROM referencia_geo.cnefe_logradouros WHERE logradouro_normalizado = 'TESTE GEO'`
    }
  })

  it('o CNEFE tem índice de busca aproximada (pg_trgm) na rua normalizada', async () => {
    const [indice] = await owner<{ def: string }[]>`
      SELECT indexdef AS def FROM pg_indexes
      WHERE schemaname = 'referencia_geo' AND indexname = 'cnefe_logradouros_trgm_idx'`
    expect(indice?.def).toMatch(/USING gin .*gin_trgm_ops/)
  })

  it('as microrregiões são só leitura para o app', async () => {
    await expect(app`DELETE FROM microrregioes`).rejects.toThrow(/permission denied/)
  })

  it('a legenda do mapa tem uma linha por estado e tenant', async () => {
    const indice = await owner<{ def: string }[]>`
      SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'mapa_legenda_chave_uq'`
    expect(indice[0]?.def).toMatch(/UNIQUE .*\(tenant_id, chave\)/)
  })
})
