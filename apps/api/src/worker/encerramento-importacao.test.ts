import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import { completarCnpj, type LoteDeImportacao, type TagGrupo } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  respostaDaReceita,
  type ServidorFalso,
  subirServidorFalso,
} from '../receita/servidor-falso.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { esperarAte } from '../testes/espera.js'
import { dono, novoDono } from '../testes/mundo.js'
import { compilarApi, subirWorker, type WorkerFilho } from '../testes/processo-worker.js'
import { criarFila, FILAS } from './filas.js'

// Deploy no meio de uma importação: o worker recebe SIGTERM com DOIS consumidores ativos (um job da
// fila de teste e a importação). Os dois têm de ser tratados: o primeiro termina e é marcado como
// concluído; a importação para antes da próxima linha e o job volta para a fila (nada de job "travado"
// que roda de novo do começo nem de linha importada duas vezes). Todas as planilhas e respostas da
// Receita são inventadas aqui.

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 2 })
// 30 linhas a ~0,7 s cada (Receita falsa de 200 ms + espera mínima de 500 ms entre consultas): a importação dura ~21 s, o bastante para o
// SIGTERM e o SIGKILL caírem no meio (eram 40 linhas a ~0,8 s: 85 s nos dois testes; a espera mínima do banco é 500 ms)
const LINHAS = 30

let app: INestApplication<Server>
let receita: ServidorFalso
let prefixo = ''
const filhos: WorkerFilho[] = []
const filas: Queue[] = []

beforeAll(async () => {
  compilarApi()
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO portes (codigo, descricao) VALUES (3, 'Empresa de Pequeno Porte') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO qualificacoes_socio (codigo, descricao) VALUES (49, 'Sócio-Administrador') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'VITORIA', 'ES') ON CONFLICT DO NOTHING`
}, 120_000)
afterAll(async () => {
  await banco.cliente.end({ timeout: 5 })
  await valkey.quit()
  await dono.end()
})
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
  // A "Receita" demora um pouco por consulta: a importação leva cerca de 21 s no total
  receita = await subirServidorFalso((caminho) => ({
    status: 200,
    corpo: respostaDaReceita(caminho.replace('/', '')),
    atrasoMs: 200,
  }))
})
afterEach(async () => {
  for (const f of filhos.splice(0)) if (f.processo.exitCode === null) f.processo.kill('SIGKILL')
  for (const q of filas.splice(0)) {
    await q.obliterate({ force: true }).catch(() => undefined)
    await q.close()
  }
  await receita.fechar()
  await app.close()
})

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

const iniciarWorker = async () => {
  const f = await subirWorker({
    FILA_PREFIXO: prefixo,
    FILA_LOCK_MS: '3000',
    WORKER_ENCERRAMENTO_S: '20',
    OUTBOX_INTERVALO_MS: '300',
    MINHA_RECEITA_URL: receita.url,
    BRASILAPI_URL: receita.url,
  })
  filhos.push(f)
  await f.aguardarPronto()
  return f
}
const fila = (nome: typeof FILAS.teste | typeof FILAS.importacao) => {
  const q = criarFila(nome, configuracaoDeTeste({ FILA_PREFIXO: prefixo, LOG_LEVEL: 'silent' }))
  filas.push(q)
  return q
}

/** Empresa nova com uma planilha de 30 CNPJs inventados, pronta para iniciar (Receita falsa, 200 ms por consulta). */
async function prepararImportacao() {
  prefixo = `leadtogo:fila:imp${Date.now()}`
  const d = await novoDono(app)
  const membroId = await noTenant(d.tenantId, async (tx) => {
    const [m] = await tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    return (m as { id: string }).id
  })
  const grupos = (
    await request(app.getHttpServer())
      .get('/v1/configuracoes/tag-grupos')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
  ).body as TagGrupo[]
  const cliente = (
    grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === 'cliente') as { id: string }
  ).id
  const base = Date.now() % 100_000
  const cnpjs = Array.from({ length: LINHAS }, (_, i) =>
    completarCnpj(
      `9${String(base).padStart(5, '0')}${String(i).padStart(2, '0')}0001`.slice(0, 12),
    ),
  )
  const csv = `CNPJ;Razão social\n${cnpjs.map((c, i) => `${c};Empresa ${i}`).join('\n')}\n`
  const lote = (
    await request(app.getHttpServer())
      .post('/v1/importacao/lotes?arquivo=deploy.csv')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
      .set('Content-Type', 'application/octet-stream')
      .send(csv)
  ).body as LoteDeImportacao
  const ajustado = await request(app.getHttpServer())
    .patch(`/v1/importacao/lotes/${lote.id}`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', d.cookie)
    .send({
      fonteDados: 'receita',
      campos: { documento: 'CNPJ', razaoSocial: 'Razão social' },
      vendedorId: membroId,
      statusTagId: cliente,
    })
  expect(ajustado.status).toBe(200)
  // a espera entre consultas é fixa na API (3 s); o teste usa um ajuste interno curto para não levar minutos
  await noTenant(
    d.tenantId,
    (tx) => tx`UPDATE importacoes SET intervalo_ms = 500 WHERE id = ${lote.id}`,
  )

  const processadas = () =>
    noTenant(d.tenantId, async (tx) => {
      const [r] = await tx<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM importacao_linhas WHERE importacao_id = ${lote.id} AND resultado <> 'pendente'`
      return r?.n ?? 0
    })
  const situacao = async () =>
    (
      await noTenant(
        d.tenantId,
        (tx) =>
          tx<{ s: string }[]>`SELECT situacao::text AS s FROM importacoes WHERE id = ${lote.id}`,
      )
    )[0]?.s
  const iniciar = () =>
    request(app.getHttpServer())
      .post(`/v1/importacao/lotes/${lote.id}/iniciar`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
  const empresasDoLote = () =>
    noTenant(
      d.tenantId,
      (tx) =>
        tx<
          { documento: string }[]
        >`SELECT documento FROM empresas WHERE importacao_id = ${lote.id}`,
    )
  return { d, lote, cnpjs, processadas, situacao, iniciar, empresasDoLote }
}

