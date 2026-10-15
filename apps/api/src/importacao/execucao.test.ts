import type { Server } from 'node:http'

import type { AndamentoDaImportacao, LoteDeImportacao, TagGrupo } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EnviadorSmtp } from '../email/enviador.js'
import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'
import { FILAS } from '../worker/filas.js'
import { manipuladoresPadrao } from '../worker/outbox/manipuladores.js'
import type { WorkerFilas } from '../worker/worker-filas.service.js'
import { EVENTO_EXECUTAR_IMPORTACAO } from './evento.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
/** O evento do "Iniciar" serve a um relay de worker; se ficasse pendente, o worker de OUTRO teste (em paralelo) executaria este lote. Os testes só conferem que ele foi gravado. */
const tenants: string[] = []
afterEach(async () => {
  await Promise.all(tenants.splice(0).map(descartar))
  await app.close()
})

const chamar = (
  metodo: 'get' | 'post' | 'patch',
  cookie: string | undefined,
  url: string,
  corpo?: unknown,
) => {
  let r = request(app.getHttpServer())[metodo](url).set('Origin', ORIGEM_DO_FRONT)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const loteDe = (r: request.Response) => r.body as LoteDeImportacao

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

/** Lote enviado; `completo` faz as escolhas que o deixam pronta. */
async function cenario(completo = true) {
  const d = await novoDono(app)
  tenants.push(d.tenantId)
  const vendedor = await usuarioSimples(app)
  await vincular(d.tenantId, vendedor.id, 'vendedor')
  await ativar(vendedor.id, d.tenantId)
  const membroId = await noTenant(d.tenantId, async (tx) => {
    const [m] = await tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    return (m as { id: string }).id
  })
  const grupos = (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
  const cliente = (
    grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === 'cliente') as { id: string }
  ).id
  const enviado = await request(app.getHttpServer())
    .post('/v1/importacao/lotes?arquivo=a.csv')
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', d.cookie)
    .set('Content-Type', 'application/octet-stream')
    .send('CNPJ;Razão social\n11222333000181;Alfa\n11222333000262;Beta\n')
  const lote = loteDe(enviado)
  if (completo) {
    const r = await chamar('patch', d.cookie, `/v1/importacao/lotes/${lote.id}`, {
      campos: { documento: 'CNPJ', razaoSocial: 'Razão social' },
      vendedorId: membroId,
      statusTagId: cliente,
    })
    expect(loteDe(r).situacao).toBe('pronta')
  }
  return { d, vendedor, lote }
}

const descartar = (t: string) =>
  noTenant(
    t,
    (tx) =>
      tx`UPDATE eventos_outbox SET processado_em = now() WHERE tipo = 'importacao.executar' AND processado_em IS NULL`,
  )
const iniciar = async (cookie: string | undefined, id: string) => {
  const r = await chamar('post', cookie, `/v1/importacao/lotes/${id}/iniciar`)
  // já entregue: nenhum relay de outro teste pega este evento (os testes só conferem que foi gravado)
  await Promise.all(tenants.map(descartar))
  return r
}
const cancelar = (cookie: string | undefined, id: string) =>
  chamar('post', cookie, `/v1/importacao/lotes/${id}/cancelar`)
const eventos = (tenantId: string, id: string) =>
  noTenant(
    tenantId,
    (tx) => tx<{ tipo: string; payload: { importacaoId: string } }[]>`
    SELECT tipo, payload FROM eventos_outbox WHERE entidade_id = ${id} AND tipo = ${EVENTO_EXECUTAR_IMPORTACAO}`,
  )

describe('POST /v1/importacao/lotes/:id/iniciar', () => {
  it('sem sessão 401, vendedor 403; lote incompleto 409 com o que falta; lote de outra empresa 404', async () => {
    const { d, vendedor, lote } = await cenario(false)
    expect((await iniciar(undefined, lote.id)).status).toBe(401)
    expect((await iniciar(vendedor.cookie, lote.id)).status).toBe(403)
    const incompleto = await iniciar(d.cookie, lote.id)
    expect([incompleto.status, erroDe(incompleto)]).toEqual([409, 'importacao_incompleta'])
    expect((incompleto.body as RespostaDeErro).detalhes?.length).toBeGreaterThan(0)
    const outra = await cenario(true)
    const alheio = await iniciar(outra.d.cookie, lote.id)
    expect([alheio.status, erroDe(alheio)]).toEqual([404, 'importacao_nao_encontrada'])
    expect((await iniciar(d.cookie, 'nao-e-uuid')).status).toBe(400)
    expect(await eventos(d.tenantId, lote.id)).toHaveLength(0)
  })

  it('vira em andamento, grava o evento do worker na mesma transação e audita; um segundo "Iniciar" é recusado', async () => {
    const { d, lote } = await cenario()
    const r = await iniciar(d.cookie, lote.id)
    expect(r.status).toBe(200)
    expect(loteDe(r).situacao).toBe('em_andamento')
    expect(await eventos(d.tenantId, lote.id)).toEqual([
      { tipo: EVENTO_EXECUTAR_IMPORTACAO, payload: { importacaoId: lote.id } },
    ])
    const de = await noTenant(
      d.tenantId,
      (tx) =>
        tx<
          { iniciado_em: Date | null }[]
        >`SELECT iniciado_em FROM importacoes WHERE id = ${lote.id}`,
    )
    expect(de[0]?.iniciado_em).toBeTruthy()
    expect(
      (await auditoriaDe(d.tenantId)).some(
        (x) => x.entidade === 'importacao' && x.acao === 'iniciar',
      ),
    ).toBe(true)

    const de2 = await iniciar(d.cookie, lote.id)
    expect([de2.status, erroDe(de2)]).toEqual([409, 'importacao_em_andamento'])
    expect(await eventos(d.tenantId, lote.id)).toHaveLength(1)
    // com a importação em andamento as escolhas não mudam mais
    expect(
      (await chamar('patch', d.cookie, `/v1/importacao/lotes/${lote.id}`, { nome: 'X' })).status,
    ).toBe(409)
  })

  it('dois cliques juntos iniciam uma vez só (um evento)', async () => {
    const { d, lote } = await cenario()
    const [a, b] = await Promise.all([iniciar(d.cookie, lote.id), iniciar(d.cookie, lote.id)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(await eventos(d.tenantId, lote.id)).toHaveLength(1)
  })

  it('lote encerrado não reinicia (409 importacao_encerrada)', async () => {
    const { d, lote } = await cenario()
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE importacoes SET situacao = 'concluida' WHERE id = ${lote.id}`,
    )
    const r = await iniciar(d.cookie, lote.id)
    expect([r.status, erroDe(r)]).toEqual([409, 'importacao_encerrada'])
  })
})

describe('cancelar e retomar', () => {
  it('cancela o que está em andamento; fora de andamento 409; retomar agenda outra execução', async () => {
    const { d, vendedor, lote } = await cenario()
    const antes = await cancelar(d.cookie, lote.id)
    expect([antes.status, erroDe(antes)]).toEqual([409, 'importacao_nao_cancelavel'])
    await iniciar(d.cookie, lote.id)
    expect((await cancelar(vendedor.cookie, lote.id)).status).toBe(403)
    expect((await cancelar(undefined, lote.id)).status).toBe(401)
    const r = await cancelar(d.cookie, lote.id)
    expect([r.status, loteDe(r).situacao]).toEqual([200, 'cancelada'])
    const de = await cancelar(d.cookie, lote.id)
    expect([de.status, erroDe(de)]).toEqual([409, 'importacao_nao_cancelavel'])

    const retomada = await iniciar(d.cookie, lote.id)
    expect([retomada.status, loteDe(retomada).situacao]).toEqual([200, 'em_andamento'])
    expect(await eventos(d.tenantId, lote.id)).toHaveLength(2)
  })
})

describe('GET /v1/importacao/lotes/:id/andamento', () => {
  it('conta as linhas por resultado e estima o que falta pelo intervalo', async () => {
    const { d, vendedor, lote } = await cenario()
    const r = await chamar('get', d.cookie, `/v1/importacao/lotes/${lote.id}/andamento`)
    expect(r.status).toBe(200)
    expect(r.body as AndamentoDaImportacao).toEqual({
      situacao: 'pronta',
      totalLinhas: 2,
      processadas: 0,
      porResultado: { pendente: 2 },
      estimativaRestanteSegundos: 6, // 2 pendentes × 3 s
      iniciadoEm: null,
      concluidoEm: null,
    })
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE importacao_linhas SET resultado = 'criada' WHERE importacao_id = ${lote.id} AND numero = 1`,
    )
    const meio = (await chamar('get', d.cookie, `/v1/importacao/lotes/${lote.id}/andamento`))
      .body as AndamentoDaImportacao
    expect(meio).toMatchObject({
      processadas: 1,
      porResultado: { pendente: 1, criada: 1 },
      estimativaRestanteSegundos: 3,
    })

    expect(
      (await chamar('get', vendedor.cookie, `/v1/importacao/lotes/${lote.id}/andamento`)).status,
    ).toBe(403)
    expect(
      (
        await chamar(
          'get',
          d.cookie,
          '/v1/importacao/lotes/0199a000-0000-7000-8000-000000000001/andamento',
        )
      ).status,
    ).toBe(404)
  })
})

describe('o evento chega ao worker', () => {
  it('o manipulador do outbox enfileira a execução na fila "importacao", com o id do evento como jobId', async () => {
    const adicionar = vi.fn(() => Promise.resolve(undefined))
    const fila = vi.fn(() => ({ add: adicionar }))
    const filas = { fila } as unknown as WorkerFilas
    const manipuladores = manipuladoresPadrao(
      configuracaoDeTeste(),
      new EnviadorSmtp(configuracaoDeTeste(), pino({ level: 'silent' })),
    )
    const manipulador = manipuladores[EVENTO_EXECUTAR_IMPORTACAO]
    expect(manipulador).toBeDefined()
    await manipulador?.(
      {
        id: 'evento-1',
        tenantId: 'tenant-1',
        tipo: EVENTO_EXECUTAR_IMPORTACAO,
        payload: { importacaoId: 'lote-1' },
      } as never,
      { tx: {} as never, filas },
    )
    expect(fila).toHaveBeenCalledWith(FILAS.importacao)
    expect(adicionar).toHaveBeenCalledWith(
      'executar',
      { tenantId: 'tenant-1', importacaoId: 'lote-1' },
      expect.objectContaining({ jobId: 'evento-evento-1', attempts: 3 }),
    )
  })
})
