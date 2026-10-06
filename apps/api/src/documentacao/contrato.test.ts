import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { fileURLToPath } from 'node:url'

import {
  conviteAceitoSchema,
  conviteConsultaSchema,
  conviteCriadoSchema,
  conviteResumoSchema,
  empresaAtivaRespostaSchema,
  erroSchema,
  meRespostaSchema,
  membroDaEquipeSchema,
  preferenciasSchema,
  primeiroAcessoResultadoSchema,
  saudeSchema,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z, type ZodType } from 'zod'

import { criarApp } from '../app.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import {
  cnpjUnico,
  emailUnico,
  limparLimitesAuth,
  ORIGEM_DO_FRONT,
  SENHA_PADRAO,
} from '../testes/auth-teste.js'
import { aguardarMensagem, limparCaixa, primeiroLink } from '../testes/mailpit.js'
import { ativar, dono, novoDono } from '../testes/mundo.js'

// Contrato: o que a API REALMENTE devolve bate com o que o OpenAPI diz (schemas Zod e status).
type Operacao = { responses: Record<string, unknown> }
const doc = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../openapi.json', import.meta.url)), 'utf8'),
) as {
  paths: Record<string, Record<string, Operacao>>
}

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
// O e-mail só sai quando o worker age (relay do outbox e fila de e-mail): sobe um de verdade
const workerDeTeste = await subirWorkerDeTeste()
afterAll(async () => {
  await workerDeTeste.parar()
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  for (const chave of await valkey.keys('leadtogo:rl:*')) await valkey.del(chave)
  await limparCaixa()
  app = await criarApp(configuracaoDeTeste({ TRUST_PROXY: '1', LOG_LEVEL: 'silent' }))
  await app.init()
})
afterEach(() => app.close())

/** Confere o status contra o OpenAPI e o corpo contra o schema (sucesso ou erro). */
function conferir(r: request.Response, metodo: string, caminho: string, esquema?: ZodType) {
  const documentados = Object.keys(doc.paths[caminho]?.[metodo]?.responses ?? {})
  expect(
    documentados,
    `${metodo.toUpperCase()} ${caminho} não documenta o status ${r.status}`,
  ).toContain(String(r.status))
  if (r.status >= 400) {
    const erro = erroSchema.parse(r.body)
    expect(erro.statusCode).toBe(r.status)
  } else if (esquema) {
    esquema.parse(r.body)
  }
}

const com = (r: request.Test, cookie: string) =>
  r.set('Cookie', cookie).set('Origin', ORIGEM_DO_FRONT)

