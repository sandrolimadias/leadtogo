import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { semearReferencias } from '../seeds/index.js'
import { conectarApp, conectarDrizzleOwner, esvaziarReferencias } from './conexoes.js'

const { db, cliente: owner } = conectarDrizzleOwner()
const app = conectarApp()

const TABELAS = [
  'municipios',
  'microrregioes',
  'cnaes',
  'qualificacoes_socio',
  'portes',
  'paises',
  'estados',
]
async function limpar() {
  await esvaziarReferencias(owner)
}
async function contar(): Promise<Record<string, number>> {
  const total: Record<string, number> = {}
  for (const t of TABELAS) {
    const [r] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM ${owner(t)}`
    total[t] = r?.n ?? 0
  }
  return total
}

beforeAll(limpar)
afterAll(async () => {
  await limpar() // deixa as referências vazias para os outros testes
  await owner.end()
  await app.end()
})

describe('seed das referências', () => {
  it('carrega estados, municípios, microrregiões, países, portes, qualificações e CNAEs', async () => {
    const lidos = await semearReferencias(db)
    expect(lidos).toEqual({
      municipios: 5571,
      microrregioes: 558,
      cnaes: 1332,
      estados: 27,
      paises: 255,
      portes: 4,
      qualificacoes_socio: 79,
    })
    expect(await contar()).toEqual({
      municipios: 5571,
      microrregioes: 558,
      cnaes: 1332,
      estados: 27,
      paises: 255,
      portes: 4,
      qualificacoes_socio: 79,
    })
  })

  it('os municípios trazem a microrregião e o centro (Vitória e Serra, na Grande Vitória)', async () => {
    await semearReferencias(db)
    const linhas = await owner<
      { codigo_ibge: number; microrregiao_codigo: number; x: number; y: number }[]
    >`SELECT codigo_ibge, microrregiao_codigo, ST_X(localizacao) AS x, ST_Y(localizacao) AS y
      FROM municipios WHERE codigo_ibge IN (3205309, 3205002) ORDER BY codigo_ibge`
    expect(linhas.map((l) => l.microrregiao_codigo)).toEqual([32009, 32009])
    for (const l of linhas) {
      expect(l.x).toBeGreaterThan(-40.5)
      expect(l.x).toBeLessThan(-40.2)
      expect(l.y).toBeGreaterThan(-20.4)
      expect(l.y).toBeLessThan(-20.0)
    }
    const [es] = await owner<{ n: number }[]>`
      SELECT count(*)::int AS n FROM microrregioes WHERE uf = 'ES'`
    expect(es?.n).toBe(13)
  })

  it('rodar de novo não duplica nada (idempotente)', async () => {
    await semearReferencias(db)
    await semearReferencias(db)
    expect(await contar()).toEqual({
      municipios: 5571,
      microrregioes: 558,
      cnaes: 1332,
      estados: 27,
      paises: 255,
      portes: 4,
      qualificacoes_socio: 79,
    })
  })

  it('rodar de novo sem mudança não reescreve nenhuma linha (barato a cada start da API)', async () => {
    await semearReferencias(db)
    const versoes = async () =>
      (await owner<{ v: string }[]>`SELECT xmin::text AS v FROM cnaes ORDER BY codigo`).map(
        (r) => r.v,
      )
    const antes = await versoes()
    await semearReferencias(db)
    expect(await versoes()).toEqual(antes)
  })

  it('rodar de novo corrige o que foi alterado', async () => {
    await owner`UPDATE estados SET nome = 'Errado', regiao = 'Errada' WHERE uf = 'ES'`
    await owner`UPDATE qualificacoes_socio SET descricao = 'Errada' WHERE codigo = 49`
    await semearReferencias(db)
    const [es] = await owner`SELECT nome, regiao FROM estados WHERE uf = 'ES'`
    expect(es).toEqual({ nome: 'Espírito Santo', regiao: 'Sudeste' })
    const [q] = await owner`SELECT descricao FROM qualificacoes_socio WHERE codigo = 49`
    expect(q?.['descricao']).toBe('Sócio-Administrador')
  })

  it('traz os valores conhecidos do modelo (portes, Brasil, 27 UFs)', async () => {
    const portes = await owner`SELECT codigo, descricao FROM portes ORDER BY codigo`
    expect(portes).toEqual([
      { codigo: 0, descricao: 'Não informado' },
      { codigo: 1, descricao: 'Micro Empresa' },
      { codigo: 3, descricao: 'Empresa de Pequeno Porte' },
      { codigo: 5, descricao: 'Demais' },
    ])
    const [br] = await owner`SELECT nome FROM paises WHERE codigo = 105`
    expect(br?.['nome']).toBe('BRASIL')
    const regioes = await owner<
      { regiao: string }[]
    >`SELECT DISTINCT regiao FROM estados ORDER BY 1`
    expect(regioes.map((r) => r.regiao)).toEqual([
      'Centro-Oeste',
      'Nordeste',
      'Norte',
      'Sudeste',
      'Sul',
    ])
  })

  it('carrega os CNAEs com a hierarquia oficial e sem duplicados', async () => {
    const [sw] = await owner`SELECT * FROM cnaes WHERE codigo = 6201501`
    expect(sw).toMatchObject({
      descricao: 'DESENVOLVIMENTO DE PROGRAMAS DE COMPUTADOR SOB ENCOMENDA',
      secao: 'J',
      divisao: '62',
      grupo: '620',
      classe: '62015',
    })
    // começa com zero: guardado como inteiro (111301 = 0111301)
    const [arroz] = await owner`SELECT descricao, secao FROM cnaes WHERE codigo = 111301`
    expect(arroz).toEqual({ descricao: 'CULTIVO DE ARROZ', secao: 'A' })
    const [r] = await owner<{ n: number; distintos: number; secoes: number }[]>`
      SELECT count(*)::int AS n, count(DISTINCT codigo)::int AS distintos, count(DISTINCT secao)::int AS secoes FROM cnaes`
    expect(r).toEqual({ n: 1332, distintos: 1332, secoes: 21 })
    const incoerentes = await owner`
      SELECT codigo FROM cnaes
      WHERE lpad(codigo::text, 7, '0') NOT LIKE classe || '%' OR classe NOT LIKE grupo || '%' OR grupo NOT LIKE divisao || '%'`
    expect(incoerentes).toHaveLength(0)
  })

  it('carrega os 5.571 municípios com o código IBGE e o SIAFI/TOM da Receita, sem nenhum faltando', async () => {
    const [r] = await owner<
      { n: number; sem_siafi: number; siafi_distintos: number; ufs: number }[]
    >`
      SELECT count(*)::int AS n, count(*) FILTER (WHERE codigo_siafi IS NULL)::int AS sem_siafi,
             count(DISTINCT codigo_siafi)::int AS siafi_distintos, count(DISTINCT uf)::int AS ufs FROM municipios`
    expect(r).toEqual({ n: 5571, sem_siafi: 0, siafi_distintos: 5571, ufs: 27 })
    // exemplos: o do modelo (Serra, IBGE 3205002 e SIAFI 5699), capital e DF
    const casos = await owner`
      SELECT codigo_ibge, codigo_siafi, nome, uf FROM municipios
      WHERE codigo_ibge IN (3205002, 3550308, 5300108) ORDER BY codigo_ibge`
    expect(casos).toEqual([
      { codigo_ibge: 3205002, codigo_siafi: 5699, nome: 'Serra', uf: 'ES' },
      { codigo_ibge: 3550308, codigo_siafi: 7107, nome: 'São Paulo', uf: 'SP' },
      { codigo_ibge: 5300108, codigo_siafi: 9701, nome: 'Brasília', uf: 'DF' },
    ])
  })

  it('o município novo (correção manual) tem o código da Receita', async () => {
    const [m] =
      await owner`SELECT codigo_siafi, nome, uf FROM municipios WHERE codigo_ibge = 5101837`
    expect(m).toEqual({ codigo_siafi: 1182, nome: 'Boa Esperança do Norte', uf: 'MT' })
  })

  it("a busca de município ignora acento, caixa e apóstrofo (D'Oeste = do Oeste)", async () => {
    const achados = await owner<{ codigo_ibge: number }[]>`
      SELECT codigo_ibge FROM municipios
      WHERE replace(f_unaccent(nome), '''', ' ') ILIKE ${'%floresta d oeste%'} AND uf = 'RO'`
    expect(achados.map((a) => a.codigo_ibge)).toEqual([1100015])
  })

  it('rodar de novo corrige um SIAFI alterado, sem duplicar', async () => {
    await owner`UPDATE municipios SET codigo_siafi = 99999, nome = 'Errado' WHERE codigo_ibge = 3205002`
    await semearReferencias(db)
    const [m] = await owner`SELECT codigo_siafi, nome FROM municipios WHERE codigo_ibge = 3205002`
    expect(m).toEqual({ codigo_siafi: 5699, nome: 'Serra' })
    const [total] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM municipios`
    expect(total?.n).toBe(5571)
  })

  it('a busca por descrição sem acento encontra o CNAE (índice trigram)', async () => {
    const achados = await owner<{ codigo: number }[]>`
      SELECT codigo FROM cnaes WHERE f_unaccent(descricao) ILIKE f_unaccent('%programas de computador%') ORDER BY codigo`
    expect(achados.map((a) => a.codigo)).toContain(6201501)
  })

  it('carrega os países da Receita, com o código numérico dela e sem duplicados', async () => {
    const [r] = await owner<{ n: number; distintos: number; minimo: number; maximo: number }[]>`
      SELECT count(*)::int AS n, count(DISTINCT codigo)::int AS distintos, min(codigo)::int AS minimo, max(codigo)::int AS maximo
      FROM paises`
    expect(r).toEqual({ n: 255, distintos: 255, minimo: 0, maximo: 999 })
    // exemplos da tabela: o Brasil, um país e códigos especiais que aparecem em sócios estrangeiros
    const casos =
      await owner`SELECT codigo, nome FROM paises WHERE codigo IN (13, 105, 249, 997, 999) ORDER BY codigo`
    expect(casos).toEqual([
      { codigo: 13, nome: 'AFEGANISTAO' },
      { codigo: 105, nome: 'BRASIL' },
      { codigo: 249, nome: 'ESTADOS UNIDOS' },
      { codigo: 997, nome: 'NAO DECLARADOS' },
      { codigo: 999, nome: 'NAO DECLARADOS' },
    ])
  })

  it('os países usam o código da Receita (smallint), não o ISO de 2 letras', async () => {
    const [c] = await owner<{ tipo: string }[]>`
      SELECT format_type(atttypid, atttypmod) AS tipo FROM pg_attribute
      WHERE attrelid = 'paises'::regclass AND attname = 'codigo'`
    expect(c?.tipo).toBe('smallint')
    const [t] = await owner<{ tipo: string; padrao: string }[]>`
      SELECT format_type(a.atttypid, a.atttypmod) AS tipo, pg_get_expr(d.adbin, d.adrelid) AS padrao
      FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'tenants'::regclass AND a.attname = 'pais_codigo'`
    expect(t).toEqual({ tipo: 'smallint', padrao: '105' })
  })

  it('o app lê os dados carregados', async () => {
    expect(await app`SELECT 1 FROM estados`).toHaveLength(27)
  })
})
