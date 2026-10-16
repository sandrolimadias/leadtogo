import type { Server } from 'node:http'

import type { Preferencias } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novaEmpresa, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const F1 = '01a111e8-f08a-70b7-b5f3-52998ced0a3d'
const F2 = '01a111e8-f08a-70b7-b5f3-52998ced0a3e'

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
afterEach(() => app.close())

const ver = (cookie?: string) => {
  const r = request(app.getHttpServer()).get('/v1/me/preferencias')
  return cookie ? r.set('Cookie', cookie) : r
}
const alterar = (cookie: string, corpo: unknown) =>
  request(app.getHttpServer())
    .patch('/v1/me/preferencias')
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send(corpo as object)
const prefs = (r: request.Response) => r.body as Preferencias
const erroDe = (r: request.Response) => r.body as RespostaDeErro
const guardadoNoBanco = async (usuarioId: string, tenantId: string) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return (
      await tx<{ preferencias: unknown; atualizado_por: string | null }[]>`
      SELECT preferencias, atualizado_por FROM membros WHERE usuario_id = ${usuarioId}`
    )[0]
  })

describe('GET /v1/me/preferencias', () => {
  it('sem sessão: 401; sem empresa ativa: 409', async () => {
    expect((await ver()).status).toBe(401)
    const d = await novoDono(app, { semEmpresaAtiva: true })
    const r = await ver(d.cookie)
    expect(r.status).toBe(409)
    expect(erroDe(r).erro).toBe('sem_empresa_ativa')
  })

  it('devolve os padrões quando o membro ainda não escolheu nada', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    const r = await ver(d.cookie)
    expect(r.status).toBe(200)
    expect(prefs(r)).toEqual({
      tema: 'sistema',
      menuRecolhido: false,
      visaoDashboard: 'minha',
      filtroPadrao: {},
      porPagina: {},
      kanbanColapsadas: {},
    })
  })

  it('ignora lixo guardado no banco (chave antiga, valor inválido) sem perder o que está certo', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`UPDATE membros SET preferencias = ${tx.json({ tema: 'escuro', antiga: 1, menuRecolhido: 'talvez' })} WHERE usuario_id = ${d.usuarioId}`
    })
    expect(prefs(await ver(d.cookie))).toEqual({
      tema: 'escuro',
      menuRecolhido: false,
      visaoDashboard: 'minha',
      filtroPadrao: {},
      porPagina: {},
      kanbanColapsadas: {},
    })
  })
})

