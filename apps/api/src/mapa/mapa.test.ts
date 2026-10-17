import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type {
  CoberturaDoMapa,
  LegendaDoMapa,
  ListaDeSelecao,
  OpcoesDoMapa,
  PontosDoMapa,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

// Empresas, coordenadas e cidades FICTÍCIAS (as coordenadas ficam perto de Vitória só por conveniência).
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await dono`UPDATE municipios SET localizacao = NULL WHERE codigo_ibge IN (3205309, 3205002)`
  await valkey.quit()
  await dono.end()
})

beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'Vitória', 'ES'), (3205002, 'Serra', 'ES') ON CONFLICT DO NOTHING`
  await dono`UPDATE municipios SET localizacao = ST_SetSRID(ST_MakePoint(-40.30, -20.28), 4326) WHERE codigo_ibge = 3205309`
  await dono`UPDATE municipios SET localizacao = ST_SetSRID(ST_MakePoint(-40.30, -20.13), 4326) WHERE codigo_ibge = 3205002`
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

type Metodo = 'get' | 'post' | 'put' | 'patch'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url.startsWith('/v1') ? url : `/v1/mapa${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.7.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

const AREA = 'oeste=-40.6&sul=-20.6&leste=-40.0&norte=-19.9'

async function cenario() {
  const d = await novoDono(app)
  const gestor = await usuarioSimples(app)
  await vincular(d.tenantId, gestor.id, 'gestor')
  await ativar(gestor.id, d.tenantId)
  const vendedor = await usuarioSimples(app)
  await vincular(d.tenantId, vendedor.id, 'vendedor')
  await ativar(vendedor.id, d.tenantId)
  const membros = await noTenant(
    d.tenantId,
    (tx) => tx<{ id: string; usuario_id: string }[]>`SELECT id, usuario_id FROM membros`,
  )
  const idDe = (usuarioId: string) => membros.find((m) => m.usuario_id === usuarioId)?.id as string
  const tag = async (chave: string) =>
    (
      await noTenant(
        d.tenantId,
        (tx) => tx<{ id: string }[]>`SELECT id FROM tags WHERE chave_sistema = ${chave}`,
      )
    )[0]?.id as string
  const tags = {
    lead: await tag('lead'),
    prospect: await tag('prospect'),
    cliente: await tag('cliente'),
    inativo: await tag('inativo'),
  }

  /** Cria uma empresa com Status, posição e (opcional) última visita, direto no banco. */
  async function empresa(o: {
    nome: string
    status: keyof typeof tags
    lat: number
    lon: number
    vendedorId?: string
    visitadaHaDias?: number | null
    municipio?: number
    importacaoId?: string
    precisao?: 'exata' | 'aproximada'
  }) {
    const id = novoId()
    await noTenant(d.tenantId, async (tx) => {
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id, municipio_codigo, importacao_id,
          localizacao, geo_precisao, geo_origem, ultima_visita_em)
        VALUES (${id}, ${d.tenantId}, ${o.nome}, ${o.vendedorId ?? idDe(d.usuarioId)}, ${o.municipio ?? 3205309},
          ${o.importacaoId ?? null},
          ST_SetSRID(ST_MakePoint(${o.lon}, ${o.lat}), 4326)::geography, ${o.precisao ?? 'exata'}::geo_precisao, 'cnefe',
          ${o.visitadaHaDias == null ? null : tx`now() - make_interval(days => ${o.visitadaHaDias})`})`
      await tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id) VALUES (${d.tenantId}, ${id}, ${tags[o.status]})`
    })
    return id
  }
  return {
    d,
    gestor,
    vendedor,
    vendedorId: idDe(vendedor.id),
    tags,
    empresa,
    idDe,
    membroDoDono: idDe(d.usuarioId),
  }
}

const pontos = async (cookie: string, extra = '', zoom = 12) =>
  (await chamar('get', cookie, `/pontos?${AREA}&zoom=${zoom}${extra}`)).body as PontosDoMapa