const jobsDoLote = async () =>
  (await fila(FILAS.importacao).getJobs(['delayed', 'waiting', 'active', 'prioritized'])).length

describe('worker: SIGTERM com dois consumidores ativos (e-mail/teste e importação)', () => {
  it('o job comum termina e é marcado; o bloco da importação fecha na linha e agenda o próximo; o worker seguinte conclui sem repetir', async () => {
    const { cnpjs, processadas, situacao, iniciar, empresasDoLote } = await prepararImportacao()
    const w1 = await iniciarWorker()
    // "Iniciar": o evento vai ao outbox, o relay do worker o entrega e a importação começa a andar
    expect((await iniciar()).status).toBe(200)
    await esperarAte(async () => (await processadas()) >= 2, 30_000)

    // o segundo consumidor ativo: um job comum de 4 s, em andamento junto da importação
    const filaComum = fila(FILAS.teste)
    const comum = await filaComum.add('espera', {
      ms: 4000,
      chave: `${prefixo}:feito:comum`,
    })
    await esperarAte(async () => (await comum.getState()) === 'active')

    w1.processo.kill('SIGTERM')
    const saida = await w1.aguardarSaida(25_000)
    expect(saida.codigo).toBe(0)
    // saiu logo depois de o job comum terminar (4 s) e a importação fechar o bloco na linha, bem antes
    // do prazo de 20 s e de a importação inteira (cerca de 21 s)
    expect(saida.emMs).toBeLessThan(12_000)
    expect(w1.saida()).toContain('"noPrazo":true')

    // o job comum foi marcado como concluído (e não "travado" nem falho)
    expect(await valkey.get(`${prefixo}:feito:comum`)).toBe(comum.id)
    const estado = async () => {
      const s = await comum.getState()
      if (s === 'failed') {
        const atual = await filaComum.getJob(comum.id ?? '')
        throw new Error(`o job comum falhou: ${atual?.failedReason ?? 'motivo desconhecido'}`)
      }
      return s
    }
    await esperarAte(async () => (await estado()) === 'completed')

    // a importação parou no meio: lote em andamento, parte das linhas feita, e o PRÓXIMO bloco já
    // agendado na fila (o bloco que parou foi concluído, não ficou "travado")
    const feitas = await processadas()
    expect(feitas).toBeGreaterThanOrEqual(2)
    expect(feitas).toBeLessThan(LINHAS)
    expect(await situacao()).toBe('em_andamento')
    expect(await jobsDoLote()).toBe(1)

    // o worker seguinte pega o próximo bloco e termina: cada CNPJ foi à Receita e à carteira uma vez só
    await iniciarWorker()
    await esperarAte(async () => (await situacao()) === 'concluida', 90_000)
    expect((await empresasDoLote()).map((e) => e.documento).sort()).toEqual([...cnpjs].sort())
    // Só conta os CNPJs do lote: o worker consome o outbox do banco inteiro e pode consultar também um
    // CNPJ de fora (evento que sobrou de outro teste), o que não diz nada sobre esta importação
    const consultasDoLote = cnpjs.map((c) => receita.chamadas.filter((k) => k.includes(c)).length)
    expect(consultasDoLote).toEqual(Array.from({ length: LINHAS }, () => 1))
  }, 150_000)
})

describe('worker: morte brusca (SIGKILL) no meio da importação', () => {
  it('sem encerramento gracioso: o outro worker retoma e termina, sem empresa duplicada nem linha perdida', async () => {
    const { lote, cnpjs, processadas, situacao, iniciar, empresasDoLote, d } =
      await prepararImportacao()
    const w1 = await iniciarWorker()
    expect((await iniciar()).status).toBe(200)
    await esperarAte(async () => (await processadas()) >= 3, 30_000)

    // sem aviso nenhum: nada de SIGTERM, o processo some com o bloco no meio
    w1.processo.kill('SIGKILL')
    await w1.aguardarSaida(10_000)
    const antes = await processadas()
    expect(antes).toBeLessThan(LINHAS)
    expect(await situacao()).toBe('em_andamento')

    // o job do bloco fica "ativo" até o lock vencer (3 s); o BullMQ o devolve e o novo worker continua
    await iniciarWorker()
    await esperarAte(async () => (await situacao()) === 'concluida', 120_000)

    const linhas = await noTenant(
      d.tenantId,
      (tx) =>
        tx<
          { resultado: string }[]
        >`SELECT resultado::text AS resultado FROM importacao_linhas WHERE importacao_id = ${lote.id}`,
    )
    expect(linhas).toHaveLength(LINHAS) // nenhuma linha perdida
    expect(linhas.every((l) => l.resultado === 'criada')).toBe(true)
    const empresas = (await empresasDoLote()).map((e) => e.documento)
    expect(empresas).toHaveLength(LINHAS) // nenhuma empresa duplicada (nem faltando)
    expect([...empresas].sort()).toEqual([...cnpjs].sort())
  }, 200_000)
})