describe('contrato: as respostas reais batem com o OpenAPI', () => {
  it('GET /health e o primeiro acesso', async () => {
    conferir(await request(app.getHttpServer()).get('/health'), 'get', '/health', saudeSchema)
    const r = await request(app.getHttpServer())
      .post('/v1/primeiro-acesso')
      .send({
        nome: 'Ana Souza',
        email: emailUnico('contrato'),
        senha: SENHA_PADRAO,
        empresa: { razaoSocial: 'Empresa Contrato Ltda', cnpj: cnpjUnico() },
      })
    expect(r.status).toBe(201)
    conferir(r, 'post', '/v1/primeiro-acesso', primeiroAcessoResultadoSchema)
    conferir(
      await request(app.getHttpServer()).post('/v1/primeiro-acesso').send({ x: 1 }),
      'post',
      '/v1/primeiro-acesso',
    )
  })

  it('/v1/me, empresa ativa e preferências', async () => {
    const d = await novoDono(app)
    conferir(
      await com(request(app.getHttpServer()).get('/v1/me'), d.cookie),
      'get',
      '/v1/me',
      meRespostaSchema,
    )
    conferir(await request(app.getHttpServer()).get('/v1/me'), 'get', '/v1/me') // 401

    const troca = await com(
      request(app.getHttpServer()).post('/v1/sessao/empresa-ativa'),
      d.cookie,
    ).send({ empresaId: d.tenantId })
    conferir(troca, 'post', '/v1/sessao/empresa-ativa', empresaAtivaRespostaSchema)
    const alheia = await com(
      request(app.getHttpServer()).post('/v1/sessao/empresa-ativa'),
      d.cookie,
    ).send({ empresaId: '01a11111-1111-7111-8111-111111111111' })
    expect(alheia.status).toBe(403)
    conferir(alheia, 'post', '/v1/sessao/empresa-ativa')
    conferir(
      await com(request(app.getHttpServer()).post('/v1/sessao/empresa-ativa'), d.cookie).send({}),
      'post',
      '/v1/sessao/empresa-ativa',
    ) // 400

    conferir(
      await com(request(app.getHttpServer()).get('/v1/me/preferencias'), d.cookie),
      'get',
      '/v1/me/preferencias',
      preferenciasSchema,
    )
    const patch = await com(
      request(app.getHttpServer()).patch('/v1/me/preferencias'),
      d.cookie,
    ).send({ tema: 'escuro' })
    conferir(patch, 'patch', '/v1/me/preferencias', preferenciasSchema)
    conferir(
      await com(request(app.getHttpServer()).patch('/v1/me/preferencias'), d.cookie).send({
        tema: 'roxo',
      }),
      'patch',
      '/v1/me/preferencias',
    )
  })

  it('equipe e convites (administrador e convidado)', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    conferir(
      await com(request(app.getHttpServer()).get('/v1/membros'), d.cookie),
      'get',
      '/v1/membros',
      z.array(membroDaEquipeSchema),
    )

    const email = emailUnico('convidado')
    const criado = await com(request(app.getHttpServer()).post('/v1/convites'), d.cookie).send({
      email,
      papel: 'gestor',
    })
    expect(criado.status).toBe(201)
    conferir(criado, 'post', '/v1/convites', conviteCriadoSchema)
    conferir(
      await com(request(app.getHttpServer()).post('/v1/convites'), d.cookie).send({
        email,
        papel: 'dono',
      }),
      'post',
      '/v1/convites',
    ) // 400
    conferir(
      await com(request(app.getHttpServer()).get('/v1/convites'), d.cookie),
      'get',
      '/v1/convites',
      z.array(conviteResumoSchema),
    )

    const token =
      new URL(primeiroLink(await aguardarMensagem(email))).searchParams.get('token') ?? ''
    conferir(
      await request(app.getHttpServer()).post('/v1/convites/consultar').send({ token }),
      'post',
      '/v1/convites/consultar',
      conviteConsultaSchema,
    )
    conferir(
      await request(app.getHttpServer())
        .post('/v1/convites/consultar')
        .send({ token: 'x'.repeat(43) }),
      'post',
      '/v1/convites/consultar',
    ) // 404
    const aceito = await request(app.getHttpServer())
      .post('/v1/convites/aceitar')
      .send({ token, nome: 'Bia Costa', senha: 'senha-da-bia-123' })
    expect(aceito.status).toBe(200)
    conferir(aceito, 'post', '/v1/convites/aceitar', conviteAceitoSchema)
    conferir(
      await request(app.getHttpServer()).post('/v1/convites/aceitar').send({ token }),
      'post',
      '/v1/convites/aceitar',
    ) // 404

    const outro = await com(request(app.getHttpServer()).post('/v1/convites'), d.cookie).send({
      email: emailUnico('outro'),
      papel: 'vendedor',
    })
    const apagar = await com(
      request(app.getHttpServer()).delete(`/v1/convites/${(outro.body as { id: string }).id}`),
      d.cookie,
    )
    expect(apagar.status).toBe(204)
    conferir(apagar, 'delete', '/v1/convites/{id}')
    conferir(
      await com(
        request(app.getHttpServer()).delete(`/v1/convites/${(outro.body as { id: string }).id}`),
        d.cookie,
      ),
      'delete',
      '/v1/convites/{id}',
    ) // 404
  })

  it('o erro padrão tem sempre o mesmo formato (401, 403 e 429)', async () => {
    const d = await novoDono(app, { com2fa: false }) // admin sem 2FA: 403 em rota comum
    await ativar(d.usuarioId, d.tenantId)
    const r403 = await com(request(app.getHttpServer()).get('/v1/membros'), d.cookie)
    expect(r403.status).toBe(403)
    expect(erroSchema.parse(r403.body).erro).toBe('2fa_obrigatorio')
    const r401 = await request(app.getHttpServer()).get('/v1/membros')
    expect(erroSchema.parse(r401.body).erro).toBe('nao_autenticado')
    // 429: o limite do primeiro acesso é de 5 por hora por IP
    let ultimo: request.Response | undefined
    for (let i = 0; i < 6; i++)
      ultimo = await request(app.getHttpServer()).post('/v1/primeiro-acesso').send({ x: i })
    expect(ultimo?.status).toBe(429)
    expect(erroSchema.parse(ultimo?.body).erro).toBe('muitas_requisicoes')
    expect(Object.keys(doc.paths['/v1/primeiro-acesso']?.['post']?.responses ?? {})).toContain(
      '429',
    )
  })
})
