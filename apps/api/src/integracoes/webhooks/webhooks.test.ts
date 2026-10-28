/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- os corpos JSON do supertest chegam como any */
import { createHmac } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

import { criarConexao, sql } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../../testes/app-teste.js'
import { cnpjUnico } from '../../testes/auth-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../../testes/chamados.js'
import { esperarAte } from '../../testes/espera.js'
import { ligar2fa } from '../../testes/mundo.js'
import { subirWorkerDeTeste } from '../../testes/worker-teste.js'
import { assinar, conferirUrl, enderecoProibido, entregar } from './entrega.js'
import { emitirEvento, SILENCIO } from './eventos.js'
import { processadorDeWebhooks } from './processador.js'

// ---------------------------------------------------------------------------------------------- destino falso

interface Recebido {
  cabecalhos: http.IncomingHttpHeaders
  corpo: string
}
const recebidos: Recebido[] = []
let respostaDoDestino = 200
const destino = http.createServer((req, res) => {
  const partes: Buffer[] = []
  req.on('data', (p: Buffer) => partes.push(p))
  req.on('end', () => {
    recebidos.push({ cabecalhos: req.headers, corpo: Buffer.concat(partes).toString('utf8') })
    if (respostaDoDestino === 302) {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' })
      res.end()
      return
    }
    res.writeHead(respostaDoDestino, { 'Content-Type': 'text/plain' })
    res.end(respostaDoDestino < 300 ? 'ok' : 'erro do destino')
  })
})
let urlDoDestino = ''

const TROCA = { TRUST_PROXY: '1', WEBHOOK_HOSTS_INTERNOS: '127.0.0.1', WEBHOOK_TIMEOUT_MS: '3000' }
let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 2 })
const crm = chamarEm(() => app)

beforeAll(async () => {
  await new Promise<void>((r) => destino.listen(0, '127.0.0.1', r))
  urlDoDestino = `http://127.0.0.1:${(destino.address() as AddressInfo).port}/gancho`
  app = await criarAppComRotas([], configuracaoDeTeste(TROCA))
  worker = await subirWorkerDeTeste(TROCA)
})
afterAll(async () => {
  await worker.parar()
  await app.close()
  await banco.cliente.end({ timeout: 5 })
  await new Promise((r) => destino.close(r))
})
beforeEach(() => {
  recebidos.length = 0
  respostaDoDestino = 200
})

let ip = 0
const comChave = (token: string) => (metodo: 'post' | 'put', url: string, corpo?: unknown) => {
  ip += 1
  const r = request(app.getHttpServer())
    [metodo](`/v1/publica${url}`)
    .set('X-Forwarded-For', `10.66.${Math.floor(ip / 250)}.${ip % 250}`)
    .set('Authorization', `Bearer ${token}`)
  return corpo === undefined ? r : r.send(corpo as object)
}

async function cenario(eventos: string[] = ['empresa.criada', 'empresa.tag_alterada']) {
  const { d, pessoa } = await empresaDeChamados(app)
  const vendedora = await pessoa('Vendedora', { 'empresas.ver': 'propria' })
  const chave = await crm('post', d.cookie, '/integracoes/chaves', {
    nome: 'n8n',
    permissoes: ['empresas.ver', 'empresas.criar', 'empresas.editar'],
    responsavelPadraoId: vendedora.membroId,
  })
  expect(chave.status, JSON.stringify(chave.body)).toBe(201)
  const w = await crm('post', d.cookie, '/integracoes/webhooks', {
    descricao: 'n8n — eventos',
    url: urlDoDestino,
    eventos,
  })
  expect(w.status, JSON.stringify(w.body)).toBe(201)
  return {
    d,
    api: comChave((chave.body as { token: string }).token),
    webhookId: w.body.webhook.id as string,
    segredo: w.body.segredo as string,
  }
}

