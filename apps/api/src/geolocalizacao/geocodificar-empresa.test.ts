import type { Server } from 'node:http'

import { criarConexao, novoId } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { dono, novoDono, type Dono } from '../testes/mundo.js'
import { geocodificarEmpresa, type ServicosDeGeo } from './geocodificar-empresa.js'
import type { DependenciasDaGeocodificacao } from './geocodificador.js'
import { ProvedorCep } from './provedor-cep.js'
import type { PontoCnefe } from '@leadtogo/shared'

// Endereços FICTÍCIOS: nenhum dado real de cliente.
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
let app: INestApplication<Server>
let d: Dono
let vendedorId: string

const noTenant = <T>(fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'Vitória', 'ES') ON CONFLICT DO NOTHING`
  app = await criarAppComRotas([], configuracaoDeTeste({}))
  d = await novoDono(app)
  vendedorId = (
    await noTenant(
      (tx) => tx<{ id: string }[]>`SELECT id FROM membros WHERE tenant_id = ${d.tenantId} LIMIT 1`,
    )
  )[0]?.id as string
})
afterAll(async () => {
  await app.close()
  await banco.cliente.end({ timeout: 5 })
  await valkey.quit()
  await dono.end()
})

async function novaEmpresa(endereco: Partial<Record<string, string | number | null>> = {}) {
  const id = novoId()
  const e = {
    cep: '29000000',
    tipo_logradouro: 'Rua',
    logradouro: 'Fictícia',
    numero: '120',
    bairro: 'Bairro Teste',
    municipio_codigo: 3205309,
    ...endereco,
  }
  await noTenant(
    (tx) => tx`
      INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id, cep, tipo_logradouro, logradouro, numero, bairro, municipio_codigo)
      VALUES (${id}, ${d.tenantId}, ${`Empresa ${id}`}, ${vendedorId}, ${e.cep as string | null}, ${e.tipo_logradouro as string | null}, ${e.logradouro as string | null}, ${e.numero as string | null}, ${e.bairro as string | null}, ${e.municipio_codigo as number | null})`,
  )
  return id
}

const ponto = (nivel: PontoCnefe['nivel'], ambiguo = false): PontoCnefe => ({
  nivel,
  latitude: -20.3,
  longitude: -40.3,
  detalhe: 'x',
  ambiguo,
})

function servicos(ponto_: PontoCnefe | null, cepDados: unknown = null): ServicosDeGeo {
  const dep: DependenciasDaGeocodificacao = {
    cnefe: {
      carregado: () => Promise.resolve(true),
      acharRua: () => Promise.resolve(ponto_ ? { chave: 'FICTICIA', exata: true } : null),
      buscarNaRua: () => Promise.resolve(ponto_),
      centroDoCep: () => Promise.resolve(null),
      centroDoMunicipio: () => Promise.resolve(null),
    },
    nominatim: null,
    cep: { consultar: () => Promise.resolve(cepDados as never) },
    cache: { obter: () => Promise.resolve(null) },
  }
  return {
    banco,
    nominatim: null,
    cep: new ProvedorCep('http://127.0.0.1:1', 'http://127.0.0.1:1', 500, 0),
    diasDeCache: 90,
    dependencias: () => dep,
  }
}

const pedido = (empresaId: string, extra = {}) => ({
  tenantId: d.tenantId,
  empresaId,
  acionadoPor: null,
  loteId: null,
  refazerComCoordenada: false,
  ...extra,
})

const lerGeo = (id: string) =>
  noTenant(
    (tx) => tx<
      {
        precisao: string | null
        aproximacao: string | null
        origem: string | null
        lat: number | null
        lon: number | null
        consultado: string | null
        tags: string[]
      }[]
    >`
      SELECT e.geo_precisao AS precisao, e.geo_aproximacao AS aproximacao, e.geo_origem AS origem,
             ST_Y(e.localizacao::geometry) AS lat, ST_X(e.localizacao::geometry) AS lon,
             e.geo_endereco_consultado AS consultado,
             coalesce((SELECT array_agg(t.chave_sistema) FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
                       WHERE et.empresa_id = e.id AND t.chave_sistema = 'endereco_a_confirmar'), '{}') AS tags
      FROM empresas e WHERE e.id = ${id}`,
  ).then((l) => l[0])

describe('geocodificarEmpresa', () => {
  it('posiciona: grava a coordenada, a precisão, a origem e o texto consultado', async () => {
    const id = await novaEmpresa()
    expect(await geocodificarEmpresa(servicos(ponto('numero')), pedido(id))).toBe('exata')
    expect(await lerGeo(id)).toMatchObject({
      precisao: 'exata',
      aproximacao: null,
      origem: 'cnefe',
      lat: -20.3,
      lon: -40.3,
      consultado: expect.stringMatching(
        /^Rua Fictícia, 120, Bairro Teste, vit[oó]ria, 29000000$/i,
      ) as string,
      tags: [],
    })
  })

  it('aproximada guarda o tipo da aproximação', async () => {
    const id = await novaEmpresa()
    expect(await geocodificarEmpresa(servicos(ponto('numero_interpolado')), pedido(id))).toBe(
      'aproximada',
    )
    expect(await lerGeo(id)).toMatchObject({ precisao: 'aproximada', aproximacao: 'interpolada' })
  })

  it('endereço incompleto: sem pin, tag "Endereço a confirmar" e consulta registrada', async () => {
    const id = await novaEmpresa({ numero: null })
    expect(await geocodificarEmpresa(servicos(ponto('numero')), pedido(id))).toBe('a_confirmar')
    expect(await lerGeo(id)).toMatchObject({
      precisao: null,
      lat: null,
      tags: ['endereco_a_confirmar'],
    })
  })

  it('a tag sai sozinha quando o endereço fica completo e geocodificado', async () => {
    const id = await novaEmpresa({ numero: null })
    await geocodificarEmpresa(servicos(ponto('numero')), pedido(id))
    await noTenant((tx) => tx`UPDATE empresas SET numero = '120' WHERE id = ${id}`)
    expect(await geocodificarEmpresa(servicos(ponto('numero')), pedido(id))).toBe('exata')
    expect(await lerGeo(id)).toMatchObject({ precisao: 'exata', tags: [] })
  })

  it('o histórico de tags registra a entrada e a saída (feitas pelo sistema)', async () => {
    const id = await novaEmpresa({ numero: null })
    await geocodificarEmpresa(servicos(ponto('numero')), pedido(id))
    await noTenant((tx) => tx`UPDATE empresas SET numero = '120' WHERE id = ${id}`)
    await geocodificarEmpresa(servicos(ponto('numero')), pedido(id))
    const h = await noTenant(
      (tx) => tx<{ acao: string; por: string | null }[]>`
        SELECT h.acao, h.por FROM empresa_tags_historico h JOIN tags t ON t.id = h.tag_id
        WHERE h.empresa_id = ${id} AND t.chave_sistema = 'endereco_a_confirmar' ORDER BY h.em`,
    )
    expect(h).toEqual([
      { acao: 'adicionada', por: null },
      { acao: 'removida', por: null },
    ])
  })

  it('ajuste manual é preservado: nunca é sobrescrito', async () => {
    const id = await novaEmpresa()
    await noTenant(
      (
        tx,
      ) => tx`UPDATE empresas SET geo_ajuste_manual = true, geo_precisao = 'exata', geo_origem = 'manual',
        localizacao = ST_SetSRID(ST_MakePoint(-40.5, -20.5), 4326)::geography WHERE id = ${id}`,
    )
    expect(
      await geocodificarEmpresa(
        servicos(ponto('numero')),
        pedido(id, { refazerComCoordenada: true }),
      ),
    ).toBe('preservada')
    expect(await lerGeo(id)).toMatchObject({ origem: 'manual', lat: -20.5, lon: -40.5 })
  })

  it('já tem coordenada: não refaz, a não ser que peçam', async () => {
    const id = await novaEmpresa()
    await geocodificarEmpresa(servicos(ponto('numero')), pedido(id))
    const outro = { ...ponto('numero'), latitude: -20.4 }
    expect(await geocodificarEmpresa(servicos(outro), pedido(id))).toBe('ja_tinha')
    expect((await lerGeo(id))?.lat).toBe(-20.3)
    expect(
      await geocodificarEmpresa(servicos(outro), pedido(id, { refazerComCoordenada: true })),
    ).toBe('exata')
    expect((await lerGeo(id))?.lat).toBe(-20.4)
  })

  it('empresa excluída ou no exterior: ignorada', async () => {
    const excluida = await novaEmpresa()
    await noTenant((tx) => tx`UPDATE empresas SET excluido_em = now() WHERE id = ${excluida}`)
    expect(await geocodificarEmpresa(servicos(ponto('numero')), pedido(excluida))).toBe('ignorada')
    const fora = await novaEmpresa()
    await dono`INSERT INTO paises (codigo, nome) VALUES (999, 'País de teste') ON CONFLICT DO NOTHING`
    await noTenant((tx) => tx`UPDATE empresas SET pais_codigo = 999 WHERE id = ${fora}`)
    expect(await geocodificarEmpresa(servicos(ponto('numero')), pedido(fora))).toBe('ignorada')
    await noTenant((tx) => tx`UPDATE empresas SET pais_codigo = NULL WHERE id = ${fora}`)
    await dono`DELETE FROM paises WHERE codigo = 999`
    expect(await geocodificarEmpresa(servicos(ponto('numero')), pedido(novoId()))).toBe('ignorada')
  })

  it('o endereço mudou durante a consulta: o resultado velho não é gravado', async () => {
    const id = await novaEmpresa()
    const svc = servicos(ponto('numero'))
    const dep = svc.dependencias?.(d.tenantId)
    if (!dep) throw new Error('dependências')
    svc.dependencias = () => ({
      ...dep,
      cnefe: {
        ...dep.cnefe,
        buscarNaRua: async (...args) => {
          // outra pessoa troca o número enquanto a consulta roda
          await noTenant((tx) => tx`UPDATE empresas SET numero = '999' WHERE id = ${id}`)
          return dep.cnefe.buscarNaRua(...args)
        },
      },
    })
    expect(await geocodificarEmpresa(svc, pedido(id))).toBe('ignorada')
    expect(await lerGeo(id)).toMatchObject({ precisao: null, lat: null })
  })

  it('registra cada consulta (provedor, texto, resultado) sem repetir as do cache', async () => {
    const id = await novaEmpresa()
    await geocodificarEmpresa(servicos(ponto('numero')), pedido(id, { acionadoPor: vendedorId }))
    const c = await noTenant(
      (tx) => tx<
        { provedor: string; resultado: string; precisao: string | null; por: string | null }[]
      >`
        SELECT provedor, resultado, precisao, acionado_por AS por FROM geo_consultas WHERE empresa_id = ${id}`,
    )
    expect(c).toEqual([
      { provedor: 'cnefe', resultado: 'achou', precisao: 'exata', por: vendedorId },
    ])
  })

  it('provedores fora do ar: indisponível, sem marcar a empresa', async () => {
    const id = await novaEmpresa({ bairro: null })
    const svc = servicos(ponto('numero'))
    const dep = svc.dependencias?.(d.tenantId)
    if (!dep) throw new Error('dependências')
    svc.dependencias = () => ({
      ...dep,
      cep: {
        consultar: () => {
          const e = new Error('sem conexão')
          e.name = 'CepIndisponivel'
          return Promise.reject(e)
        },
      },
    })
    expect(await geocodificarEmpresa(svc, pedido(id))).toBe('indisponivel')
    expect(await lerGeo(id)).toMatchObject({ precisao: null, tags: [] })
  })

  it('o cache guarda e devolve a consulta de CEP do tenant', async () => {
    const { obterDoCache, registrarConsultas } = await import('./consultas-geo.js')
    const resposta = { logradouro: 'Rua do CEP', bairro: 'Bairro', cidade: 'Vitória' }
    await banco.db.transaction(async (tx) => {
      const { sql } = await import('@leadtogo/db')
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`)
      await registrarConsultas(
        tx,
        { tenantId: d.tenantId, empresaId: null, loteId: null, acionadoPor: null },
        [
          {
            provedor: 'cep',
            consulta: '29111222',
            resultado: 'achou',
            precisao: null,
            aproximacao: null,
            latitude: null,
            longitude: null,
            resposta,
            doCache: false,
          },
          {
            provedor: 'cep',
            consulta: '29111333',
            resultado: 'erro',
            precisao: null,
            aproximacao: null,
            latitude: null,
            longitude: null,
            resposta: { erro: 'sem conexão' },
            doCache: false,
          },
        ],
      )
      expect(await obterDoCache(tx, 'cep', '29111222', 90)).toMatchObject({
        resultado: 'achou',
        resposta,
      })
      expect(await obterDoCache(tx, 'cep', '29111222', 0)).toBeNull()
      // erro de rede nunca vale como cache
      expect(await obterDoCache(tx, 'cep', '29111333', 90)).toBeNull()
    })
  })
})
