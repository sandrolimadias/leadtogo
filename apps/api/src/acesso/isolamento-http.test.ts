import type { Server } from 'node:http'

import type {
  ConviteResumo,
  EmpresaAtivaResposta,
  MeResposta,
  MembroDaEquipe,
  Preferencias,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { emailUnico, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { limparCaixa } from '../testes/mailpit.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import {
  ativar,
  dono,
  mudarMembro,
  membroComEmail,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'
import { listarRotas } from '../documentacao/rotas.js'

// O teste que fecha o E8: um usuário da empresa A recebe 403/404 ao tentar chegar nos dados da B,
// pelas rotas REAIS da API (não por rotas de teste). Duas contas, duas empresas, dois administradores.

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

const get = (caminho: string, cookie: string, cabecalhos: Record<string, string> = {}) =>
  request(app.getHttpServer()).get(caminho).set('Cookie', cookie).set(cabecalhos)
const escrever = (
  metodo: 'post' | 'patch' | 'delete',
  caminho: string,
  cookie: string,
  corpo?: object,
) =>
  request(app.getHttpServer())
    [metodo](caminho)
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send(corpo)
const erroDe = (r: request.Response) => r.body as RespostaDeErro

/** Duas empresas de contas diferentes, com dados e administrador cada uma. */
async function doisMundos() {
  const a = await novoDono(app)
  const b = await novoDono(app)
  await ativar(a.usuarioId, a.tenantId)
  await ativar(b.usuarioId, b.tenantId)
  const emailMembroB = emailUnico('segredo-da-b')
  await membroComEmail(b.tenantId, emailMembroB, 'Funcionária Secreta da B')
  const conviteB = await escrever('post', '/v1/convites', b.cookie, {
    email: emailUnico('convidado-da-b'),
    papel: 'vendedor',
  })
  expect(conviteB.status).toBe(201)
  await membroComEmail(a.tenantId, emailUnico('da-a'), 'Funcionário da A')
  return { a, b, emailMembroB, conviteB: conviteB.body as { id: string; email: string } }
}

describe('o usuário da empresa A não alcança os dados da B', () => {
  it('lê só a própria equipe e os próprios convites: nada da B aparece em nenhuma resposta', async () => {
    const { a, b, emailMembroB, conviteB } = await doisMundos()
    const equipe = await get('/v1/membros?incluirInativos=true', a.cookie)
    const convites = await get('/v1/convites', a.cookie)
    const me = await get('/v1/me', a.cookie)
    const prefs = await get('/v1/me/preferencias', a.cookie)
    for (const r of [equipe, convites, me, prefs]) expect(r.status).toBe(200)

    const tudo = JSON.stringify([equipe.body, convites.body, me.body, prefs.body])
    for (const daB of [
      b.tenantId,
      b.contaId,
      b.usuarioId,
      b.email,
      emailMembroB,
      'Funcionária Secreta da B',
      conviteB.id,
      conviteB.email,
    ]) {
      expect(tudo, daB).not.toContain(daB)
    }
    expect((equipe.body as MembroDaEquipe[]).map((m) => m.nome)).toContain('Funcionário da A')
    expect((me.body as MeResposta).empresas.map((e) => e.id)).toEqual([a.tenantId])
  })

  it('cancelar o convite da B sendo da A: 404, e o convite da B segue pendente', async () => {
    const { a, b, conviteB } = await doisMundos()
    const r = await escrever('delete', `/v1/convites/${conviteB.id}`, a.cookie)
    expect(r.status).toBe(404)
    expect(erroDe(r).erro).toBe('convite_nao_encontrado')
    const daB = (await get('/v1/convites', b.cookie)).body as ConviteResumo[]
    expect(daB.map((c) => c.id)).toContain(conviteB.id)
    expect(daB.find((c) => c.id === conviteB.id)?.situacao).toBe('pendente')
  })

  it('trocar para a empresa da B: 403 empresa_nao_permitida, igual a trocar para uma que não existe', async () => {
    const { a, b } = await doisMundos()
    const naB = await escrever('post', '/v1/sessao/empresa-ativa', a.cookie, {
      empresaId: b.tenantId,
    })
    const inexistente = await escrever('post', '/v1/sessao/empresa-ativa', a.cookie, {
      empresaId: '01a11111-1111-7111-8111-111111111111',
    })
    expect(naB.status).toBe(403)
    expect(erroDe(naB).erro).toBe('empresa_nao_permitida')
    expect(naB.body).toEqual({
      ...(inexistente.body as object),
      request_id: erroDe(naB).request_id,
    })
    // a sessão da A continua na A
    const me = (await get('/v1/me', a.cookie)).body as MeResposta
    expect(me.empresaAtivaId).toBe(a.tenantId)
  })

  it('sessão da A apontando à empresa da B (estado forçado): toda rota protegida dá 403; o /me não lista a B', async () => {
    const { a, b } = await doisMundos()
    await ativar(a.usuarioId, b.tenantId)
    for (const caminho of ['/v1/membros', '/v1/convites', '/v1/me/preferencias']) {
      const r = await get(caminho, a.cookie)
      expect(r.status, caminho).toBe(403)
      expect(erroDe(r).erro).toBe('empresa_ativa_invalida')
      expect(JSON.stringify(r.body)).not.toContain('Funcionária Secreta da B')
    }
    const me = await get('/v1/me', a.cookie)
    expect(me.status).toBe(200)
    expect((me.body as MeResposta).empresas.map((e) => e.id)).toEqual([a.tenantId])
  })

  it('o cliente não escolhe a empresa: cabeçalho, query e corpo com o id da B são ignorados ou recusados', async () => {
    const { a, b } = await doisMundos()
    const dicas = { 'X-Tenant-Id': b.tenantId, 'X-Empresa-Id': b.tenantId, 'X-Tenant': b.tenantId }
    for (const caminho of [
      '/v1/membros',
      `/v1/membros?tenantId=${b.tenantId}`,
      `/v1/membros?tenant_id=${b.tenantId}`,
    ]) {
      const r = await get(caminho, a.cookie, dicas)
      // com a query desconhecida a validação recusa (400); sem ela, a resposta é só da A
      if (caminho === '/v1/membros') {
        expect(r.status).toBe(200)
        expect(JSON.stringify(r.body)).not.toContain('Funcionária Secreta da B')
      } else {
        expect(r.status).toBe(400)
      }
    }
    const criar = await escrever('post', '/v1/convites', a.cookie, {
      email: emailUnico('x'),
      papel: 'vendedor',
      tenantId: b.tenantId,
    })
    expect(criar.status).toBe(400) // campo que o cliente não pode mandar
    const prefs = await escrever('patch', '/v1/me/preferencias', a.cookie, {
      tenantId: b.tenantId,
      tema: 'escuro',
    })
    expect(prefs.status).toBe(400)
  })

  it('o convite criado pela A nasce na A: não aparece para a B, e o que a B vê não muda', async () => {
    const { a, b } = await doisMundos()
    const antesDaB = ((await get('/v1/convites', b.cookie)).body as ConviteResumo[]).length
    const emailNovo = emailUnico('so-da-a')
    expect(
      (await escrever('post', '/v1/convites', a.cookie, { email: emailNovo, papel: 'gestor' }))
        .status,
    ).toBe(201)
    const daB = (await get('/v1/convites', b.cookie)).body as ConviteResumo[]
    expect(daB).toHaveLength(antesDaB)
    expect(JSON.stringify(daB)).not.toContain(emailNovo)
    expect(
      ((await get('/v1/convites', a.cookie)).body as ConviteResumo[]).map((c) => c.email),
    ).toContain(emailNovo)
  })

  it('o token de convite da B não serve a quem é de outro e-mail, mesmo logado na A (403)', async () => {
    const { a, b } = await doisMundos()
    // convite da B para o e-mail de um usuário que existe (de outra conta)
    const alvo = await usuarioSimples(app)
    await limparCaixa()
    await escrever('post', '/v1/convites', b.cookie, { email: alvo.email, papel: 'vendedor' })
    const { aguardarMensagem, primeiroLink } = await import('../testes/mailpit.js')
    const token =
      new URL(primeiroLink(await aguardarMensagem(alvo.email))).searchParams.get('token') ?? ''
    const comAAdmin = await request(app.getHttpServer())
      .post('/v1/convites/aceitar')
      .set('Cookie', a.cookie)
      .set('Origin', ORIGEM_DO_FRONT)
      .send({ token })
    expect(comAAdmin.status).toBe(403)
    expect(erroDe(comAAdmin).erro).toBe('convite_de_outro_email')
    expect(
      await dono`SELECT 1 FROM membros WHERE usuario_id = ${a.usuarioId} AND tenant_id = ${b.tenantId}`.catch(
        () => [],
      ),
    ).toHaveLength(0)
  })

  it('as preferências são de cada membro: o PATCH da A não toca nas da B', async () => {
    const { a, b } = await doisMundos()
    await escrever('patch', '/v1/me/preferencias', b.cookie, {
      tema: 'claro',
      visaoDashboard: 'equipe',
    })
    await escrever('patch', '/v1/me/preferencias', a.cookie, { tema: 'escuro' })
    expect((await get('/v1/me/preferencias', a.cookie)).body as Preferencias).toMatchObject({
      tema: 'escuro',
      visaoDashboard: 'minha',
    })
    expect((await get('/v1/me/preferencias', b.cookie)).body as Preferencias).toMatchObject({
      tema: 'claro',
      visaoDashboard: 'equipe',
    })
  })

  it('perder o vínculo com a A tira o acesso na hora, sem passar para a B', async () => {
    const { a, b } = await doisMundos()
    await mudarMembro(a.tenantId, a.usuarioId, 'excluido_em = now()')
    for (const caminho of ['/v1/membros', '/v1/convites', '/v1/me/preferencias']) {
      const r = await get(caminho, a.cookie)
      expect(r.status, caminho).toBe(403)
      expect(JSON.stringify(r.body)).not.toContain(b.tenantId)
    }
  })
})

describe('papel por empresa: o mesmo usuário é admin numa e vendedor na outra', () => {
  it('admin na A convida; na B (vendedor) a mesma pessoa recebe 403 acesso_negado e não lê convites', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app)
    await vincular(b.tenantId, a.usuarioId, 'vendedor', 'A como vendedor da B')
    await ativar(a.usuarioId, a.tenantId)
    expect(
      (
        await escrever('post', '/v1/convites', a.cookie, {
          email: emailUnico('ok'),
          papel: 'vendedor',
        })
      ).status,
    ).toBe(201)

    expect(
      (await escrever('post', '/v1/sessao/empresa-ativa', a.cookie, { empresaId: b.tenantId }))
        .status,
    ).toBe(200)
    const convidar = await escrever('post', '/v1/convites', a.cookie, {
      email: emailUnico('negado'),
      papel: 'vendedor',
    })
    expect(convidar.status).toBe(403)
    expect(erroDe(convidar).erro).toBe('acesso_negado')
    expect((await get('/v1/convites', a.cookie)).status).toBe(403)
    const equipe = (await get('/v1/membros', a.cookie)).body as MembroDaEquipe[]
    expect(equipe.every((m) => !('email' in m))).toBe(true) // vendedor não vê e-mails

    // de volta à A, o poder de administrador volta
    const voltou = await escrever('post', '/v1/sessao/empresa-ativa', a.cookie, {
      empresaId: a.tenantId,
    })
    expect((voltou.body as EmpresaAtivaResposta).empresa.papel).toBe('admin')
    expect((await get('/v1/convites', a.cookie)).status).toBe(200)
  })
})