const confere = (corpo: string, assinatura: string, segredo: string) => {
  const t = /t=(\d+)/.exec(assinatura)?.[1] ?? ''
  const esperada = createHmac('sha256', segredo).update(`${t}.${corpo}`).digest('hex')
  return assinatura.split(',').some((p) => p === `v1=${esperada}`)
}

const entregas = (tenantId: string, webhookId: string) =>
  noTenant(
    tenantId,
    (tx) => tx<
      {
        id: string
        tipo: string
        situacao: string
        tentativas: number
        status_http: number | null
        erro: string | null
        proxima_tentativa_em: Date | null
      }[]
    >`SELECT id, tipo, situacao, tentativas, status_http, erro, proxima_tentativa_em
      FROM webhook_entregas WHERE webhook_id = ${webhookId} ORDER BY criado_em`,
  )

describe('webhooks: entrega de ponta a ponta', () => {
  it('empresa criada pela API pública chega assinada, com o envelope e o ator "integração"', async () => {
    const { d, api, webhookId, segredo } = await cenario()
    const r = await api('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Avisada Ltda',
      consultar_receita: false,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    await esperarAte(() => Promise.resolve(recebidos.length > 0))
    const [primeiro] = recebidos
    const envelope = JSON.parse(primeiro?.corpo ?? '{}')
    expect(envelope).toMatchObject({
      tipo: 'empresa.criada',
      versao: 1,
      empresa_tenant: { id: d.tenantId },
      ator: { tipo: 'integracao', nome: 'Integração: n8n' },
      dados: { empresa: { id: r.body.id, razao_social: 'Avisada Ltda' } },
    })
    expect(primeiro?.cabecalhos['x-leadtogo-evento']).toBe('empresa.criada')
    expect(
      confere(
        primeiro?.corpo ?? '',
        String(primeiro?.cabecalhos['x-leadtogo-assinatura']),
        segredo,
      ),
    ).toBe(true)
    // O cadastro não dispara também o "tag alterada" do Status inicial
    await new Promise((r2) => setTimeout(r2, 500))
    expect(recebidos.map((x) => JSON.parse(x.corpo).tipo)).toEqual(['empresa.criada'])
    await esperarAte(async () => (await entregas(d.tenantId, webhookId))[0]?.situacao === 'sucesso')

    // Tag aplicada pela API: evento com o que entrou e o que saiu
    recebidos.length = 0
    expect((await api('put', `/empresas/${r.body.id as string}/tags/cliente`)).status).toBe(200)
    await esperarAte(() => Promise.resolve(recebidos.length > 0))
    const tag = JSON.parse(recebidos[0]?.corpo ?? '{}')
    expect(tag.tipo).toBe('empresa.tag_alterada')
    expect(
      tag.dados.alteracoes.adicionadas.map((t: { chave_sistema: string }) => t.chave_sistema),
    ).toEqual(['cliente'])
    expect(
      tag.dados.alteracoes.removidas.map((t: { chave_sistema: string }) => t.chave_sistema),
    ).toEqual(['lead'])
  })

  it('sem webhook que assine o tipo, nada vai para o outbox; o que foi desfeito não gera evento', async () => {
    const { d, api } = await cenario(['contato.criado'])
    expect(
      (
        await api('post', '/empresas', {
          documento: cnpjUnico(),
          razao_social: 'Calada',
          consultar_receita: false,
        })
      ).status,
    ).toBe(201)
    const ruim = await api('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Desfeita',
      responsavel_email: 'ninguem@exemplo.com',
    })
    expect(ruim.status).toBe(422)
    const [n] = await noTenant(
      d.tenantId,
      (tx) => tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM eventos_outbox WHERE tipo = 'webhook.distribuir'`,
    )
    expect(n?.n).toBe(0)
  })

  it('transação silenciada (linhas da importação) não gera evento; o fim do lote gera', async () => {
    const { d } = await cenario(['empresa.criada', 'importacao.concluida'])
    const gravados = await banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`)
      await tx.execute(sql`SELECT set_config(${SILENCIO}, '1', true)`)
      const evento = (tipo: 'empresa.criada' | 'importacao.concluida', ignorarSilencio: boolean) =>
        emitirEvento(tx, {
          tenantId: d.tenantId,
          tipo,
          entidadeId: d.tenantId,
          membroId: null,
          ignorarSilencio,
          dados: () => Promise.resolve({}),
        })
      await evento('empresa.criada', false)
      await evento('importacao.concluida', true)
      const linhas = await tx.execute<{ tipo: string }>(sql`
        SELECT payload->>'tipo' AS tipo FROM eventos_outbox WHERE tipo = 'webhook.distribuir'`)
      // Não deixa nada para o relay (o teste só confere o que foi gravado)
      await tx.execute(sql`DELETE FROM eventos_outbox WHERE tipo = 'webhook.distribuir'`)
      return linhas.map((l) => l.tipo)
    })
    expect(gravados).toEqual(['importacao.concluida'])
  })

  it('"Enviar teste" entrega webhook.teste só a este webhook, mesmo desligado', async () => {
    const { d, webhookId } = await cenario()
    expect(
      (await crm('patch', d.cookie, `/integracoes/webhooks/${webhookId}`, { ativo: false })).status,
    ).toBe(200)
    const r = await crm('post', d.cookie, `/integracoes/webhooks/${webhookId}/testar`)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    await esperarAte(() => Promise.resolve(recebidos.length > 0))
    expect(JSON.parse(recebidos[0]?.corpo ?? '{}').tipo).toBe('webhook.teste')
    await esperarAte(async () => (await entregas(d.tenantId, webhookId))[0]?.situacao === 'sucesso')
    const log = await crm('get', d.cookie, `/integracoes/webhooks/${webhookId}/entregas`)
    expect(log.body.itens[0]).toMatchObject({
      tipo: 'webhook.teste',
      situacao: 'sucesso',
      statusHttp: 200,
    })
  })
})

