import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import type {
  EmpresaCarteira,
  ListaDaFila,
  ListaDeLotesGeo,
  LoteGeo,
  PosicaoDaEmpresa,
  PreviaDoLote,
  RegiaoGeo,
  ResumoDaGeolocalizacao,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular, type Dono } from '../testes/mundo.js'
import { ExecutorDoLoteGeo } from './executor-lote.js'
import type { ServicosDeGeo } from './geocodificar-empresa.js'
import type { DependenciasDaGeocodificacao } from './geocodificador.js'
import { ProvedorCep } from './provedor-cep.js'

// Endereços, cidades e coordenadas FICTÍCIOS: nenhum dado real de cliente.
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
afterAll(async () => {
  // os municípios ficam (outros testes os usam e há empresas apontando para eles)
  await dono`UPDATE municipios SET microrregiao_codigo = NULL WHERE codigo_ibge IN (3205309, 3205002)`
  await dono`DELETE FROM microrregioes WHERE codigo = 32009`
  await banco.cliente.end({ timeout: 5 })
  await valkey.quit()
  await dono.end()
})

beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO microrregioes (codigo, nome, uf) VALUES (32009, 'Vitória', 'ES') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf, microrregiao_codigo) VALUES
    (3205309, 'Vitória', 'ES', 32009), (3205002, 'Serra', 'ES', 32009)
    ON CONFLICT (codigo_ibge) DO UPDATE SET microrregiao_codigo = 32009`
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url.startsWith('/v1') ? url : `/v1/geolocalizacao${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.9.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
/** Sem acento e em minúsculas (os municípios de teste podem vir de outro arquivo com outra grafia). */
const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

async function cenario() {
  const d = await novoDono(app)
  const gestor = await usuarioSimples(app)
  await vincular(d.tenantId, gestor.id, 'gestor')
  await ativar(gestor.id, d.tenantId)
  const vendedor = await usuarioSimples(app)
  await vincular(d.tenantId, vendedor.id, 'vendedor')
  await ativar(vendedor.id, d.tenantId)
  const membroDe = async (usuarioId: string) =>
    (
      await noTenant(
        d.tenantId,
        (tx) => tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${usuarioId}`,
      )
    )[0]?.id as string
  return { d, gestor, vendedor, vendedorId: await membroDe(vendedor.id) }
}

async function criarEmpresa(
  cookie: string,
  nome: string,
  endereco: Record<string, unknown> = {
    cep: '29000000',
    tipoLogradouro: 'Rua',
    logradouro: 'Fictícia',
    numero: '120',
    bairro: 'Bairro Teste',
    municipioCodigo: 3205309,
  },
  vendedorId?: string,
): Promise<EmpresaCarteira> {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    razaoSocial: nome,
    endereco,
    ...(vendedorId ? { vendedorId } : {}),
  })
  expect(r.status).toBe(201)
  return r.body as EmpresaCarteira
}

const eventosDe = (tenantId: string, empresaId: string) =>
  noTenant(
    tenantId,
    (tx) => tx<{ tipo: string }[]>`
      SELECT tipo FROM eventos_outbox WHERE entidade_id = ${empresaId} AND tipo = 'empresa.geocodificar'`,
  )

const marcar = (tenantId: string, id: string, sql: string) =>
  noTenant(tenantId, (tx) => tx.unsafe(sql.replaceAll('$ID', id)))

describe('automático: empresa nova e endereço alterado', () => {
  it('empresa nova agenda a geocodificação; sem coordenada até o worker fazer', async () => {
    const { d } = await cenario()
    const e = await criarEmpresa(d.cookie, 'Alfa Teste')
    expect(await eventosDe(d.tenantId, e.id)).toHaveLength(1)
    expect(e.posicao).toMatchObject({ estado: 'sem_coordenada', latitude: null })
  })

  it('alterar o endereço invalida a coordenada e agenda de novo; mudar só o nome não', async () => {
    const { d } = await cenario()
    const e = await criarEmpresa(d.cookie, 'Beta Teste')
    await marcar(
      d.tenantId,
      e.id,
      `UPDATE empresas SET geo_precisao = 'exata', geo_origem = 'cnefe',
         localizacao = ST_SetSRID(ST_MakePoint(-40.3, -20.3), 4326)::geography WHERE id = '$ID'`,
    )
    const so_nome = await chamar('patch', d.cookie, `/v1/carteira/empresas/${e.id}`, {
      razaoSocial: 'Beta Teste Ltda',
    })
    expect((so_nome.body as EmpresaCarteira).posicao.estado).toBe('exata')
    expect(await eventosDe(d.tenantId, e.id)).toHaveLength(1)

    const r = await chamar('patch', d.cookie, `/v1/carteira/empresas/${e.id}`, {
      endereco: {
        cep: '29000000',
        logradouro: 'Outra',
        numero: '5',
        bairro: 'Bairro Teste',
        municipioCodigo: 3205309,
      },
    })
    expect(r.status).toBe(200)
    expect((r.body as EmpresaCarteira).posicao).toMatchObject({
      estado: 'sem_coordenada',
      latitude: null,
    })
    expect(await eventosDe(d.tenantId, e.id)).toHaveLength(2)
  })

  it('o ajuste manual sobrevive à troca do endereço, com o aviso para o usuário decidir', async () => {
    const { d } = await cenario()
    const e = await criarEmpresa(d.cookie, 'Gama Teste')
    const ajuste = await chamar('post', d.cookie, `/empresas/${e.id}/posicao`, {
      latitude: -20.3,
      longitude: -40.3,
    })
    expect(ajuste.status).toBe(200)
    expect(ajuste.body as PosicaoDaEmpresa).toMatchObject({
      estado: 'exata',
      origem: 'manual',
      ajusteManual: true,
      enderecoMudouDepoisDoAjuste: false,
    })
    const antes = (await eventosDe(d.tenantId, e.id)).length
    const r = await chamar('patch', d.cookie, `/v1/carteira/empresas/${e.id}`, {
      endereco: {
        cep: '29000000',
        logradouro: 'Mudou',
        numero: '7',
        bairro: 'Bairro Teste',
        municipioCodigo: 3205309,
      },
    })
    expect((r.body as EmpresaCarteira).posicao).toMatchObject({
      estado: 'exata',
      latitude: -20.3,
      ajusteManual: true,
      enderecoMudouDepoisDoAjuste: true,
    })
    expect(await eventosDe(d.tenantId, e.id)).toHaveLength(antes) // nada foi agendado
    // manter a posição: o aviso some
    const manter = await chamar('post', d.cookie, `/empresas/${e.id}/confirmar-endereco`, {
      acao: 'manter_posicao',
    })
    expect(manter.body as PosicaoDaEmpresa).toMatchObject({
      latitude: -20.3,
      enderecoMudouDepoisDoAjuste: false,
    })
    // refazer: descarta o ajuste e agenda
    await chamar('patch', d.cookie, `/v1/carteira/empresas/${e.id}`, {
      endereco: {
        cep: '29000000',
        logradouro: 'Mudou de novo',
        numero: '8',
        bairro: 'Bairro Teste',
        municipioCodigo: 3205309,
      },
    })
    const refazer = await chamar('post', d.cookie, `/empresas/${e.id}/confirmar-endereco`, {
      acao: 'refazer',
    })
    expect(refazer.body as PosicaoDaEmpresa).toMatchObject({
      estado: 'sem_coordenada',
      ajusteManual: false,
      latitude: null,
    })
    expect((await eventosDe(d.tenantId, e.id)).length).toBeGreaterThan(antes)
  })
})

describe('ajustar a posição', () => {
  it('fora do Brasil é 400; corpo desconhecido é 400', async () => {
    const { d } = await cenario()
    const e = await criarEmpresa(d.cookie, 'Delta Teste')
    const fora = await chamar('post', d.cookie, `/empresas/${e.id}/posicao`, {
      latitude: 40,
      longitude: -3,
    })
    expect(fora.status).toBe(400)
    expect(erroDe(fora)).toBe('fora_do_brasil')
    expect(
      (
        await chamar('post', d.cookie, `/empresas/${e.id}/posicao`, {
          latitude: -20,
          longitude: -40,
          x: 1,
        })
      ).status,
    ).toBe(400)
  })

  it('tira a tag "Endereço a confirmar" e registra na auditoria', async () => {
    const { d } = await cenario()
    const e = await criarEmpresa(d.cookie, 'Épsilon Teste', {
      logradouro: 'Sem Número',
      municipioCodigo: 3205309,
    })
    await marcar(
      d.tenantId,
      e.id,
      `INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id)
       SELECT tenant_id, '$ID', id FROM tags WHERE chave_sistema = 'endereco_a_confirmar'`,
    )
    const antes = (await chamar('get', d.cookie, `/empresas/${e.id}/posicao`))
      .body as PosicaoDaEmpresa
    expect(antes.estado).toBe('a_confirmar')
    expect(antes.faltas).toEqual(['numero', 'bairro'])
    const r = await chamar('post', d.cookie, `/empresas/${e.id}/posicao`, {
      latitude: -20.3,
      longitude: -40.3,
    })
    expect(r.body as PosicaoDaEmpresa).toMatchObject({ estado: 'exata', raioM: 100 })
    const tags = await noTenant(
      d.tenantId,
      (tx) => tx`SELECT 1 FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
        WHERE et.empresa_id = ${e.id} AND t.chave_sistema = 'endereco_a_confirmar'`,
    )
    expect(tags).toHaveLength(0)
    const aud = await noTenant(
      d.tenantId,
      (tx) => tx`SELECT 1 FROM auditoria WHERE entidade_id = ${e.id} AND acao = 'ajustar_posicao'`,
    )
    expect(aud).toHaveLength(1)
  })

  it('vendedor ajusta só as da sua carteira; de outra empresa (tenant) é 404', async () => {
    const { d, vendedor, vendedorId } = await cenario()
    const minha = await criarEmpresa(d.cookie, 'Minha Teste', undefined, vendedorId)
    const alheia = await criarEmpresa(d.cookie, 'Alheia Teste')
    const ok = await chamar('post', vendedor.cookie, `/empresas/${minha.id}/posicao`, {
      latitude: -20.3,
      longitude: -40.3,
    })
    expect(ok.status).toBe(200)
    const negado = await chamar('post', vendedor.cookie, `/empresas/${alheia.id}/posicao`, {
      latitude: -20.3,
      longitude: -40.3,
    })
    expect([403, 404]).toContain(negado.status)
    const outro = await novoDono(app)
    const r = await chamar('post', outro.cookie, `/empresas/${minha.id}/posicao`, {
      latitude: -20.3,
      longitude: -40.3,
    })
    expect(r.status).toBe(404)
    expect(erroDe(r)).toBe('empresa_nao_encontrada')
  })

  it('geocodificar de novo apaga a posição automática e agenda; ajustada à mão é 409', async () => {
    const { d } = await cenario()
    const e = await criarEmpresa(d.cookie, 'Zeta Teste')
    await marcar(
      d.tenantId,
      e.id,
      `UPDATE empresas SET geo_precisao = 'exata', geo_origem = 'cnefe',
         localizacao = ST_SetSRID(ST_MakePoint(-40.3, -20.3), 4326)::geography WHERE id = '$ID'`,
    )
    const r = await chamar('post', d.cookie, `/empresas/${e.id}/geocodificar`)
    expect(r.status).toBe(200)
    expect(r.body as PosicaoDaEmpresa).toMatchObject({ estado: 'sem_coordenada' })
    await chamar('post', d.cookie, `/empresas/${e.id}/posicao`, {
      latitude: -20.3,
      longitude: -40.3,
    })
    const manual = await chamar('post', d.cookie, `/empresas/${e.id}/geocodificar`)
    expect(manual.status).toBe(409)
    expect(erroDe(manual)).toBe('posicao_ajustada')
  })
})

describe('resumo e fila "Confirmar endereço"', () => {
  it('conta exatas, aproximadas, sem coordenada, a confirmar e ajustadas à mão', async () => {
    const { d } = await cenario()
    const a = await criarEmpresa(d.cookie, 'Resumo A')
    const b = await criarEmpresa(d.cookie, 'Resumo B')
    const c = await criarEmpresa(d.cookie, 'Resumo C')
    await criarEmpresa(d.cookie, 'Resumo D')
    await marcar(
      d.tenantId,
      a.id,
      `UPDATE empresas SET geo_precisao = 'exata', geo_origem = 'cnefe', localizacao = ST_SetSRID(ST_MakePoint(-40.3, -20.3), 4326)::geography WHERE id = '$ID'`,
    )
    await marcar(
      d.tenantId,
      b.id,
      `UPDATE empresas SET geo_precisao = 'aproximada', geo_aproximacao = 'rua', geo_origem = 'nominatim', localizacao = ST_SetSRID(ST_MakePoint(-40.3, -20.3), 4326)::geography WHERE id = '$ID'`,
    )
    await marcar(
      d.tenantId,
      c.id,
      `INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id) SELECT tenant_id, '$ID', id FROM tags WHERE chave_sistema = 'endereco_a_confirmar'`,
    )
    await chamar('post', d.cookie, `/empresas/${a.id}/posicao`, {
      latitude: -20.3,
      longitude: -40.3,
    })
    const r = await chamar('get', d.cookie, '/resumo')
    expect(r.status).toBe(200)
    expect(r.body as ResumoDaGeolocalizacao).toMatchObject({
      uf: 'ES',
      totalEmpresas: 4,
      exatas: 1,
      aproximadas: 1,
      semCoordenada: 1,
      aConfirmar: 1,
      ajustadasAMao: 1,
      nominatimConfigurado: false,
    })
  })

  it('a fila lista a tag, com o que falta; o vendedor vê só as suas', async () => {
    const { d, vendedor, vendedorId } = await cenario()
    const minha = await criarEmpresa(
      d.cookie,
      'Fila Minha',
      { logradouro: 'Rua Y', municipioCodigo: 3205309 },
      vendedorId,
    )
    const outra = await criarEmpresa(d.cookie, 'Fila Outra', {
      logradouro: 'Rua Z',
      municipioCodigo: 3205309,
    })
    for (const e of [minha, outra]) {
      await marcar(
        d.tenantId,
        e.id,
        `INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id) SELECT tenant_id, '$ID', id FROM tags WHERE chave_sistema = 'endereco_a_confirmar'`,
      )
    }
    const todas = (await chamar('get', d.cookie, '/fila')).body as ListaDaFila
    expect(todas.total).toBe(2)
    expect(todas.itens[0]?.faltas).toEqual(['numero', 'bairro'])
    const doVendedor = (await chamar('get', vendedor.cookie, '/fila')).body as ListaDaFila
    expect(doVendedor.itens.map((i) => i.empresaId)).toEqual([minha.id])
  })
})

describe('regiões', () => {
  it('lista as microrregiões oficiais por UF; só o admin cria, altera e exclui as dele', async () => {
    const { d, gestor } = await cenario()
    const lista = (await chamar('get', d.cookie, '/regioes?uf=ES')).body as RegiaoGeo[]
    const vitoria = lista.find((r) => r.id === 'micro:32009')
    expect(vitoria).toMatchObject({ tipo: 'microrregiao', nome: 'Vitória', uf: 'ES' })
    expect(vitoria?.municipios.map((m) => semAcento(m.nome))).toEqual(['serra', 'vitoria'])

    expect(
      (await chamar('post', gestor.cookie, '/regioes', { nome: 'X', municipios: [3205309] }))
        .status,
    ).toBe(403)
    const criada = await chamar('post', d.cookie, '/regioes', {
      nome: 'Grande Vitória',
      municipios: [3205309, 3205002],
    })
    expect(criada.status).toBe(201)
    const regiao = criada.body as RegiaoGeo
    expect(regiao).toMatchObject({ tipo: 'personalizada', nome: 'Grande Vitória' })
    expect(
      (
        await chamar('post', d.cookie, '/regioes', {
          nome: 'grande vitória',
          municipios: [3205309],
        })
      ).status,
    ).toBe(409)
    const ruim = await chamar('post', d.cookie, '/regioes', { nome: 'Ruim', municipios: [1] })
    expect(erroDe(ruim)).toBe('municipio_invalido')
    const alterada = await chamar('put', d.cookie, `/regioes/${regiao.id}`, {
      nome: 'Só Vitória',
      municipios: [3205309],
    })
    expect((alterada.body as RegiaoGeo).municipios).toHaveLength(1)
    expect((await chamar('delete', d.cookie, `/regioes/${regiao.id}`)).status).toBe(204)
    expect(
      ((await chamar('get', d.cookie, '/regioes?uf=ES')).body as RegiaoGeo[]).some(
        (r) => r.id === regiao.id,
      ),
    ).toBe(false)
    // as oficiais não se alteram nem se excluem
    expect((await chamar('delete', d.cookie, '/regioes/micro:32009')).status).toBe(400)
  })

  it('região de outra empresa não aparece e dá 404', async () => {
    const { d } = await cenario()
    const regiao = (
      await chamar('post', d.cookie, '/regioes', { nome: 'Minha Região', municipios: [3205309] })
    ).body as RegiaoGeo
    const outro = await novoDono(app)
    expect(
      ((await chamar('get', outro.cookie, '/regioes?uf=ES')).body as RegiaoGeo[]).some(
        (r) => r.id === regiao.id,
      ),
    ).toBe(false)
    expect((await chamar('delete', outro.cookie, `/regioes/${regiao.id}`)).status).toBe(404)
  })
})

describe('lotes por cidade ou região', () => {
  /** Dependências falsas: toda empresa vira "rua do CNEFE" (aproximada); a de número ruim, a confirmar. */
  function servicosFalsos(): ServicosDeGeo {
    const dep: DependenciasDaGeocodificacao = {
      cnefe: {
        carregado: () => Promise.resolve(true),
        acharRua: () => Promise.resolve({ chave: 'FICTICIA', exata: true }),
        buscarNaRua: () =>
          Promise.resolve({
            nivel: 'rua' as const,
            latitude: -20.31,
            longitude: -40.31,
            detalhe: 'x',
            ambiguo: false,
          }),
        centroDoCep: () => Promise.resolve(null),
        centroDoMunicipio: () => Promise.resolve(null),
      },
      nominatim: null,
      cep: { consultar: () => Promise.resolve(null) },
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

  async function rodar(d: Dono, loteId: string, deveParar = () => false) {
    const executor = new ExecutorDoLoteGeo(servicosFalsos(), deveParar)
    let desfecho = await executor.executarBloco(d.tenantId, loteId)
    for (let i = 0; i < 50 && desfecho === 'continua'; i++) {
      desfecho = await executor.executarBloco(d.tenantId, loteId)
    }
    return desfecho
  }

  const semEventos = (tenantId: string) =>
    noTenant(
      tenantId,
      (tx) =>
        tx`UPDATE eventos_outbox SET processado_em = now() WHERE tipo LIKE 'geo.%' OR tipo = 'empresa.geocodificar'`,
    )

  it('prévia, execução em blocos, resultado por empresa e o relatório do lote', async () => {
    const { d } = await cenario()
    const ok1 = await criarEmpresa(d.cookie, 'Lote 1')
    const ok2 = await criarEmpresa(d.cookie, 'Lote 2')
    const incompleta = await criarEmpresa(d.cookie, 'Lote 3', {
      logradouro: 'X',
      municipioCodigo: 3205309,
    })
    await criarEmpresa(d.cookie, 'Lote Serra', {
      cep: '29000000',
      logradouro: 'Y',
      numero: '1',
      bairro: 'B',
      municipioCodigo: 3205002,
    })
    await marcar(
      d.tenantId,
      ok2.id,
      `UPDATE empresas SET geo_precisao = 'exata', geo_origem = 'cnefe', localizacao = ST_SetSRID(ST_MakePoint(-40.3, -20.3), 4326)::geography WHERE id = '$ID'`,
    )
    await semEventos(d.tenantId)

    const previa = await chamar('post', d.cookie, '/lotes/previa', {
      tipo: 'municipio',
      id: '3205309',
    })
    expect(previa.body as PreviaDoLote).toMatchObject({
      escopo: expect.stringMatching(/vit[oó]ria/i) as string,
      municipios: 1,
      total: 3,
      comCoordenada: 1,
      aProcessar: 2,
      ajustadasAMao: 0,
    })

    const criado = await chamar('post', d.cookie, '/lotes', {
      escopo: { tipo: 'municipio', id: '3205309' },
    })
    expect(criado.status).toBe(201)
    const lote = criado.body as LoteGeo
    expect(lote).toMatchObject({
      situacao: 'em_andamento',
      totalEmpresas: 2,
      processadas: 0,
      escopo: expect.stringMatching(/vit[oó]ria/i) as string,
    })
    expect(await rodar(d, lote.id)).toBe('concluido')

    const fim = (await chamar('get', d.cookie, `/lotes/${lote.id}`)).body as LoteGeo
    expect(fim).toMatchObject({ situacao: 'concluido', processadas: 2 })
    expect(fim.porResultado).toEqual({ aproximada: 1, a_confirmar: 1 })

    const geo = await noTenant(
      d.tenantId,
      (tx) => tx<{ id: string; geo_precisao: string | null }[]>`
      SELECT id, geo_precisao FROM empresas WHERE id IN (${ok1.id}, ${incompleta.id}, ${ok2.id})`,
    )
    const porId = Object.fromEntries(geo.map((g) => [g.id, g.geo_precisao]))
    expect(porId[ok1.id]).toBe('aproximada')
    expect(porId[incompleta.id]).toBeNull()
    expect(porId[ok2.id]).toBe('exata') // já tinha coordenada: o lote não refaz

    const lista = (await chamar('get', d.cookie, '/lotes')).body as ListaDeLotesGeo
    expect(lista.total).toBe(1)
    const consultas = await noTenant(
      d.tenantId,
      (tx) => tx`SELECT 1 FROM geo_consultas WHERE lote_id = ${lote.id}`,
    )
    expect(consultas).toHaveLength(1) // só a empresa completa consulta; a incompleta vai direto a confirmar
  })

  it('refazer com coordenada inclui as que já têm (menos as ajustadas à mão)', async () => {
    const { d } = await cenario()
    const a = await criarEmpresa(d.cookie, 'Refaz A')
    const b = await criarEmpresa(d.cookie, 'Refaz B')
    await marcar(
      d.tenantId,
      a.id,
      `UPDATE empresas SET geo_precisao = 'exata', geo_origem = 'cnefe', localizacao = ST_SetSRID(ST_MakePoint(-40.3, -20.3), 4326)::geography WHERE id = '$ID'`,
    )
    await chamar('post', d.cookie, `/empresas/${b.id}/posicao`, {
      latitude: -20.5,
      longitude: -40.5,
    })
    await semEventos(d.tenantId)
    const previa = (
      await chamar('post', d.cookie, '/lotes/previa', { tipo: 'municipio', id: '3205309' })
    ).body as PreviaDoLote
    expect(previa).toMatchObject({ total: 1, comCoordenada: 1, aProcessar: 0, ajustadasAMao: 1 })
    const lote = (
      await chamar('post', d.cookie, '/lotes', {
        escopo: { tipo: 'municipio', id: '3205309' },
        refazerComCoordenada: true,
      })
    ).body as LoteGeo
    expect(lote.totalEmpresas).toBe(1)
    expect(await rodar(d, lote.id)).toBe('concluido')
    const manual = await noTenant(
      d.tenantId,
      (tx) =>
        tx<
          { lat: number }[]
        >`SELECT ST_Y(localizacao::geometry) AS lat FROM empresas WHERE id = ${b.id}`,
    )
    expect(manual[0]?.lat).toBe(-20.5) // o ajuste manual nunca muda
  })

  it('um lote por vez; sem nada a fazer é 409; cancelar vale antes da próxima empresa e retomar continua', async () => {
    const { d } = await cenario()
    for (const n of ['C1', 'C2', 'C3']) await criarEmpresa(d.cookie, `Cancel ${n}`)
    await semEventos(d.tenantId)
    const lote = (
      await chamar('post', d.cookie, '/lotes', { escopo: { tipo: 'regiao', id: 'micro:32009' } })
    ).body as LoteGeo
    expect(lote.totalEmpresas).toBe(3)
    const outro = await chamar('post', d.cookie, '/lotes', {
      escopo: { tipo: 'municipio', id: '3205309' },
    })
    expect(outro.status).toBe(409)
    expect(erroDe(outro)).toBe('lote_em_andamento')

    const cancelado = await chamar('post', d.cookie, `/lotes/${lote.id}/cancelar`)
    expect((cancelado.body as LoteGeo).situacao).toBe('cancelado')
    expect(await rodar(d, lote.id)).toBe('cancelado')
    expect(((await chamar('get', d.cookie, `/lotes/${lote.id}`)).body as LoteGeo).processadas).toBe(
      0,
    )
    expect((await chamar('post', d.cookie, `/lotes/${lote.id}/cancelar`)).status).toBe(409)

    const retomado = await chamar('post', d.cookie, `/lotes/${lote.id}/retomar`)
    expect((retomado.body as LoteGeo).situacao).toBe('em_andamento')
    expect(await rodar(d, lote.id)).toBe('concluido')
    expect(((await chamar('get', d.cookie, `/lotes/${lote.id}`)).body as LoteGeo).processadas).toBe(
      3,
    )
    expect((await chamar('post', d.cookie, `/lotes/${lote.id}/retomar`)).status).toBe(409)

    const vazio = await chamar('post', d.cookie, '/lotes', {
      escopo: { tipo: 'municipio', id: '3205309' },
    })
    expect(vazio.status).toBe(409)
    expect(erroDe(vazio)).toBe('lote_vazio')
  })

  it('o SIGTERM interrompe no meio e o próximo bloco continua de onde parou', async () => {
    const { d } = await cenario()
    for (const n of ['S1', 'S2', 'S3']) await criarEmpresa(d.cookie, `Term ${n}`)
    await semEventos(d.tenantId)
    const lote = (
      await chamar('post', d.cookie, '/lotes', { escopo: { tipo: 'municipio', id: '3205309' } })
    ).body as LoteGeo
    let chamadas = 0
    const parando = () => ++chamadas > 2 // deixa fazer a primeira, depois "recebe o SIGTERM"
    const executor = new ExecutorDoLoteGeo(servicosFalsos(), parando)
    expect(await executor.executarBloco(d.tenantId, lote.id)).toBe('interrompido')
    const meio = (await chamar('get', d.cookie, `/lotes/${lote.id}`)).body as LoteGeo
    expect(meio.processadas).toBeGreaterThan(0)
    expect(meio.processadas).toBeLessThan(3)
    expect(await rodar(d, lote.id)).toBe('concluido')
    expect(((await chamar('get', d.cookie, `/lotes/${lote.id}`)).body as LoteGeo).processadas).toBe(
      3,
    )
  })

  it('só admin e gestor; vendedor 403; lote de outra empresa 404; escopo inválido 400', async () => {
    const { d, gestor, vendedor } = await cenario()
    await criarEmpresa(d.cookie, 'Permissão')
    await semEventos(d.tenantId)
    for (const [metodo, url, corpo] of [
      ['post', '/lotes/previa', { tipo: 'municipio', id: '3205309' }],
      ['post', '/lotes', { escopo: { tipo: 'municipio', id: '3205309' } }],
      ['get', '/lotes', undefined],
    ] as const) {
      const r = await chamar(metodo, vendedor.cookie, url, corpo)
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('acesso_negado')
    }
    expect(
      (await chamar('post', gestor.cookie, '/lotes/previa', { tipo: 'municipio', id: '3205309' }))
        .status,
    ).toBe(200)
    for (const id of ['abc', '123', 'micro:xx', 'não-é-uuid']) {
      const r = await chamar('post', d.cookie, '/lotes/previa', {
        tipo: id.startsWith('micro') || id.includes('uuid') ? 'regiao' : 'municipio',
        id,
      })
      expect(r.status).toBe(400)
    }
    const lote = (
      await chamar('post', d.cookie, '/lotes', { escopo: { tipo: 'municipio', id: '3205309' } })
    ).body as LoteGeo
    const outro = await novoDono(app)
    expect((await chamar('get', outro.cookie, `/lotes/${lote.id}`)).status).toBe(404)
    expect((await chamar('get', undefined, `/lotes/${lote.id}`)).status).toBe(401)
  })
})
