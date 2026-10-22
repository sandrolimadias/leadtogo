import type { Server } from 'node:http'

import type { ConfiguracaoDaCarteira, EmpresaCarteira } from '@leadtogo/shared'
import { completarCnpj } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import {
  respostaDaReceita,
  type ServidorFalso,
  subirServidorFalso,
} from '../receita/servidor-falso.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
let receita: ServidorFalso
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  receita = await subirServidorFalso({ status: 200 })
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({
      TRUST_PROXY: '1',
      MINHA_RECEITA_URL: receita.url,
      BRASILAPI_URL: receita.url,
    }),
  )
})
afterEach(async () => {
  await app.close()
  await receita.fechar()
})

type Metodo = 'get' | 'patch' | 'post'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.3.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const ROTA = '/v1/configuracoes/carteira'
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

async function equipe() {
  const d = await novoDono(app)
  const pessoa = async (papel: 'gestor' | 'vendedor') => {
    const u = await usuarioSimples(app)
    await vincular(d.tenantId, u.id, papel, papel)
    await ativar(u.id, d.tenantId)
    return u
  }
  return { d, gestor: await pessoa('gestor'), vendedor: await pessoa('vendedor') }
}

describe('/v1/configuracoes/carteira', () => {
  it('sem sessão 401; qualquer membro lê, e o padrão é o bloqueio ligado', async () => {
    const { d, gestor, vendedor } = await equipe()
    expect((await chamar('get', undefined, ROTA)).status).toBe(401)
    for (const cookie of [d.cookie, gestor.cookie, vendedor.cookie]) {
      const r = await chamar('get', cookie, ROTA)
      expect(r.status).toBe(200)
      expect(r.body as ConfiguracaoDaCarteira).toEqual({ bloquearEmpresaNaoAtiva: true })
    }
  })

  it('só o administrador altera; gestor e vendedor recebem 403', async () => {
    const { d, gestor, vendedor } = await equipe()
    for (const u of [gestor, vendedor]) {
      const r = await chamar('patch', u.cookie, ROTA, { bloquearEmpresaNaoAtiva: false })
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('acesso_negado')
    }
    const r = await chamar('patch', d.cookie, ROTA, { bloquearEmpresaNaoAtiva: false })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ bloquearEmpresaNaoAtiva: false })
  })

  it('muda só o que veio, guarda e registra o antes e o depois na auditoria', async () => {
    const { d } = await equipe()
    await chamar('patch', d.cookie, ROTA, { bloquearEmpresaNaoAtiva: false })
    const r = await chamar('get', d.cookie, ROTA)
    expect(r.body).toEqual({ bloquearEmpresaNaoAtiva: false })
    const reg = (await auditoriaDe(d.tenantId)).find(
      (a) => a.entidade === 'configuracao_da_carteira',
    )
    expect(reg).toMatchObject({
      acao: 'alterar',
      alteracoes: { bloquearEmpresaNaoAtiva: { de: true, para: false } },
    })
    // repetir o mesmo valor não é mudança
    await chamar('patch', d.cookie, ROTA, { bloquearEmpresaNaoAtiva: false })
    expect(
      (await auditoriaDe(d.tenantId)).filter((a) => a.entidade === 'configuracao_da_carteira'),
    ).toHaveLength(1)
  })

  it('corpo vazio, campo desconhecido ou de tipo errado é 400', async () => {
    const { d } = await equipe()
    // o antigo interruptor saiu da API: virou o alcance de ver no perfil de acesso
    for (const corpo of [
      {},
      { x: 1 },
      { bloquearEmpresaNaoAtiva: 'sim' },
      { vendedorVeTodasEmpresas: true },
    ]) {
      expect((await chamar('patch', d.cookie, ROTA, corpo)).status, JSON.stringify(corpo)).toBe(400)
    }
  })

  it('cada empresa tem a sua configuração (isolamento)', async () => {
    const { d } = await equipe()
    const outro = await novoDono(app)
    await chamar('patch', d.cookie, ROTA, { bloquearEmpresaNaoAtiva: false })
    expect((await chamar('get', outro.cookie, ROTA)).body).toMatchObject({
      bloquearEmpresaNaoAtiva: true,
    })
  })

  it('ligar e desligar o bloqueio muda o cadastro de empresa não ativa na hora', async () => {
    const { d } = await equipe()
    const base = `Z${Date.now().toString(36).slice(-5).toUpperCase()}01`
      .replace(/[^0-9A-Z]/g, '0')
      .padEnd(8, '0')
      .slice(0, 8)
    const cnpj = completarCnpj(`${base}0001`)
    receita.responder({
      status: 200,
      corpo: respostaDaReceita(cnpj, {
        situacao_cadastral: 8,
        descricao_situacao_cadastral: 'BAIXADA',
      }),
    })
    const cadastrar = () =>
      chamar('post', d.cookie, '/v1/carteira/empresas', {
        tipoDocumento: 'cnpj',
        documento: cnpj,
        razaoSocial: 'Baixada Ltda',
      })
    const bloqueada = await cadastrar()
    expect(bloqueada.status).toBe(409)
    expect(erroDe(bloqueada)).toBe('empresa_nao_ativa')

    await chamar('patch', d.cookie, ROTA, { bloquearEmpresaNaoAtiva: false })
    const liberada = await cadastrar()
    expect(liberada.status).toBe(201)
    expect((liberada.body as EmpresaCarteira).receita).toMatchObject({ situacao: 'BAIXADA' })

    // a que já está na carteira continua, mesmo com o bloqueio religado
    await chamar('patch', d.cookie, ROTA, { bloquearEmpresaNaoAtiva: true })
    const ficha = await chamar(
      'get',
      d.cookie,
      `/v1/carteira/empresas/${(liberada.body as EmpresaCarteira).id}`,
    )
    expect(ficha.status).toBe(200)
  })
})
