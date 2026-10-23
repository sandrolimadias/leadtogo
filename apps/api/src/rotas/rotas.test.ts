import { createServer, type Server as ServidorHttp } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type {
  ConfiguracaoDeRotas,
  ListaDeRotas,
  OrdemOtimizada,
  ParadasAdicionadas,
  PontoDePartida,
  RelatorioDeVisita,
  ResultadoDeVisita,
  Rota,
  RotaDaEmpresa,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

// Empresas e posições FICTÍCIAS (perto de Vitória só por conveniência). O VROOM e o OSRM são um servidor
// HTTP falso: o cliente real (RoteirizadorVroomOsrm) é exercitado de ponta a ponta.

/** VROOM falso: devolve as paradas na ordem INVERSA (para a troca de ordem aparecer). OSRM falso: 1 km e 2 min por trecho. */
let servicoForaDoAr = false
let chamadasAoVroom = 0
const falso: ServidorHttp = createServer((req, res) => {
  if (servicoForaDoAr) {
    res.writeHead(503).end()
    return
  }
  let corpo = ''
  req.on('data', (c: Buffer) => (corpo += c.toString()))
  req.on('end', () => {
    res.setHeader('content-type', 'application/json')
    if (req.method === 'POST') {
      chamadasAoVroom += 1
      const { jobs } = JSON.parse(corpo) as { jobs: { id: number }[] }
      const passos = [...jobs].reverse().map((j) => ({ type: 'job', job: j.id }))
      res.end(JSON.stringify({ code: 0, unassigned: [], routes: [{ steps: passos }] }))
      return
    }
    const m = /\/route\/v1\/driving\/([^?]+)/.exec(req.url ?? '')
    const pontos = (m?.[1] ?? '').split(';').map((p) => p.split(',').map(Number))
    res.end(
      JSON.stringify({
        code: 'Ok',
        routes: [
          {
            legs: pontos.slice(1).map(() => ({ distance: 1000, duration: 120 })),
            geometry: { coordinates: pontos },
          },
        ],
      }),
    )
  })
})

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
let semServico: INestApplication<Server>
let comServico: INestApplication<Server>

beforeAll(async () => {
  await new Promise<void>((ok) => falso.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${(falso.address() as AddressInfo).port}`
  await limparLimitesAuth(valkey)
  semServico = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
  comServico = await criarAppComRotas(
    [],
    configuracaoDeTeste({
      TRUST_PROXY: '1',
      VROOM_URL: url,
      OSRM_URL: url,
      ROTA_TEMPO_LIMITE_S: '2',
    }),
  )
})
afterAll(async () => {
  await semServico.close()
  await comServico.close()
  await new Promise((ok) => falso.close(ok))
  await valkey.quit()
  await dono.end()
})

type Metodo = 'get' | 'put' | 'post' | 'patch' | 'delete'
let ip = 0
const chamarEm =
  (app: () => INestApplication<Server>) =>
  (metodo: Metodo, cookie: string, url: string, corpo?: unknown) => {
    ip += 1
    const r = request(app().getHttpServer())
      [metodo](`/v1${url}`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('X-Forwarded-For', `10.8.${Math.floor(ip / 250)}.${ip % 250}`)
      .set('Cookie', cookie)
    return corpo === undefined ? r : r.send(corpo as object)
  }
const chamar = chamarEm(() => semServico)
const chamarCom = chamarEm(() => comServico)
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

async function cenario() {
  const d = await novoDono(semServico)
  const vendedor = await usuarioSimples(semServico)
  await vincular(d.tenantId, vendedor.id, 'vendedor')
  await ativar(vendedor.id, d.tenantId)
  const outro = await usuarioSimples(semServico)
  await vincular(d.tenantId, outro.id, 'vendedor')
  await ativar(outro.id, d.tenantId)
  const gestor = await usuarioSimples(semServico)
  await vincular(d.tenantId, gestor.id, 'gestor')
  await ativar(gestor.id, d.tenantId)
  const membros = await noTenant(
    d.tenantId,
    (tx) => tx<{ id: string; usuario_id: string }[]>`SELECT id, usuario_id FROM membros`,
  )
  const idDe = (u: string) => membros.find((m) => m.usuario_id === u)?.id as string
  let n = 0
  const empresa = async (vendedorId = idDe(vendedor.id), comPosicao = true) => {
    const id = novoId()
    n += 1
    const lat = -20.3 - n / 100
    await noTenant(
      d.tenantId,
      (
        tx,
      ) => tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id, bairro, localizacao, geo_precisao, geo_origem)
        VALUES (${id}, ${d.tenantId}, ${`Empresa ${n}`}, ${vendedorId}, 'Centro',
          ${comPosicao ? tx`ST_SetSRID(ST_MakePoint(-40.3, ${lat}), 4326)::geography` : null},
          ${comPosicao ? 'exata' : null}::geo_precisao, ${comPosicao ? 'cnefe' : null}::geo_origem)`,
    )
    return id
  }
  return { d, vendedor, outro, gestor, idDe, empresa }
}

const rotaBase = (empresaIds: string[], extra: Record<string, unknown> = {}) => ({
  nome: 'Grande Vitória · segunda',
  data: hoje(),
  partida: 'posicao_atual',
  voltarAoInicio: false,
  empresaIds,
  ...extra,
})

describe('/v1/rotas sem o serviço de rotas', () => {
  it('a otimização fica desligada; a rota se monta à mão, com estimativa em linha reta e código sequencial', async () => {
    const c = await cenario()
    const conf = (await chamar('get', c.vendedor.cookie, '/rotas/configuracao'))
      .body as ConfiguracaoDeRotas
    expect(conf).toEqual({ minutosPorVisita: 40, maxParadas: 30, otimizacaoConfigurada: false })

    const [a, b] = [await c.empresa(), await c.empresa()]
    const o = await chamar('post', c.vendedor.cookie, '/rotas/otimizar', {
      partida: 'posicao_atual',
      voltarAoInicio: false,
      empresaIds: [a, b],
    })
    expect(o.status).toBe(409)
    expect(erroDe(o)).toBe('rotas_nao_configuradas')

    const r1 = await chamar('post', c.vendedor.cookie, '/rotas', rotaBase([a, b]))
    expect(r1.status).toBe(201)
    const rota = r1.body as Rota
    expect(rota).toMatchObject({
      codigo: 1,
      situacao: 'planejada',
      estimativa: 'linha_reta',
      trajeto: null,
      minutosPorVisita: 40,
      podeEditar: true,
      responsavel: { id: c.idDe(c.vendedor.id) },
    })
    expect(rota.paradas.map((p) => [p.empresaId, p.ordem])).toEqual([
      [a, 1],
      [b, 2],
    ])
    // sem a posição atual, a primeira parada não tem trecho; a segunda, ~1,1 km × 1,3
    expect(rota.paradas[0]?.distanciaTrechoM).toBeNull()
    expect(rota.paradas[1]?.distanciaTrechoM).toBeGreaterThan(1300)
    const r2 = await chamar('post', c.vendedor.cookie, '/rotas', rotaBase([a]))
    expect((r2.body as Rota).codigo).toBe(2)

    const aud = await auditoriaDe(c.d.tenantId)
    expect(aud).toContainEqual(expect.objectContaining({ entidade: 'rota', acao: 'criar' }))
  })

  it('a posição atual entra no cálculo e não é gravada', async () => {
    const c = await cenario()
    const a = await c.empresa()
    const r = await chamar(
      'post',
      c.vendedor.cookie,
      '/rotas',
      rotaBase([a], { posicaoAtual: { latitude: -20.2, longitude: -40.3 }, voltarAoInicio: true }),
    )
    const rota = r.body as Rota
    expect(rota.paradas[0]?.distanciaTrechoM).toBeGreaterThan(10_000)
    // ida e volta
    expect(rota.distanciaM).toBeGreaterThan(2 * 10_000)
    const colunas = await noTenant(
      c.d.tenantId,
      (tx) => tx`SELECT * FROM rotas WHERE id = ${rota.id}`,
    )
    expect(JSON.stringify(colunas)).not.toContain('-20.2')
  })

  it('paradas: sem posição, fora da carteira do responsável e acima de 30 são recusadas', async () => {
    const c = await cenario()
    const semPosicao = await c.empresa(undefined, false)
    const r = await chamar('post', c.vendedor.cookie, '/rotas', rotaBase([semPosicao]))
    expect(r.status).toBe(400)
    expect(erroDe(r)).toBe('parada_invalida')

    // o gestor vê a empresa do outro vendedor, mas o vendedor (responsável) não
    const doOutro = await c.empresa(c.idDe(c.outro.id))
    const g = await chamar(
      'post',
      c.gestor.cookie,
      '/rotas',
      rotaBase([doOutro], { responsavelId: c.idDe(c.vendedor.id) }),
    )
    expect(g.status).toBe(400)
    expect(erroDe(g)).toBe('parada_invalida')

    const muitas = Array.from({ length: 31 }, () => novoId())
    expect((await chamar('post', c.vendedor.cookie, '/rotas', rotaBase(muitas))).status).toBe(400)
  })

  it('permissões: o vendedor só monta e vê as próprias; o gestor monta para ele (atribuir)', async () => {
    const c = await cenario()
    const a = await c.empresa()
    const paraOGestor = await chamar(
      'post',
      c.vendedor.cookie,
      '/rotas',
      rotaBase([a], { responsavelId: c.idDe(c.gestor.id) }),
    )
    expect(paraOGestor.status).toBe(403)

    const doGestor = await chamar(
      'post',
      c.gestor.cookie,
      '/rotas',
      rotaBase([a], { responsavelId: c.idDe(c.vendedor.id) }),
    )
    expect(doGestor.status).toBe(201)
    const propriaDoGestor = (await chamar('post', c.gestor.cookie, '/rotas', rotaBase([a])))
      .body as Rota

    const lista = (await chamar('get', c.vendedor.cookie, '/rotas')).body as ListaDeRotas
    expect(lista.itens.map((i) => i.id)).toEqual([(doGestor.body as Rota).id])
    expect((await chamar('get', c.vendedor.cookie, `/rotas/${propriaDoGestor.id}`)).status).toBe(
      404,
    )
    expect(
      (await chamar('get', c.outro.cookie, `/rotas/${(doGestor.body as Rota).id}`)).status,
    ).toBe(404)
    const todas = (await chamar('get', c.gestor.cookie, '/rotas')).body as ListaDeRotas
    expect(todas.total).toBe(2)
  })

  it('salvar regrava a ordem; adicionar conta o que entrou, o que já estava e o que não serve', async () => {
    const c = await cenario()
    const [a, b, x] = [await c.empresa(), await c.empresa(), await c.empresa()]
    const rota = (await chamar('post', c.vendedor.cookie, '/rotas', rotaBase([a, b]))).body as Rota
    const salvo = (
      await chamar(
        'put',
        c.vendedor.cookie,
        `/rotas/${rota.id}`,
        rotaBase([b, a], { nome: 'Nova' }),
      )
    ).body as Rota
    expect(salvo.nome).toBe('Nova')
    expect(salvo.paradas.map((p) => p.empresaId)).toEqual([b, a])

    const semPosicao = await c.empresa(undefined, false)
    const ad = (
      await chamar('post', c.vendedor.cookie, `/rotas/${rota.id}/paradas`, {
        empresaIds: [a, x, semPosicao],
      })
    ).body as ParadasAdicionadas
    expect(ad).toMatchObject({ adicionadas: 1, jaNaRota: 1, ignoradas: 1, excedentes: 0 })
    expect(ad.rota.paradas.map((p) => p.empresaId)).toEqual([b, a, x])

    const daEmpresa = (await chamar('get', c.vendedor.cookie, `/rotas/empresa/${x}`))
      .body as RotaDaEmpresa[]
    expect(daEmpresa).toEqual([expect.objectContaining({ rotaId: rota.id, ordem: 3 })])
  })

  it('pular pede motivo; encerrar pula as pendentes; rota fechada não muda', async () => {
    const c = await cenario()
    const [a, b] = [await c.empresa(), await c.empresa()]
    const rota = (await chamar('post', c.vendedor.cookie, '/rotas', rotaBase([a, b]))).body as Rota
    const [p1] = rota.paradas
    const semMotivo = await chamar(
      'post',
      c.vendedor.cookie,
      `/rotas/${rota.id}/paradas/${p1?.id}/pular`,
      { motivo: '' },
    )
    expect(semMotivo.status).toBe(400)
    const pulou = (
      await chamar('post', c.vendedor.cookie, `/rotas/${rota.id}/paradas/${p1?.id}/pular`, {
        motivo: 'Fechada',
      })
    ).body as Rota
    expect(pulou.situacao).toBe('em_andamento')
    expect(pulou.paradas[0]).toMatchObject({ situacao: 'pulada', motivoPulo: 'Fechada' })

    // a parada pulada não sai da rota
    const tirar = await chamar('put', c.vendedor.cookie, `/rotas/${rota.id}`, rotaBase([b]))
    expect(tirar.status).toBe(409)
    expect(erroDe(tirar)).toBe('parada_resolvida')

    const encerrada = (await chamar('post', c.vendedor.cookie, `/rotas/${rota.id}/encerrar`))
      .body as Rota
    expect(encerrada.situacao).toBe('concluida')
    expect(encerrada.paradas[1]).toMatchObject({ situacao: 'pulada', motivoPulo: 'Rota encerrada' })
    expect(encerrada.podeEditar).toBe(false)
    const depois = await chamar('post', c.vendedor.cookie, `/rotas/${rota.id}/cancelar`)
    expect(depois.status).toBe(409)
    expect(erroDe(depois)).toBe('rota_fechada')
  })

  it('pontos de partida: só quem gere cadastros; usado em rota só se inativa', async () => {
    const c = await cenario()
    const corpo = {
      nome: 'Sede',
      endereco: 'Av. Central, 100',
      latitude: -20.25,
      longitude: -40.27,
      padrao: true,
    }
    expect(
      (await chamar('post', c.vendedor.cookie, '/configuracoes/rotas/pontos', corpo)).status,
    ).toBe(403)
    const ponto = (await chamar('post', c.d.cookie, '/configuracoes/rotas/pontos', corpo))
      .body as PontoDePartida
    expect(ponto).toMatchObject({ nome: 'Sede', padrao: true, latitude: -20.25, longitude: -40.27 })
    expect(
      erroDe(
        await chamar('post', c.d.cookie, '/configuracoes/rotas/pontos', {
          ...corpo,
          padrao: false,
        }),
      ),
    ).toBe('nome_repetido')

    const a = await c.empresa()
    const rota = (
      await chamar(
        'post',
        c.vendedor.cookie,
        '/rotas',
        rotaBase([a], { partida: 'ponto', pontoPartidaId: ponto.id, voltarAoInicio: true }),
      )
    ).body as Rota
    expect(rota.pontoPartida).toMatchObject({ id: ponto.id, nome: 'Sede' })
    const ex = await chamar('delete', c.d.cookie, `/configuracoes/rotas/pontos/${ponto.id}`)
    expect(ex.status).toBe(409)
    expect(erroDe(ex)).toBe('ponto_em_uso')

    const minutos = await chamar('put', c.d.cookie, '/configuracoes/rotas', {
      minutosPorVisita: 30,
    })
    expect((minutos.body as ConfiguracaoDeRotas).minutosPorVisita).toBe(30)
  })

  it('isolamento: a rota de outra empresa não aparece', async () => {
    const c = await cenario()
    const outra = await cenario()
    const a = await c.empresa()
    const rota = (await chamar('post', c.d.cookie, '/rotas', rotaBase([a]))).body as Rota
    expect((await chamar('get', outra.d.cookie, `/rotas/${rota.id}`)).status).toBe(404)
  })
})

describe('/v1/rotas com o serviço de rotas (VROOM e OSRM falsos)', () => {
  it('otimizar devolve a ordem do VROOM; salvar grava o trajeto pelas ruas', async () => {
    const c = await cenario()
    const [a, b, x] = [await c.empresa(), await c.empresa(), await c.empresa()]
    const conf = (await chamarCom('get', c.vendedor.cookie, '/rotas/configuracao'))
      .body as ConfiguracaoDeRotas
    expect(conf.otimizacaoConfigurada).toBe(true)
    const antes = chamadasAoVroom
    const o = (
      await chamarCom('post', c.vendedor.cookie, '/rotas/otimizar', {
        partida: 'posicao_atual',
        voltarAoInicio: true,
        empresaIds: [a, b, x],
        posicaoAtual: { latitude: -20.25, longitude: -40.3 },
      })
    ).body as OrdemOtimizada
    expect(chamadasAoVroom).toBe(antes + 1)
    expect(o).toMatchObject({ empresaIds: [x, b, a], estimativa: 'ruas', aviso: null })
    // 3 paradas + a volta: 4 trechos de 1 km
    expect(o.distanciaM).toBe(4000)

    const rota = (
      await chamarCom(
        'post',
        c.vendedor.cookie,
        '/rotas',
        rotaBase(o.empresaIds, { otimizada: true, voltarAoInicio: true }),
      )
    ).body as Rota
    expect(rota).toMatchObject({ estimativa: 'ruas', distanciaM: 2000, duracaoS: 240 })
    expect(rota.otimizadaEm).not.toBeNull()
    expect(rota.trajeto).toHaveLength(3)
    expect(rota.paradas.map((p) => p.distanciaTrechoM)).toEqual([null, 1000, 1000])
  })

  it('serviço fora do ar: a ordem sai em linha reta, com o aviso', async () => {
    const c = await cenario()
    const [a, b] = [await c.empresa(), await c.empresa()]
    servicoForaDoAr = true
    try {
      const o = (
        await chamarCom('post', c.vendedor.cookie, '/rotas/otimizar', {
          partida: 'posicao_atual',
          voltarAoInicio: false,
          empresaIds: [b, a],
          posicaoAtual: { latitude: -20.25, longitude: -40.3 },
        })
      ).body as OrdemOtimizada
      expect(o).toMatchObject({
        empresaIds: [a, b],
        estimativa: 'linha_reta',
        aviso: 'indisponivel',
      })
      const rota = (await chamarCom('post', c.vendedor.cookie, '/rotas', rotaBase([a, b])))
        .body as Rota
      expect(rota.estimativa).toBe('linha_reta')
    } finally {
      servicoForaDoAr = false
    }
  })
})

describe('execução da rota pelo check-in (G4b)', () => {
  it('check-in numa parada da rota de hoje liga a visita; concluir a marca visitada e termina a rota', async () => {
    const c = await cenario()
    const [a, b] = [await c.empresa(), await c.empresa()]
    const rota = (await chamar('post', c.vendedor.cookie, '/rotas', rotaBase([a, b]))).body as Rota
    const resultados = (await chamar('get', c.d.cookie, '/configuracoes/visitas/resultados'))
      .body as ResultadoDeVisita[]
    const realizada = resultados.find((r) => r.nome === 'Retornar depois') as ResultadoDeVisita

    const visitar = async (empresaId: string) => {
      const id = novoId()
      const base = { empresaId, resultadoId: null, respostas: [], concluir: false }
      const chk = await chamar('put', c.vendedor.cookie, `/visitas/${id}`, {
        ...base,
        checkin: {
          em: new Date(Date.now() - 60_000).toISOString(),
          posicao: { latitude: -20.31, longitude: -40.3 },
          offline: false,
        },
      })
      expect(chk.status).toBe(200)
      return { id, base, rel: chk.body as RelatorioDeVisita }
    }

    const v1 = await visitar(a)
    let atual = (await chamar('get', c.vendedor.cookie, `/rotas/${rota.id}`)).body as Rota
    expect(atual.situacao).toBe('em_andamento')
    expect(atual.paradas[0]).toMatchObject({
      situacao: 'pendente',
      atividadeId: v1.rel.atividadeId,
    })

    const concluir = (v: { id: string; base: Record<string, unknown> }) =>
      chamar('put', c.vendedor.cookie, `/visitas/${v.id}`, {
        ...v.base,
        checkin: null,
        resultadoId: realizada.id,
        concluir: true,
      })
    expect((await concluir(v1)).status).toBe(200)
    atual = (await chamar('get', c.vendedor.cookie, `/rotas/${rota.id}`)).body as Rota
    expect(atual.paradas[0]?.situacao).toBe('visitada')
    expect(atual.situacao).toBe('em_andamento')

    const v2 = await visitar(b)
    expect((await concluir(v2)).status).toBe(200)
    atual = (await chamar('get', c.vendedor.cookie, `/rotas/${rota.id}`)).body as Rota
    expect(atual.situacao).toBe('concluida')
    expect(atual.concluidaEm).not.toBeNull()

    const hojeLista = (await chamar('get', c.vendedor.cookie, '/rotas/hoje')).body as Rota[]
    expect(hojeLista.map((r) => r.id)).toEqual([rota.id])
  })

  it('a visita não se liga à rota de outro dia nem à rota de outra pessoa', async () => {
    const c = await cenario()
    const a = await c.empresa()
    const amanha = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', {
      timeZone: 'America/Sao_Paulo',
    })
    const rota = (
      await chamar('post', c.vendedor.cookie, '/rotas', rotaBase([a], { data: amanha }))
    ).body as Rota
    const id = novoId()
    await chamar('put', c.vendedor.cookie, `/visitas/${id}`, {
      empresaId: a,
      resultadoId: null,
      respostas: [],
      concluir: false,
      checkin: null,
    })
    const atual = (await chamar('get', c.vendedor.cookie, `/rotas/${rota.id}`)).body as Rota
    expect(atual).toMatchObject({ situacao: 'planejada' })
    expect(atual.paradas[0]?.atividadeId).toBeNull()
  })
})
