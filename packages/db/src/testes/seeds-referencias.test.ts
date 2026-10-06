import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { semearReferencias } from '../seeds/index.js'
import { conectarApp, conectarDrizzleOwner } from './conexoes.js'

const { db, cliente: owner } = conectarDrizzleOwner()
const app = conectarApp()

const TABELAS = ['cnaes', 'qualificacoes_socio', 'portes', 'paises', 'estados']
async function limpar() {
  for (const t of TABELAS) await owner`DELETE FROM ${owner(t)}`
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

describe('seed das referências pequenas', () => {
  it('carrega estados, países, portes e qualificações', async () => {
    const lidos = await semearReferencias(db)
    expect(lidos).toEqual({
      cnaes: 1332,
      estados: 27,
      paises: 193,
      portes: 4,
      qualificacoes_socio: 79,
    })
    expect(await contar()).toEqual({
      cnaes: 1332,
      estados: 27,
      paises: 193,
      portes: 4,
      qualificacoes_socio: 79,
    })
  })

  it('rodar de novo não duplica nada (idempotente)', async () => {
    await semearReferencias(db)
    await semearReferencias(db)
    expect(await contar()).toEqual({
      cnaes: 1332,
      estados: 27,
      paises: 193,
      portes: 4,
      qualificacoes_socio: 79,
    })
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
    const [br] = await owner`SELECT nome FROM paises WHERE codigo = 'BR'`
    expect(br?.['nome']).toBe('Brasil')
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

  it('a busca por descrição sem acento encontra o CNAE (índice trigram)', async () => {
    const achados = await owner<{ codigo: number }[]>`
      SELECT codigo FROM cnaes WHERE f_unaccent(descricao) ILIKE f_unaccent('%programas de computador%') ORDER BY codigo`
    expect(achados.map((a) => a.codigo)).toContain(6201501)
  })

  it('o app lê os dados carregados', async () => {
    expect(await app`SELECT 1 FROM estados`).toHaveLength(27)
  })
})
