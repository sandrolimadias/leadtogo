import { afterAll, describe, expect, it } from 'vitest'

import { conectarApp, conectarOwner } from './conexoes.js'

const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

const GLOBAIS_SO_LEITURA = [
  'cnaes',
  'municipios',
  'estados',
  'paises',
  'portes',
  'qualificacoes_socio',
]

describe('tabelas de referência', () => {
  it('existem e não têm tenant_id nem RLS (são compartilhadas)', async () => {
    const tabelas = [...GLOBAIS_SO_LEITURA, 'receita_consultas']
    const colunas = await owner<{ tabela: string; coluna: string }[]>`
      SELECT table_name AS tabela, column_name AS coluna FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY(${tabelas})`
    expect(new Set(colunas.map((c) => c.tabela))).toEqual(new Set(tabelas))
    expect(colunas.filter((c) => c.coluna === 'tenant_id')).toEqual([])
    const rls =
      await owner`SELECT 1 FROM pg_class WHERE relname = ANY(${tabelas}) AND relrowsecurity`
    expect(rls).toHaveLength(0)
  })

  it.each(GLOBAIS_SO_LEITURA)('%s: o app lê, mas não escreve', async (tabela) => {
    expect(await app`SELECT * FROM ${app(tabela)}`).toHaveLength(0)
    await expect(app`DELETE FROM ${app(tabela)}`).rejects.toThrow(/permission denied/)
    await expect(app`UPDATE ${app(tabela)} SET codigo = codigo`).rejects.toThrow(
      /permission denied|does not exist/,
    )
    await expect(app`INSERT INTO ${app(tabela)} DEFAULT VALUES`).rejects.toThrow(
      /permission denied/,
    )
  })

  it('receita_consultas: o app grava e atualiza o cache, mas não apaga', async () => {
    const cnpj = '12ABC34500DE99'
    await app`INSERT INTO receita_consultas (cnpj, dados, fonte) VALUES (${cnpj}, ${app.json({ razao_social: 'X' })}, 'minhareceita')`
    await app`UPDATE receita_consultas SET fonte = 'brasilapi' WHERE cnpj = ${cnpj}`
    await expect(app`DELETE FROM receita_consultas WHERE cnpj = ${cnpj}`).rejects.toThrow(
      /permission denied/,
    )
    await owner`DELETE FROM receita_consultas WHERE cnpj = ${cnpj}`
  })

  it('o owner escreve; o código IBGE é a chave e o SIAFI é único', async () => {
    await owner`INSERT INTO estados (uf, nome, regiao) VALUES ('ZZ', 'Estado de teste', 'Teste')`
    try {
      await owner`INSERT INTO municipios (codigo_ibge, codigo_siafi, nome, uf) VALUES (9000001, 9001, 'Cidade Um', 'ZZ')`
      await expect(
        owner`INSERT INTO municipios (codigo_ibge, codigo_siafi, nome, uf) VALUES (9000002, 9001, 'Cidade Dois', 'ZZ')`,
      ).rejects.toThrow(/duplicate key/)
      await expect(
        owner`INSERT INTO municipios (codigo_ibge, codigo_siafi, nome, uf) VALUES (9000003, 9003, 'Sem Estado', 'YY')`,
      ).rejects.toThrow(/foreign key/)
    } finally {
      await owner`DELETE FROM municipios WHERE codigo_ibge >= 9000000`
      await owner`DELETE FROM estados WHERE uf = 'ZZ'`
    }
  })

  it('a localização é geometry(Point, 4326)', async () => {
    const [c] = await owner<{ tipo: string }[]>`
      SELECT format_type(atttypid, atttypmod) AS tipo FROM pg_attribute
      WHERE attrelid = 'municipios'::regclass AND attname = 'localizacao'`
    expect(c?.tipo).toBe('geometry(Point,4326)')
  })

  it('a busca sem acento usa f_unaccent (imutável) e índices trigram', async () => {
    const [r] = await app<{ v: string }[]>`SELECT f_unaccent('São João D''Oeste') AS v`
    expect(r?.v).toBe("Sao Joao D'Oeste")
    const indices = await owner<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
        AND indexname IN ('municipios_nome_trgm_idx', 'cnaes_descricao_trgm_idx', 'municipios_localizacao_idx', 'municipios_uf_idx')`
    expect(indices).toHaveLength(4)
  })
})