describe('webhooks: falhas, reenvio e desligamento', () => {
  const rodar = (tenantId: string, entregaId: string) => {
    const enfileirados: unknown[] = []
    const fila = {
      add: (...a: unknown[]) => Promise.resolve(enfileirados.push(a)),
    } as unknown as Queue
    return processadorDeWebhooks({
      banco,
      config: configuracaoDeTeste(TROCA),
      fila: () => fila,
      log: pino({ level: 'silent' }),
    })({ data: { tenantId, entregaId } } as Job).then((r) => ({ r, enfileirados }))
  }

  it('erro do destino: fica pendente e reagenda em 1 min; "Reenviar" zera e entrega', async () => {
    const { d, webhookId } = await cenario()
    respostaDoDestino = 500
    await crm('post', d.cookie, `/integracoes/webhooks/${webhookId}/testar`)
    await esperarAte(async () => (await entregas(d.tenantId, webhookId))[0]?.tentativas === 1)
    const [e] = await entregas(d.tenantId, webhookId)
    expect(e).toMatchObject({ situacao: 'pendente', status_http: 500 })
    const espera = (e?.proxima_tentativa_em?.getTime() ?? 0) - Date.now()
    expect(espera).toBeGreaterThan(30_000)
    expect(espera).toBeLessThanOrEqual(61_000)

    respostaDoDestino = 200
    const r = await crm(
      'post',
      d.cookie,
      `/integracoes/webhooks/${webhookId}/entregas/${e?.id ?? ''}/reenviar`,
    )
    expect(r.status).toBe(200)
    await esperarAte(async () => (await entregas(d.tenantId, webhookId))[0]?.situacao === 'sucesso')
  })

  it('na 8ª tentativa desiste (falhou); redirecionamento não é seguido', async () => {
    const { d, webhookId } = await cenario()
    respostaDoDestino = 302
    await crm('post', d.cookie, `/integracoes/webhooks/${webhookId}/testar`)
    await esperarAte(async () => (await entregas(d.tenantId, webhookId))[0]?.tentativas === 1)
    const [e] = await entregas(d.tenantId, webhookId)
    expect(e?.erro).toBe('redirecionamento não é seguido')
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE webhook_entregas SET tentativas = 7 WHERE id = ${e?.id ?? ''}`,
    )
    const { r } = await rodar(d.tenantId, e?.id ?? '')
    expect(r).toBe('falhou')
    expect((await entregas(d.tenantId, webhookId))[0]?.situacao).toBe('falhou')
  })

  it('410 desliga o webhook na hora e avisa no sino; 3 dias falhando também', async () => {
    const um = await cenario()
    respostaDoDestino = 410
    await crm('post', um.d.cookie, `/integracoes/webhooks/${um.webhookId}/testar`)
    await esperarAte(async () => (await entregas(um.d.tenantId, um.webhookId))[0]?.tentativas === 1)
    const lista = await crm('get', um.d.cookie, '/integracoes/webhooks')
    expect(lista.body.itens[0]).toMatchObject({ ativo: false, desativadoMotivo: '410' })
    const [aviso] = await noTenant(
      um.d.tenantId,
      (tx) => tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM notificacoes WHERE tipo = 'integracao.webhook_desativado'`,
    )
    expect(aviso?.n).toBeGreaterThan(0)

    const dois = await cenario()
    respostaDoDestino = 500
    await crm('post', dois.d.cookie, `/integracoes/webhooks/${dois.webhookId}/testar`)
    await esperarAte(
      async () => (await entregas(dois.d.tenantId, dois.webhookId))[0]?.tentativas === 1,
    )
    await noTenant(
      dois.d.tenantId,
      (tx) => tx`
      UPDATE webhooks SET falhando_desde = now() - interval '4 days' WHERE id = ${dois.webhookId}`,
    )
    const [e] = await entregas(dois.d.tenantId, dois.webhookId)
    await rodar(dois.d.tenantId, e?.id ?? '')
    const depois = await crm('get', dois.d.cookie, '/integracoes/webhooks')
    expect(depois.body.itens[0]).toMatchObject({ ativo: false, desativadoMotivo: 'falhas' })
    // Religar zera a contagem
    await crm('patch', dois.d.cookie, `/integracoes/webhooks/${dois.webhookId}`, { ativo: true })
    const religado = await crm('get', dois.d.cookie, '/integracoes/webhooks')
    expect(religado.body.itens[0]).toMatchObject({
      ativo: true,
      desativadoMotivo: null,
      falhandoDesde: null,
    })
  })

  it('trocar o segredo: as duas assinaturas vão juntas por 24 h', async () => {
    const { d, webhookId, segredo } = await cenario()
    const r = await crm('post', d.cookie, `/integracoes/webhooks/${webhookId}/rotacionar-segredo`)
    expect(r.status).toBe(200)
    const novo = r.body.segredo as string
    expect(novo).not.toBe(segredo)
    await crm('post', d.cookie, `/integracoes/webhooks/${webhookId}/testar`)
    await esperarAte(() => Promise.resolve(recebidos.length > 0))
    const assinatura = String(recebidos[0]?.cabecalhos['x-leadtogo-assinatura'])
    expect(assinatura.match(/v1=/g)).toHaveLength(2)
    expect(confere(recebidos[0]?.corpo ?? '', assinatura, novo)).toBe(true)
    expect(confere(recebidos[0]?.corpo ?? '', assinatura, segredo)).toBe(true)
  })
})

