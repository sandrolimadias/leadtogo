import type { Server } from 'node:http'

import type { DadosDaEmpresa, MunicipiosDaUf } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste'),
    ('SP', 'São Paulo', 'Sudeste') ON CONFLICT DO NOTHING`
  // os mesmos nomes que os outros arquivos de teste gravam (o banco de teste é compartilhado)
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'VITORIA', 'ES'),
    (3201308, 'CARIACICA', 'ES'), (3550308, 'SAO PAULO', 'SP') ON CONFLICT DO NOTHING`
})
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

type Metodo = 'get' | 'patch'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.9.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const ROTA = '/v1/configuracoes/empresa'
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

describe('/v1/configuracoes/empresa', () => {
  it('todo membro lê; sem endereço, a cidade vem nula; sem sessão 401', async () => {
    const { d, vendedor } = await equipe()
    expect((await chamar('get', undefined, ROTA)).status).toBe(401)
    const r = await chamar('get', vendedor.cookie, ROTA)
    expect(r.status).toBe(200)
    const x = r.body as DadosDaEmpresa
    expect(x.razaoSocial).toMatch(/^Empresa /)
    expect(x.cnpj).not.toBeNull()
    expect(x.endereco.municipio).toBeNull()
    expect((await chamar('get', d.cookie, ROTA)).status).toBe(200)
  })

  it('o admin grava dados e endereço (só o enviado muda; vazio apaga) e a auditoria guarda o antes e o depois', async () => {
    const { d } = await equipe()
    const r = await chamar('patch', d.cookie, ROTA, {
      nomeFantasia: 'Associação Teste',
      email: 'contato@exemplo.com.br',
      endereco: {
        cep: '29.100-001',
        logradouro: 'Das Flores',
        numero: '10',
        municipioCodigo: 3205309,
      },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const x = r.body as DadosDaEmpresa
    expect(x.nomeFantasia).toBe('Associação Teste')
    expect(x.email).toBe('contato@exemplo.com.br')
    expect(x.endereco).toMatchObject({
      cep: '29100001',
      logradouro: 'Das Flores',
      numero: '10',
      municipio: { codigo: 3205309, uf: 'ES' },
    })
    // só o enviado muda; texto vazio apaga
    const y = (await chamar('patch', d.cookie, ROTA, { email: '', endereco: { numero: '' } }))
      .body as DadosDaEmpresa
    expect(y).toMatchObject({ nomeFantasia: 'Associação Teste', email: null })
    expect(y.endereco).toMatchObject({ logradouro: 'Das Flores', numero: null })
    expect(y.endereco.municipio?.codigo).toBe(3205309)

    const auditoria = (await auditoriaDe(d.tenantId)).filter(
      (a) => a.entidade === 'empresa_da_conta',
    )
    expect(auditoria).toHaveLength(2)
    expect(auditoria[0]?.alteracoes).toMatchObject({
      nomeFantasia: { para: 'Associação Teste' },
      municipioCodigo: { de: null, para: 3205309 },
    })
    // repetir sem mudança não grava nada
    await chamar('patch', d.cookie, ROTA, { nomeFantasia: 'Associação Teste' })
    expect(
      (await auditoriaDe(d.tenantId)).filter((a) => a.entidade === 'empresa_da_conta'),
    ).toHaveLength(2)
  })

  it('a cidade diz a UF do mapa do Dashboard', async () => {
    const { d } = await equipe()
    await chamar('patch', d.cookie, ROTA, { endereco: { municipioCodigo: 3550308 } })
    const mapa = await chamar('get', d.cookie, '/v1/carteira/dashboard/mapa')
    expect((mapa.body as { uf: string | null }).uf).toBe('SP')
  })

  it('só quem tem empresa.configurar altera; validações', async () => {
    const { d, gestor, vendedor } = await equipe()
    for (const cookie of [gestor.cookie, vendedor.cookie]) {
      const r = await chamar('patch', cookie, ROTA, { nomeFantasia: 'X' })
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('acesso_negado')
    }
    const recusa = async (corpo: unknown) => {
      const r = await chamar('patch', d.cookie, ROTA, corpo)
      return { status: r.status, erro: erroDe(r) }
    }
    expect((await recusa({})).status).toBe(400)
    expect((await recusa({ cnpj: '123' })).status).toBe(400)
    expect((await recusa({ razaoSocial: ' ' })).status).toBe(400)
    expect((await recusa({ email: 'nao-e-email' })).status).toBe(400)
    expect((await recusa({ endereco: { cep: '123' } })).status).toBe(400)
    expect(await recusa({ endereco: { municipioCodigo: 9999999 } })).toEqual({
      status: 400,
      erro: 'municipio_invalido',
    })
  })

  it('cada empresa só vê e altera a própria linha', async () => {
    const a = await equipe()
    const b = await equipe()
    await chamar('patch', a.d.cookie, ROTA, { nomeFantasia: 'Só da A' })
    expect(((await chamar('get', b.d.cookie, ROTA)).body as DadosDaEmpresa).nomeFantasia).not.toBe(
      'Só da A',
    )
  })

  it('municípios da UF em ordem alfabética, para todo membro', async () => {
    const { vendedor } = await equipe()
    const r = await chamar('get', vendedor.cookie, `${ROTA}/municipios?uf=es`)
    expect(r.status).toBe(200)
    expect(r.headers['cache-control']).toContain('max-age=86400')
    const lista = r.body as MunicipiosDaUf
    expect(lista.map((m) => m.codigo)).toEqual(expect.arrayContaining([3201308, 3205309]))
    expect(
      lista.every((m, i) => i === 0 || lista[i - 1]!.nome.localeCompare(m.nome, 'pt-BR') <= 0),
    ).toBe(true)
    expect((await chamar('get', vendedor.cookie, `${ROTA}/municipios?uf=XX`)).status).toBe(400)
  })
})