describe('GET /v1/mapa/opcoes', () => {
  it('chips das tags de Status que aparecem no mapa (sem Inativo), ligados ao abrir (sem Prospect), com totais', async () => {
    const { d, empresa } = await cenario()
    await empresa({ nome: 'A', status: 'cliente', lat: -20.3, lon: -40.3 })
    await empresa({ nome: 'B', status: 'cliente', lat: -20.31, lon: -40.31 })
    await empresa({ nome: 'C', status: 'prospect', lat: -20.32, lon: -40.32 })
    await empresa({ nome: 'D', status: 'inativo', lat: -20.33, lon: -40.33 })
    const r = await chamar('get', d.cookie, '/opcoes')
    expect(r.status).toBe(200)
    const o = r.body as OpcoesDoMapa
    expect(o.chips.map((c) => `${c.chave}:${c.ligadoAoAbrir}:${c.total}:${c.porLote}`)).toEqual([
      'lead:true:0:true',
      'prospect:false:1:false',
      'cliente:true:2:false',
    ])
    expect(o.uf).toBe('ES')
    expect(o.limiteDeLeads).toBe(500)
    expect(o.legenda.map((e) => e.chave).slice(-2)).toEqual(['sem_visita', 'visita_tentada'])
    expect(o.centroInicial.zoom).toBe(9)
    expect(o.mapaInstalado).toBe(false)
  })

  it('o vendedor só conta o que já vê (e não recebe a lista de vendedores)', async () => {
    const { d, vendedor, vendedorId, empresa } = await cenario()
    await empresa({ nome: 'Minha', status: 'cliente', lat: -20.3, lon: -40.3, vendedorId })
    await empresa({ nome: 'Alheia', status: 'cliente', lat: -20.31, lon: -40.31 })
    const o = (await chamar('get', vendedor.cookie, '/opcoes')).body as OpcoesDoMapa
    expect(o.chips.find((c) => c.chave === 'cliente')?.total).toBe(1)
    expect(o.vendedores).toEqual([])
    const admin = (await chamar('get', d.cookie, '/opcoes')).body as OpcoesDoMapa
    expect(admin.chips.find((c) => c.chave === 'cliente')?.total).toBe(2)
    expect(admin.vendedores.length).toBeGreaterThanOrEqual(3)
  })

  it('a flag "aparece no mapa" da tag liga e desliga o chip e as empresas dela', async () => {
    const { d, tags, empresa } = await cenario()
    await empresa({ nome: 'A', status: 'prospect', lat: -20.3, lon: -40.3 })
    const grupos = (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as {
      tags: {
        id: string
        chaveSistema: string | null
        apareceNoMapa: boolean
        visivelAoAbrir: boolean
      }[]
    }[]
    expect(grupos[0]?.tags.find((t) => t.chaveSistema === 'inativo')).toMatchObject({
      apareceNoMapa: false,
      visivelAoAbrir: false,
    })
    expect(grupos[0]?.tags.find((t) => t.chaveSistema === 'prospect')).toMatchObject({
      apareceNoMapa: true,
      visivelAoAbrir: false,
    })
    const r = await chamar('patch', d.cookie, `/v1/configuracoes/tags/${tags.prospect}`, {
      apareceNoMapa: false,
    })
    expect(r.status).toBe(200)
    const o = (await chamar('get', d.cookie, '/opcoes')).body as OpcoesDoMapa
    expect(o.chips.some((c) => c.chave === 'prospect')).toBe(false)
    const p = await pontos(d.cookie, `&statusTagIds=${tags.prospect}`)
    expect(p.total).toBe(0)
  })
})

describe('GET /v1/mapa/pontos', () => {
  it('só as empresas da área e dos chips ligados; Cliente sem visita há 60+ dias fica vermelho (sem_visita)', async () => {
    const { d, tags, empresa } = await cenario()
    const recente = await empresa({
      nome: 'Recente',
      status: 'cliente',
      lat: -20.3,
      lon: -40.3,
      visitadaHaDias: 10,
    })
    const antigo = await empresa({
      nome: 'Antigo',
      status: 'cliente',
      lat: -20.31,
      lon: -40.31,
      visitadaHaDias: 90,
    })
    const nunca = await empresa({ nome: 'Nunca', status: 'cliente', lat: -20.32, lon: -40.32 })
    const prospect = await empresa({
      nome: 'Prospect',
      status: 'prospect',
      lat: -20.33,
      lon: -40.33,
      visitadaHaDias: 200,
    })
    await empresa({ nome: 'Longe', status: 'cliente', lat: -10, lon: -50 })
    await empresa({ nome: 'Inativa', status: 'inativo', lat: -20.34, lon: -40.34 })
    const todos = `&statusTagIds=${tags.cliente},${tags.prospect}`
    const p = await pontos(d.cookie, todos)
    expect(p.total).toBe(4)
    const por = Object.fromEntries(p.pontos.map((x) => [x.id, x]))
    expect(por[recente]).toMatchObject({ estado: `tag:${tags.cliente}`, visitada: true })
    expect(por[antigo]).toMatchObject({ estado: 'sem_visita', visitada: true })
    expect(por[nunca]).toMatchObject({ estado: 'sem_visita', visitada: false })
    // só carteira de Clientes ganha o vermelho: o Prospect mantém a cor do Status
    expect(por[prospect]).toMatchObject({ estado: `tag:${tags.prospect}`, visitada: true })
    expect(p.agrupamentos).toEqual([])
  })

  it('nenhum chip ligado = nada; busca, visitada, vendedor, cidade e precisão filtram', async () => {
    const { d, tags, vendedorId, empresa } = await cenario()
    await empresa({
      nome: 'Metalúrgica Alfa',
      status: 'cliente',
      lat: -20.3,
      lon: -40.3,
      visitadaHaDias: 5,
      precisao: 'exata',
    })
    await empresa({
      nome: 'Beta Comércio',
      status: 'cliente',
      lat: -20.31,
      lon: -40.31,
      vendedorId,
      precisao: 'aproximada',
      municipio: 3205002,
    })
    const cli = `&statusTagIds=${tags.cliente}`
    expect((await pontos(d.cookie, '')).total).toBe(0)
    expect((await pontos(d.cookie, cli)).total).toBe(2)
    expect((await pontos(d.cookie, `${cli}&busca=metalurgica`)).pontos.map((x) => x.nome)).toEqual([
      'Metalúrgica Alfa',
    ])
    expect((await pontos(d.cookie, `${cli}&busca=serra`)).pontos.map((x) => x.nome)).toEqual([
      'Beta Comércio',
    ])
    expect((await pontos(d.cookie, `${cli}&visitada=alguma_vez`)).total).toBe(1)
    expect((await pontos(d.cookie, `${cli}&visitada=nunca`)).total).toBe(1)
    expect((await pontos(d.cookie, `${cli}&visitada=90_dias`)).total).toBe(1)
    expect(
      (await pontos(d.cookie, `${cli}&vendedorId=${vendedorId}`)).pontos.map((x) => x.nome),
    ).toEqual(['Beta Comércio'])
    expect((await pontos(d.cookie, `${cli}&municipioCodigo=3205002`)).total).toBe(1)
    expect((await pontos(d.cookie, `${cli}&precisao=aproximada`)).total).toBe(1)
    expect((await pontos(d.cookie, `${cli}&semVisitaDias=30`)).pontos.map((x) => x.nome)).toEqual([
      'Beta Comércio',
    ])
  })

  it('"sem visita há N dias" só vale para a carteira (Cliente e Prospect), nunca para Lead', async () => {
    const { d, tags, empresa } = await cenario()
    await empresa({ nome: 'Cliente', status: 'cliente', lat: -20.3, lon: -40.3 })
    await empresa({ nome: 'Prospect', status: 'prospect', lat: -20.31, lon: -40.31 })
    const r = await pontos(
      d.cookie,
      `&statusTagIds=${tags.cliente},${tags.prospect}&semVisitaDias=30`,
    )
    expect(r.total).toBe(2)
  })

  it('leads só aparecem por lote de importação', async () => {
    const { d, tags, empresa } = await cenario()
    const lote = novoId()
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`INSERT INTO importacoes (id, tenant_id, nome, nome_arquivo) VALUES (${lote}, ${d.tenantId}, 'Lote Alfa', 'x.xlsx')`,
    )
    await empresa({
      nome: 'Lead do lote',
      status: 'lead',
      lat: -20.3,
      lon: -40.3,
      importacaoId: lote,
    })
    await empresa({ nome: 'Lead solto', status: 'lead', lat: -20.31, lon: -40.31 })
    const lead = `&statusTagIds=${tags.lead}`
    expect((await pontos(d.cookie, lead)).total).toBe(0)
    const com = await pontos(d.cookie, `${lead}&lotes=${lote}`)
    expect(com.pontos.map((x) => x.nome)).toEqual(['Lead do lote'])
    expect(com.leads).toEqual({ mostrados: 1, total: 1, limite: 500 })
    const o = (await chamar('get', d.cookie, '/opcoes')).body as OpcoesDoMapa
    expect(o.lotesDeLeads).toEqual([{ id: lote, nome: 'Lote Alfa', comCoordenada: 1 }])
  })

  it('o vendedor só vê as empresas da sua carteira (a menos que a empresa libere)', async () => {
    const { d, vendedor, vendedorId, tags, empresa } = await cenario()
    await empresa({ nome: 'Minha', status: 'cliente', lat: -20.3, lon: -40.3, vendedorId })
    await empresa({ nome: 'Alheia', status: 'cliente', lat: -20.31, lon: -40.31 })
    const cli = `&statusTagIds=${tags.cliente}`
    expect((await pontos(vendedor.cookie, cli)).pontos.map((x) => x.nome)).toEqual(['Minha'])
    expect((await pontos(d.cookie, cli)).total).toBe(2)
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE tenant_configuracoes SET vendedor_ve_todas_empresas = true`,
    )
    expect((await pontos(vendedor.cookie, cli)).total).toBe(2)
  })

  it('muitas empresas viram bolhas no zoom afastado e pontos de perto', async () => {
    const { d, tags } = await cenario()
    await noTenant(d.tenantId, async (tx) => {
      const [m] = await tx<{ id: string }[]>`SELECT id FROM membros LIMIT 1`
      const [t] = await tx<{ id: string }[]>`SELECT ${tags.cliente}::uuid AS id`
      await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id, municipio_codigo, localizacao, geo_precisao)
        SELECT gen_random_uuid(), ${d.tenantId}, 'Em massa ' || n, ${m?.id as string}, 3205309,
               ST_SetSRID(ST_MakePoint(-40.3 + (n % 30) * 0.004, -20.3 + (n / 30) * 0.004), 4326)::geography, 'exata'
        FROM generate_series(1, 450) n`
      await tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id)
        SELECT ${d.tenantId}, id, ${t?.id as string}::uuid FROM empresas WHERE razao_social LIKE 'Em massa %'`
    })
    const cli = `&statusTagIds=${tags.cliente}`
    const longe = await pontos(d.cookie, cli, 9)
    expect(longe.total).toBe(450)
    expect(longe.pontos).toEqual([])
    expect(longe.agrupamentos.reduce((s, g) => s + g.total, 0)).toBe(450)
    const perto = await pontos(d.cookie, cli, 14)
    expect(perto.pontos).toHaveLength(450)
    expect(perto.agrupamentos).toEqual([])
  })

  it('consulta inválida é 400; sem sessão 401', async () => {
    const { d } = await cenario()
    expect((await chamar('get', d.cookie, '/pontos?zoom=10')).status).toBe(400)
    expect((await chamar('get', d.cookie, `/pontos?${AREA}&zoom=10&x=1`)).status).toBe(400)
    expect((await chamar('get', undefined, `/pontos?${AREA}&zoom=10`)).status).toBe(401)
  })
})

describe('próximas, seleção e cobertura', () => {
  async function bairro() {
    const c = await cenario()
    const centro = await c.empresa({
      nome: 'Centro',
      status: 'cliente',
      lat: -20.3,
      lon: -40.3,
      visitadaHaDias: 3,
    })
    // ~1,1 km e ~4,4 km ao norte do centro
    const perto = await c.empresa({ nome: 'Perto', status: 'cliente', lat: -20.29, lon: -40.3 })
    const visitada = await c.empresa({
      nome: 'Perto visitada',
      status: 'cliente',
      lat: -20.291,
      lon: -40.3,
      visitadaHaDias: 20,
    })
    const meio = await c.empresa({ nome: 'Meio', status: 'prospect', lat: -20.26, lon: -40.3 })
    await c.empresa({ nome: 'Longe', status: 'cliente', lat: -20.1, lon: -40.3 })
    return { ...c, centro, perto, visitada, meio }
  }
  const proximas = async (cookie: string, q: string) =>
    (await chamar('get', cookie, `/proximas?latitude=-20.3&longitude=-40.3&${q}`))
      .body as ListaDeSelecao

  it('por raio, em ordem de distância, sem as já visitadas por padrão', async () => {
    const { d, centro } = await bairro()
    const dois = await proximas(d.cookie, 'raioKm=2')
    expect(dois.itens.map((i) => i.nome)).toEqual(['Perto'])
    expect(dois.itens[0]?.distanciaM).toBeGreaterThan(1000)
    expect(dois.itens[0]?.distanciaM).toBeLessThan(1200)
    const cinco = await proximas(d.cookie, `raioKm=5&excluirEmpresaId=${centro}`)
    expect(cinco.itens.map((i) => i.nome)).toEqual(['Perto', 'Meio'])
    const com = await proximas(d.cookie, 'raioKm=2&incluirVisitadas=true')
    expect(com.itens.map((i) => i.nome)).toEqual(['Centro', 'Perto visitada', 'Perto'])
    expect(com.total).toBe(3)
    const vinte = await proximas(d.cookie, 'raioKm=25')
    expect(vinte.itens.map((i) => i.nome)).toEqual(['Perto', 'Meio', 'Longe'])
  })

  it('seleção por raio e por retângulo (exclui as visitadas, a menos que peçam)', async () => {
    const { d } = await bairro()
    const raio = await chamar('post', d.cookie, '/selecao', {
      tipo: 'raio',
      latitude: -20.3,
      longitude: -40.3,
      raioKm: 5,
    })
    expect(raio.status).toBe(200)
    expect((raio.body as ListaDeSelecao).itens.map((i) => i.nome)).toEqual(['Perto', 'Meio'])
    const ret = { tipo: 'retangulo', oeste: -40.31, sul: -20.31, leste: -40.29, norte: -20.28 }
    expect(
      ((await chamar('post', d.cookie, '/selecao', ret)).body as ListaDeSelecao).itens.map(
        (i) => i.nome,
      ),
    ).toEqual(['Perto'])
    const todas = await chamar('post', d.cookie, '/selecao', { ...ret, incluirVisitadas: true })
    expect((todas.body as ListaDeSelecao).itens.map((i) => i.nome)).toEqual([
      'Centro',
      'Perto',
      'Perto visitada',
    ])
    expect((todas.body as ListaDeSelecao).itens[0]?.distanciaM).toBeNull()
    expect((await chamar('post', d.cookie, '/selecao', { tipo: 'raio', latitude: 0 })).status).toBe(
      400,
    )
  })

  it('o vendedor só seleciona o que vê', async () => {
    const { vendedor } = await bairro()
    const r = await chamar('post', vendedor.cookie, '/selecao', {
      tipo: 'raio',
      latitude: -20.3,
      longitude: -40.3,
      raioKm: 25,
    })
    expect((r.body as ListaDeSelecao).total).toBe(0)
  })

  it('cobertura: visitadas e quantas faltam por município, só carteira', async () => {
    const { d, empresa } = await bairro()
    await empresa({
      nome: 'Serra 1',
      status: 'cliente',
      lat: -20.13,
      lon: -40.3,
      municipio: 3205002,
      visitadaHaDias: 1,
    })
    await empresa({
      nome: 'Serra lead',
      status: 'lead',
      lat: -20.14,
      lon: -40.3,
      municipio: 3205002,
    })
    const r = (await chamar('get', d.cookie, '/cobertura')).body as CoberturaDoMapa
    // pelo código IBGE: o nome pode vir em outra grafia de um teste vizinho ("VITORIA")
    const por = Object.fromEntries(r.municipios.map((m) => [m.codigoIbge, m]))
    expect(por[3205309]).toMatchObject({ total: 5, visitadas: 2, faltam: 3 })
    expect(por[3205002]).toMatchObject({ total: 1, visitadas: 1, faltam: 0 })
    expect(por[3205309]?.latitude).toBeCloseTo(-20.28, 5)
  })
})

describe('legenda do mapa', () => {
  it('uma entrada por tag de Status do mapa e os estados fixos, com os padrões', async () => {
    const { d } = await cenario()
    const l = (await chamar('get', d.cookie, '/legenda')).body as LegendaDoMapa
    expect(l.entradas.map((e) => `${e.nome}:${e.cor}:${e.fixa}`)).toEqual([
      'Lead:verde-agua:false',
      'Prospect:ambar:false',
      'Cliente:verde:false',
      'Sem visita há 60+ dias:alerta:true',
      'Visita tentada:indigo:true',
    ])
    expect(l.entradas.every((e) => !e.personalizada)).toBe(true)
  })

  it('o administrador muda cor e nome; nome vazio volta ao padrão; restaurar apaga tudo', async () => {
    const { d, tags } = await cenario()
    const chave = `tag:${tags.cliente}`
    const r = await chamar('put', d.cookie, `/legenda/${encodeURIComponent(chave)}`, {
      cor: 'azul',
      nome: 'Associado',
    })
    expect(r.status).toBe(200)
    const cliente = (r.body as LegendaDoMapa).entradas.find((e) => e.chave === chave)
    expect(cliente).toMatchObject({
      cor: 'azul',
      nome: 'Associado',
      nomePadrao: 'Cliente',
      personalizada: true,
    })
    // só a cor: o nome já mudado continua
    const soCor = await chamar('put', d.cookie, `/legenda/${encodeURIComponent(chave)}`, {
      cor: 'rosa',
    })
    expect((soCor.body as LegendaDoMapa).entradas.find((e) => e.chave === chave)).toMatchObject({
      cor: 'rosa',
      nome: 'Associado',
    })
    // nome vazio volta ao padrão
    const semNome = await chamar('put', d.cookie, `/legenda/${encodeURIComponent(chave)}`, {
      nome: '',
    })
    expect((semNome.body as LegendaDoMapa).entradas.find((e) => e.chave === chave)).toMatchObject({
      nome: 'Cliente',
      cor: 'rosa',
    })
    // as opções do mapa seguem a legenda (chips com o nome novo)
    await chamar('put', d.cookie, `/legenda/${encodeURIComponent(chave)}`, { nome: 'Associado' })
    const o = (await chamar('get', d.cookie, '/opcoes')).body as OpcoesDoMapa
    expect(o.chips.find((c) => c.chave === 'cliente')).toMatchObject({
      nome: 'Associado',
      cor: 'rosa',
    })
    const volta = await chamar('post', d.cookie, '/legenda/restaurar')
    expect((volta.body as LegendaDoMapa).entradas.every((e) => !e.personalizada)).toBe(true)
  })

  it('fixos também mudam; cor fora da paleta é 400; estado desconhecido 404', async () => {
    const { d } = await cenario()
    const ok = await chamar('put', d.cookie, '/legenda/sem_visita', { cor: 'laranja' })
    expect((ok.body as LegendaDoMapa).entradas.find((e) => e.chave === 'sem_visita')?.cor).toBe(
      'laranja',
    )
    expect((await chamar('put', d.cookie, '/legenda/sem_visita', { cor: '#ff0000' })).status).toBe(
      400,
    )
    expect((await chamar('put', d.cookie, '/legenda/sem_visita', {})).status).toBe(400)
    const nao = await chamar('put', d.cookie, '/legenda/qualquer', { cor: 'azul' })
    expect(nao.status).toBe(404)
    expect(erroDe(nao)).toBe('estado_nao_encontrado')
  })

  it('gestor e vendedor leem, mas só o administrador altera', async () => {
    const { d, gestor, vendedor } = await cenario()
    for (const u of [gestor, vendedor]) {
      expect((await chamar('get', u.cookie, '/legenda')).status).toBe(200)
      const r = await chamar('put', u.cookie, '/legenda/sem_visita', { cor: 'azul' })
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('acesso_negado')
      expect((await chamar('post', u.cookie, '/legenda/restaurar')).status).toBe(403)
    }
    expect((await chamar('get', d.cookie, '/legenda')).status).toBe(200)
  })

  it('a legenda de uma empresa não vaza para outra', async () => {
    const a = await cenario()
    const b = await cenario()
    await chamar('put', a.d.cookie, '/legenda/sem_visita', { cor: 'azul', nome: 'Só da A' })
    const l = (await chamar('get', b.d.cookie, '/legenda')).body as LegendaDoMapa
    expect(l.entradas.find((e) => e.chave === 'sem_visita')).toMatchObject({
      nome: 'Sem visita há 60+ dias',
      personalizada: false,
    })
  })
})