describe('PATCH /v1/me/preferencias', () => {
  it('grava só o que veio, mescla com o que já existia e devolve o resultado completo', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    const primeiro = await alterar(d.cookie, { tema: 'escuro', menuRecolhido: true })
    expect(primeiro.status).toBe(200)
    expect(prefs(primeiro)).toEqual({
      tema: 'escuro',
      menuRecolhido: true,
      visaoDashboard: 'minha',
      filtroPadrao: {},
      porPagina: {},
      kanbanColapsadas: {},
    })

    const segundo = await alterar(d.cookie, {
      visaoDashboard: 'equipe',
      filtroPadrao: { empresas: F1 },
      porPagina: {},
      kanbanColapsadas: {},
    })
    expect(prefs(segundo)).toEqual({
      tema: 'escuro',
      menuRecolhido: true,
      visaoDashboard: 'equipe',
      filtroPadrao: { empresas: F1 },
      porPagina: {},
      kanbanColapsadas: {},
    })
    const terceiro = await alterar(d.cookie, { filtroPadrao: { contatos: F2 } })
    expect(prefs(terceiro).filtroPadrao).toEqual({ empresas: F1, contatos: F2 }) // mescla por tela
    expect(prefs(await ver(d.cookie))).toEqual(prefs(terceiro))
  })

  it('null volta ao padrão e remove o filtro da tela; só guarda o que foge do padrão', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    await alterar(d.cookie, {
      tema: 'escuro',
      menuRecolhido: true,
      filtroPadrao: { empresas: F1, contatos: F2 },
      porPagina: {},
      kanbanColapsadas: {},
    })
    const r = await alterar(d.cookie, { tema: null, filtroPadrao: { empresas: null } })
    expect(prefs(r)).toEqual({
      tema: 'sistema',
      menuRecolhido: true,
      visaoDashboard: 'minha',
      filtroPadrao: { contatos: F2 },
      porPagina: {},
      kanbanColapsadas: {},
    })
    expect((await guardadoNoBanco(d.usuarioId, d.tenantId))?.preferencias).toEqual({
      menuRecolhido: true,
      filtroPadrao: { contatos: F2 },
    })
    await alterar(d.cookie, { menuRecolhido: null, filtroPadrao: { contatos: null } })
    expect((await guardadoNoBanco(d.usuarioId, d.tenantId))?.preferencias).toEqual({})
  })

  it('PATCH vazio não muda nada; registra quem atualizou', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    await alterar(d.cookie, { tema: 'claro' })
    expect(prefs(await alterar(d.cookie, {})).tema).toBe('claro')
    const linha = await guardadoNoBanco(d.usuarioId, d.tenantId)
    expect(linha?.atualizado_por).not.toBeNull()
  })

  it('porPagina: guarda por tabela (vale em qualquer aparelho), mescla e volta ao padrão com null', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    const primeiro = await alterar(d.cookie, { porPagina: { empresas: 50 } })
    expect(primeiro.status).toBe(200)
    expect(prefs(primeiro).porPagina).toEqual({ empresas: 50 })
    const segundo = await alterar(d.cookie, { porPagina: { contatos: 100 } })
    expect(prefs(segundo).porPagina).toEqual({ empresas: 50, contatos: 100 })
    // outra sessão do mesmo usuário lê o mesmo
    expect(prefs(await ver(d.cookie)).porPagina).toEqual({ empresas: 50, contatos: 100 })
    expect((await guardadoNoBanco(d.usuarioId, d.tenantId))?.preferencias).toEqual({
      porPagina: { empresas: 50, contatos: 100 },
    })
    const volta = await alterar(d.cookie, { porPagina: { empresas: null } })
    expect(prefs(volta).porPagina).toEqual({ contatos: 100 })
  })

  it('entrada inválida: 400 validacao_invalida, e nada é gravado', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    const ruins: unknown[] = [
      { tema: 'roxo' },
      { menuRecolhido: 'sim' },
      { visaoDashboard: 'todos' },
      { filtroPadrao: { desconhecida: F1 } },
      { filtroPadrao: { empresas: 'abc' } },
      { porPagina: { empresas: 10 } }, // só 25, 50 ou 100
      { porPagina: { empresas: 101 } },
      { porPagina: { tabela_inexistente: 25 } },
      { papel: 'admin' }, // chave que o cliente não pode mandar
      { tenantId: d.tenantId },
      [],
      'texto',
    ]
    for (const corpo of ruins) {
      const r = await alterar(d.cookie, corpo)
      expect(r.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(r).erro).toBe('validacao_invalida')
    }
    expect((await guardadoNoBanco(d.usuarioId, d.tenantId))?.preferencias).toEqual({})
  })

  it('são por empresa: o mesmo usuário tem preferências próprias em cada uma', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'vendedor')
    await ativar(d.usuarioId, d.tenantId)
    await alterar(d.cookie, { tema: 'escuro' })
    await ativar(d.usuarioId, b)
    expect(prefs(await ver(d.cookie)).tema).toBe('sistema') // na B ainda é o padrão
    await alterar(d.cookie, { tema: 'claro' })
    await ativar(d.usuarioId, d.tenantId)
    expect(prefs(await ver(d.cookie)).tema).toBe('escuro')
  })

  it('cada membro mexe só nas suas: o vendedor edita as dele e não toca nas do administrador', async () => {
    const d = await novoDono(app)
    const vendedor = await usuarioSimples(app)
    await vincular(d.tenantId, vendedor.id, 'vendedor')
    await ativar(d.usuarioId, d.tenantId)
    await ativar(vendedor.id, d.tenantId)
    await alterar(d.cookie, { tema: 'escuro', menuRecolhido: true })
    const r = await alterar(vendedor.cookie, { tema: 'claro' })
    expect(r.status).toBe(200)
    expect(prefs(r).tema).toBe('claro')
    expect(prefs(await ver(d.cookie))).toMatchObject({ tema: 'escuro', menuRecolhido: true }) // as do admin não mudaram
    expect(prefs(await ver(vendedor.cookie)).menuRecolhido).toBe(false)
  })

  it('empresas diferentes não se enxergam: o PATCH de uma não altera a outra', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app)
    await ativar(a.usuarioId, a.tenantId)
    await ativar(b.usuarioId, b.tenantId)
    await alterar(a.cookie, { tema: 'escuro' })
    await alterar(b.cookie, { tema: 'claro', visaoDashboard: 'equipe' })
    expect(prefs(await ver(a.cookie))).toMatchObject({ tema: 'escuro', visaoDashboard: 'minha' })
    expect(prefs(await ver(b.cookie))).toMatchObject({ tema: 'claro', visaoDashboard: 'equipe' })
  })

  it('PATCHs simultâneos não perdem alterações (FOR UPDATE)', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    await Promise.all([
      alterar(d.cookie, { tema: 'escuro' }),
      alterar(d.cookie, { menuRecolhido: true }),
      alterar(d.cookie, { visaoDashboard: 'equipe' }),
      alterar(d.cookie, { filtroPadrao: { empresas: F1 } }),
    ])
    expect(prefs(await ver(d.cookie))).toEqual({
      tema: 'escuro',
      menuRecolhido: true,
      visaoDashboard: 'equipe',
      filtroPadrao: { empresas: F1 },
      porPagina: {},
      kanbanColapsadas: {},
    })
  })
})