describe('webhooks: gestão e segurança', () => {
  it('2FA para criar; segredo uma vez; URL interna recusada; isolamento; excluir só sem entregas', async () => {
    const { d, pessoa } = await empresaDeChamados(app)
    const gestor = await pessoa('Gestor', { 'integracoes.gerir': null })
    const corpo = { descricao: 'x', url: urlDoDestino, eventos: ['empresa.criada'] }
    expect((await crm('post', gestor.cookie, '/integracoes/webhooks', corpo)).body.erro).toBe(
      '2fa_obrigatorio',
    )
    await ligar2fa(gestor.usuarioId)
    const criado = await crm('post', gestor.cookie, '/integracoes/webhooks', corpo)
    expect(criado.status).toBe(201)
    expect(criado.body.segredo).toMatch(/^whsec_/)
    const lista = await crm('get', d.cookie, '/integracoes/webhooks')
    expect(JSON.stringify(lista.body)).not.toContain(criado.body.segredo)
    const [linha] = await noTenant(
      d.tenantId,
      (tx) => tx<{ segredo: string }[]>`
      SELECT segredo FROM webhooks WHERE id = ${criado.body.webhook.id as string}`,
    )
    expect(linha?.segredo).toMatch(/^v1:/)

    // URL com usuário e senha embutidos, montada aqui para não parecer credencial no código
    const comCredencial = Object.assign(new URL('https://exemplo.com/x'), {
      username: 'u',
      password: 'p',
    }).href
    for (const url of ['http://10.0.0.5/x', 'http://169.254.169.254/latest', comCredencial]) {
      const r = await crm('post', d.cookie, '/integracoes/webhooks', { ...corpo, url })
      expect([400, 422], url).toContain(r.status)
    }
    const outra = await empresaDeChamados(app)
    expect((await crm('get', outra.d.cookie, '/integracoes/webhooks')).body.itens).toEqual([])
    expect(
      (
        await crm(
          'post',
          outra.d.cookie,
          `/integracoes/webhooks/${criado.body.webhook.id as string}/testar`,
        )
      ).status,
    ).toBe(404)

    const semUso = await crm('post', d.cookie, '/integracoes/webhooks', corpo)
    expect(
      (await crm('delete', d.cookie, `/integracoes/webhooks/${semUso.body.webhook.id as string}`))
        .status,
    ).toBe(204)
    await crm('post', d.cookie, `/integracoes/webhooks/${criado.body.webhook.id as string}/testar`)
    expect(
      (await crm('delete', d.cookie, `/integracoes/webhooks/${criado.body.webhook.id as string}`))
        .status,
    ).toBe(409)
  })

  it('SSRF: rede interna e metadados recusados, no IP literal e na resolução do nome', async () => {
    const politica = { exigirHttps: true, hostsInternos: ['n8n:5678'] }
    expect(conferirUrl('http://n8n:5678/webhook/x', politica)).toBeNull()
    expect(conferirUrl('http://n8n:9999/webhook/x', politica)).toBe('em produção, só https')
    expect(conferirUrl('https://192.168.0.10/x', politica)).toBe('endereço de rede interna')
    expect(conferirUrl('https://[::1]/x', politica)).toBe('endereço de rede interna')
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      'fd00::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(enderecoProibido(ip), ip).toBe(true)
    }
    for (const ip of ['8.8.8.8', '200.160.2.3', '2001:4860:4860::8888'])
      expect(enderecoProibido(ip), ip).toBe(false)
    // `localhost` resolve para 127.0.0.1: sem estar na lista, a conexão é recusada no DNS
    const porta = (destino.address() as AddressInfo).port
    const r = await entregar(
      `http://localhost:${porta}/x`,
      '{}',
      {},
      { exigirHttps: false, hostsInternos: [] },
    )
    expect(r.ok).toBe(false)
    expect(r.erro).toBe('destino recusado: endereço de rede interna')
    expect(recebidos).toEqual([])
  })

  it('assinatura: HMAC-SHA256 de "<t>.<corpo>" com cada segredo', () => {
    const cabecalho = assinar('{"a":1}', ['s1', 's2'], 1_700_000_000_000)
    const esperada = createHmac('sha256', 's1').update('1700000000.{"a":1}').digest('hex')
    expect(cabecalho.startsWith(`t=1700000000,v1=${esperada},v1=`)).toBe(true)
  })
})