describe('rede de segurança: toda rota é protegida, a não ser as públicas listadas aqui', () => {
  /** As ÚNICAS rotas que podem ficar sem login. Adicionar uma aqui é uma decisão consciente. */
  const PUBLICAS = [
    'GET /health',
    'ALL /v1/auth/{*caminho}',
    'POST /v1/primeiro-acesso',
    'POST /v1/convites/consultar',
    'POST /v1/convites/aceitar',
  ]

  const rotas = () => listarRotas(app)

  it('o conjunto de rotas públicas é exatamente o esperado', () => {
    const publicas = rotas()
      .filter((r) => r.publica)
      .map((r) => r.rota)
      .sort()
    expect(publicas).toEqual([...PUBLICAS].sort())
  })

  it('há rotas protegidas descobertas (a varredura funciona)', () => {
    expect(rotas().filter((r) => !r.publica).length).toBeGreaterThanOrEqual(8)
  })

  const chamar = (metodo: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'all', url: string) => {
    const agente = request(app.getHttpServer())
    const pedido =
      metodo === 'get'
        ? agente.get(url)
        : metodo === 'post'
          ? agente.post(url)
          : metodo === 'put'
            ? agente.put(url)
            : metodo === 'patch'
              ? agente.patch(url)
              : metodo === 'all'
                ? agente.get(url)
                : agente.delete(url)
    return pedido.set('Origin', ORIGEM_DO_FRONT).send({})
  }

  it('toda rota que não é pública responde 401 sem login', async () => {
    for (const r of rotas().filter((x) => !x.publica)) {
      const resposta = await chamar(r.metodo, r.url)
      expect(resposta.status, r.rota).toBe(401)
      expect(erroDe(resposta).erro, r.rota).toBe('nao_autenticado')
    }
  })
})
