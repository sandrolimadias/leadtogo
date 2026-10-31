/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- os corpos JSON do supertest chegam como any */
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  entrarNoPortal,
  novaEmpresaCliente,
  novoAcesso,
} from '../testes/portal.js'
import { dono } from '../testes/mundo.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'

let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)

beforeAll(async () => {
  app = await criarAppComRotas([], configuracaoDeTeste(configuracaoDoPortalDeTeste))
  worker = await subirWorkerDeTeste()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
})

const amanha = () => new Date(Date.now() + 86_400_000).toISOString()

/** Empresa da equipe com portal ligado, duas empresas-clientes (um acesso cada) e as duas pessoas da equipe. */
async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  await configurarPortal(d.tenantId)
  const empresaA = await novaEmpresaCliente(d)
  const empresaB = await novaEmpresaCliente(d)
  const editor = await pessoa('Editor', { 'portal.publicar': null })
  const moderador = await pessoa('Moderador', { 'portal.moderar': null })
  const leitor = await pessoa('Leitor', { 'portal.ver': null })
  const semPortal = await pessoa('Sem portal', { 'chamados.ver': 'propria' })
  const acessoA = await novoAcesso(d, { empresaId: empresaA, nome: 'Maria da Silva Souza' })
  const acessoB = await novoAcesso(d, { empresaId: empresaB, nome: 'Carlos Lima' })
  const cookieA = await entrarNoPortal(portal, acessoA)
  const cookieB = await entrarNoPortal(portal, acessoB)
  const publicar = async (corpo: Record<string, unknown>, cookie = d.cookie) => {
    const r = await crm('post', cookie, '/portal-publicacoes', {
      titulo: 'Aviso',
      corpo: 'Texto',
      alcance: 'todos',
      situacao: 'publicada',
      ...corpo,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    return r.body as { id: string }
  }
  return {
    d,
    empresaA,
    empresaB,
    editor,
    moderador,
    leitor,
    semPortal,
    acessoA,
    acessoB,
    cookieA,
    cookieB,
    publicar,
  }
}

describe('permissões da equipe', () => {
  it('ver lista; publicar altera; moderar só modera; sem permissão do portal é 403', async () => {
    const c = await cenario()
    const p = await c.publicar({})
    for (const [pessoa, esperado] of [
      [c.leitor, 200],
      [c.editor, 200],
      [c.moderador, 200],
      [c.semPortal, 403],
    ] as const) {
      expect((await crm('get', pessoa.cookie, '/portal-publicacoes')).status).toBe(esperado)
    }
    const corpo = { titulo: 'Novo', corpo: 'x', alcance: 'todos', situacao: 'rascunho' }
    expect((await crm('post', c.leitor.cookie, '/portal-publicacoes', corpo)).status).toBe(403)
    expect((await crm('post', c.moderador.cookie, '/portal-publicacoes', corpo)).status).toBe(403)
    expect((await crm('post', c.editor.cookie, '/portal-publicacoes', corpo)).status).toBe(201)
    expect(
      (
        await crm('put', c.editor.cookie, `/portal-publicacoes/${p.id}/comentarios-bloqueados`, {
          bloqueados: true,
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await crm('put', c.moderador.cookie, `/portal-publicacoes/${p.id}/comentarios-bloqueados`, {
          bloqueados: true,
        })
      ).status,
    ).toBe(200)
    expect(
      (await crm('get', c.editor.cookie, `/portal-publicacoes/${p.id}/comentarios`)).status,
    ).toBe(403)
    expect((await crm('delete', c.moderador.cookie, `/portal-publicacoes/${p.id}`)).status).toBe(
      403,
    )
  })

  it('o portal do cliente não aceita a sessão do CRM nas rotas dele', async () => {
    const c = await cenario()
    expect((await portal('get', '/portal/publicacoes', { cookie: c.d.cookie })).status).toBe(401)
    expect((await portal('get', '/portal/publicacoes')).status).toBe(401)
    expect((await crm('get', c.cookieA, '/portal-publicacoes')).status).toBe(401)
  })
})

describe('publicar, agendar, editar, fixar e excluir', () => {
  it('rascunho não aparece para o cliente; publicar faz aparecer; agenda no passado é 422', async () => {
    const c = await cenario()
    const rascunho = await c.publicar({ situacao: 'rascunho', titulo: 'Rascunho' })
    const feed = async () =>
      (await portal('get', '/portal/publicacoes', { cookie: c.cookieA })).body as {
        itens: { id: string; titulo: string }[]
        total: number
      }
    expect((await feed()).total).toBe(0)
    const r = await crm('patch', c.d.cookie, `/portal-publicacoes/${rascunho.id}`, {
      titulo: 'Rascunho',
      corpo: 'Texto',
      alcance: 'todos',
      situacao: 'publicada',
    })
    expect(r.status).toBe(200)
    expect(r.body.publicadaEm).not.toBeNull()
    expect((await feed()).itens.map((i) => i.titulo)).toEqual(['Rascunho'])

    const passado = await crm('post', c.d.cookie, '/portal-publicacoes', {
      titulo: 'Tarde',
      corpo: 'x',
      alcance: 'todos',
      situacao: 'agendada',
      agendadaPara: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(passado.status).toBe(422)
    expect(passado.body.erro).toBe('agenda_no_passado')
  })

  it('agendada só aparece depois do worker publicar; publicada não volta a rascunho (409)', async () => {
    const c = await cenario()
    const ag = await crm('post', c.d.cookie, '/portal-publicacoes', {
      titulo: 'Depois',
      corpo: 'x',
      alcance: 'todos',
      situacao: 'agendada',
      agendadaPara: amanha(),
    })
    expect(ag.status).toBe(201)
    expect(ag.body.situacao).toBe('agendada')
    const total = async () =>
      (await portal('get', '/portal/publicacoes', { cookie: c.cookieA })).body.total as number
    expect(await total()).toBe(0)
    await noTenant(
      c.d.tenantId,
      (tx) =>
        tx`UPDATE publicacoes SET agendada_para = now() - interval '1 minute' WHERE id = ${ag.body.id}`,
    )
    const [r] = await dono`SELECT app_publicar_agendadas() AS n`
    expect(Number(r?.['n'])).toBeGreaterThanOrEqual(1)
    expect(await total()).toBe(1)

    const volta = await crm('patch', c.d.cookie, `/portal-publicacoes/${ag.body.id}`, {
      titulo: 'Depois',
      corpo: 'x',
      alcance: 'todos',
      situacao: 'rascunho',
    })
    expect(volta.status).toBe(409)
    expect(volta.body.erro).toBe('publicacao_ja_publicada')
  })

  it('alcance por empresas: só elas veem; empresa inexistente é 422; lista vazia é 400', async () => {
    const c = await cenario()
    const soA = await c.publicar({ titulo: 'Só A', alcance: 'empresas', empresaIds: [c.empresaA] })
    const titulos = async (cookie: string) =>
      (
        (await portal('get', '/portal/publicacoes', { cookie })).body.itens as { titulo: string }[]
      ).map((i) => i.titulo)
    expect(await titulos(c.cookieA)).toEqual(['Só A'])
    expect(await titulos(c.cookieB)).toEqual([])
    expect(
      (await portal('get', `/portal/publicacoes/${soA.id}`, { cookie: c.cookieB })).status,
    ).toBe(404)
    const invalida = await crm('post', c.d.cookie, '/portal-publicacoes', {
      titulo: 'Teste X',
      corpo: 'y',
      alcance: 'empresas',
      empresaIds: ['0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b'],
      situacao: 'rascunho',
    })
    expect(invalida.status).toBe(422)
    expect(invalida.body.erro).toBe('empresa_invalida')
    const vazia = await crm('post', c.d.cookie, '/portal-publicacoes', {
      titulo: 'Teste X',
      corpo: 'y',
      alcance: 'empresas',
      situacao: 'rascunho',
    })
    expect(vazia.status).toBe(400)
  })

  it('fixa uma por vez, a fixada vem primeiro; só a publicada fixa; excluir some do portal', async () => {
    const c = await cenario()
    const a = await c.publicar({ titulo: 'Pub A' })
    const b = await c.publicar({ titulo: 'Pub B' })
    const rascunho = await c.publicar({ titulo: 'Rasc R', situacao: 'rascunho' })
    expect(
      (await crm('put', c.d.cookie, `/portal-publicacoes/${rascunho.id}/fixada`, { fixada: true }))
        .status,
    ).toBe(409)
    expect(
      (await crm('put', c.d.cookie, `/portal-publicacoes/${a.id}/fixada`, { fixada: true })).body
        .fixada,
    ).toBe(true)
    expect(
      (await crm('put', c.d.cookie, `/portal-publicacoes/${b.id}/fixada`, { fixada: true })).body
        .fixada,
    ).toBe(true)
    const lista = await crm('get', c.d.cookie, '/portal-publicacoes')
    expect(lista.body.itens.filter((i: { fixada: boolean }) => i.fixada)).toHaveLength(1)
    const feed = (await portal('get', '/portal/publicacoes', { cookie: c.cookieA })).body.itens as {
      titulo: string
      fixada: boolean
    }[]
    expect(feed[0]).toMatchObject({ titulo: 'Pub B', fixada: true })
    expect((await crm('delete', c.d.cookie, `/portal-publicacoes/${b.id}`)).status).toBe(204)
    expect((await crm('get', c.d.cookie, `/portal-publicacoes/${b.id}`)).status).toBe(404)
    expect((await crm('delete', c.d.cookie, `/portal-publicacoes/${b.id}`)).status).toBe(404)
    const depois = (await portal('get', '/portal/publicacoes', { cookie: c.cookieA })).body
      .itens as {
      titulo: string
    }[]
    expect(depois.map((i) => i.titulo)).toEqual(['Pub A'])
  })

  it('duplicar: a cópia nasce rascunho com o mesmo corpo e alcance, sem fixar e sem métricas', async () => {
    const c = await cenario()
    const original = await c.publicar({
      titulo: 'Original',
      corpo: 'Corpo **forte**',
      alcance: 'empresas',
      empresaIds: [c.empresaA],
    })
    expect(
      (await crm('put', c.d.cookie, `/portal-publicacoes/${original.id}/fixada`, { fixada: true }))
        .status,
    ).toBe(200)
    await portal('post', `/portal/publicacoes/${original.id}/reacoes`, {
      cookie: c.cookieA,
      corpo: { tipo: 'curtir' },
    })
    expect(
      (await crm('post', c.leitor.cookie, `/portal-publicacoes/${original.id}/duplicar`)).status,
    ).toBe(403)
    const r = await crm('post', c.editor.cookie, `/portal-publicacoes/${original.id}/duplicar`)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body).toMatchObject({
      titulo: 'Cópia de Original',
      corpo: 'Corpo **forte**',
      situacao: 'rascunho',
      alcance: 'empresas',
      fixada: false,
      publicadaEm: null,
      metricas: { leitores: 0, reacoes: { curtir: 0, parabens: 0 }, comentarios: 0 },
    })
    expect(r.body.empresas.map((e: { id: string }) => e.id)).toEqual([c.empresaA])
    expect(r.body.id).not.toBe(original.id)
    // A cópia é rascunho: o cliente não vê
    const feed = (await portal('get', '/portal/publicacoes', { cookie: c.cookieA })).body.itens as {
      titulo: string
    }[]
    expect(feed.map((i) => i.titulo)).toEqual(['Original'])
    const inexistente = '01900000-0000-7000-8000-000000000000'
    expect(
      (await crm('post', c.d.cookie, `/portal-publicacoes/${inexistente}/duplicar`)).status,
    ).toBe(404)
  })

  it('a lista traz as abas com contagens', async () => {
    const c = await cenario()
    await c.publicar({ titulo: 'Pub 1' })
    await c.publicar({ titulo: 'Rasc 1', situacao: 'rascunho' })
    await c.publicar({ titulo: 'Rasc 2', situacao: 'rascunho' })
    const todas = await crm('get', c.d.cookie, '/portal-publicacoes')
    expect(todas.body.abas).toEqual({ todas: 3, publicadas: 1, agendadas: 0, rascunhos: 2 })
    const so = await crm('get', c.d.cookie, '/portal-publicacoes?aba=rascunhos')
    expect(so.body.itens).toHaveLength(2)
  })
})

describe('o cliente: reações, comentários e denúncia', () => {
  it('a reação liga e desliga, os totais somam as empresas e o cliente nunca vê quem reagiu', async () => {
    const c = await cenario()
    const p = await c.publicar({})
    const reagir = (cookie: string, tipo: string) =>
      portal('post', `/portal/publicacoes/${p.id}/reacoes`, { cookie, corpo: { tipo } })
    expect((await reagir(c.cookieA, 'curtir')).body).toEqual({
      reacoes: { curtir: 1, parabens: 0 },
      minhasReacoes: ['curtir'],
    })
    expect((await reagir(c.cookieB, 'curtir')).body.reacoes.curtir).toBe(2)
    expect((await reagir(c.cookieB, 'parabens')).body.minhasReacoes).toEqual(
      ['parabens', 'curtir'].sort(),
    )
    const desfeita = await reagir(c.cookieA, 'curtir')
    expect(desfeita.body).toEqual({
      reacoes: { curtir: 1, parabens: 1 },
      minhasReacoes: [],
    })
    expect((await reagir(c.cookieA, 'amei')).status).toBe(400)
    const feed = (await portal('get', '/portal/publicacoes', { cookie: c.cookieA })).body
      .itens[0] as Record<string, unknown>
    expect(Object.keys(feed).sort()).toEqual(
      [
        'comentarios',
        'comentariosAbertos',
        'corpo',
        'fixada',
        'id',
        'minhasReacoes',
        'publicadaEm',
        'reacoes',
        'titulo',
      ].sort(),
    )
    // a equipe vê o total nas métricas
    const detalhe = await crm('get', c.d.cookie, `/portal-publicacoes/${p.id}`)
    expect(detalhe.body.metricas.reacoes).toEqual({ curtir: 1, parabens: 1 })
  })

  it('não reage nem comenta em publicação que não enxerga', async () => {
    const c = await cenario()
    const soB = await c.publicar({ alcance: 'empresas', empresaIds: [c.empresaB] })
    expect(
      (
        await portal('post', `/portal/publicacoes/${soB.id}/reacoes`, {
          cookie: c.cookieA,
          corpo: { tipo: 'curtir' },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await portal('post', `/portal/publicacoes/${soB.id}/comentarios`, {
          cookie: c.cookieA,
          corpo: { corpo: 'oi' },
        })
      ).status,
    ).toBe(404)
    expect(
      (await portal('get', `/portal/publicacoes/${soB.id}/comentarios`, { cookie: c.cookieA }))
        .status,
    ).toBe(404)
  })

  it('comentar: o outro cliente vê, só com nome reduzido (sem empresa); o texto é puro e limitado', async () => {
    const c = await cenario()
    const p = await c.publicar({})
    const r = await portal('post', `/portal/publicacoes/${p.id}/comentarios`, {
      cookie: c.cookieA,
      corpo: { corpo: '  Ótima notícia <b>x</b>  ' },
    })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({
      autorNome: 'Maria S.',
      corpo: 'Ótima notícia <b>x</b>',
      meu: true,
    })
    expect(Object.keys(r.body).sort()).toEqual(
      [
        'autorNome',
        'corpo',
        'criadoEm',
        'denunciado',
        'id',
        'meu',
        'oculto',
        'ocultoMotivo',
      ].sort(),
    )
    const doB = await portal('get', `/portal/publicacoes/${p.id}/comentarios`, {
      cookie: c.cookieB,
    })
    expect(doB.body.itens).toHaveLength(1)
    expect(doB.body.itens[0]).toMatchObject({ autorNome: 'Maria S.', meu: false })
    expect(JSON.stringify(doB.body)).not.toContain('Souza')
    expect(
      (
        await portal('post', `/portal/publicacoes/${p.id}/comentarios`, {
          cookie: c.cookieB,
          corpo: { corpo: '   ' },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await portal('post', `/portal/publicacoes/${p.id}/comentarios`, {
          cookie: c.cookieB,
          corpo: { corpo: 'x'.repeat(1001) },
        })
      ).status,
    ).toBe(400)
    const feedA = (await portal('get', '/portal/publicacoes', { cookie: c.cookieA })).body
      .itens[0] as { comentarios: number }
    expect(feedA.comentarios).toBe(1)
  })

  it('bloqueio da publicação e chave geral desligada fecham os comentários (409); ler continua', async () => {
    const c = await cenario()
    const p = await c.publicar({})
    const comentar = () =>
      portal('post', `/portal/publicacoes/${p.id}/comentarios`, {
        cookie: c.cookieA,
        corpo: { corpo: 'oi' },
      })
    expect((await comentar()).status).toBe(201)
    await crm('put', c.moderador.cookie, `/portal-publicacoes/${p.id}/comentarios-bloqueados`, {
      bloqueados: true,
    })
    const fechado = await comentar()
    expect(fechado.status).toBe(409)
    expect(fechado.body.erro).toBe('comentarios_fechados')
    const lista = await portal('get', `/portal/publicacoes/${p.id}/comentarios`, {
      cookie: c.cookieA,
    })
    expect(lista.body.itens).toHaveLength(1)
    expect(lista.body.comentariosAbertos).toBe(false)
    await crm('put', c.moderador.cookie, `/portal-publicacoes/${p.id}/comentarios-bloqueados`, {
      bloqueados: false,
    })
    expect((await comentar()).status).toBe(201)
    expect(
      (await crm('put', c.d.cookie, '/portal-configuracao', { comentariosAtivos: false })).status,
    ).toBe(200)
    expect((await comentar()).status).toBe(409)
    expect(
      (await portal('get', '/portal/publicacoes', { cookie: c.cookieA })).body.itens[0]
        .comentariosAbertos,
    ).toBe(false)
  })

  it('denúncia: só de comentário alheio e visível, uma vez; a equipe vê, mantém ou oculta', async () => {
    const c = await cenario()
    const p = await c.publicar({})
    const feito = await portal('post', `/portal/publicacoes/${p.id}/comentarios`, {
      cookie: c.cookieA,
      corpo: { corpo: 'Compre empilhadeiras no privado' },
    })
    const comentarioId = feito.body.id as string
    const denunciar = (cookie: string, motivo = 'spam') =>
      portal('post', `/portal/publicacoes/comentarios/${comentarioId}/denuncia`, {
        cookie,
        corpo: { motivo },
      })
    const propria = await denunciar(c.cookieA)
    expect(propria.status).toBe(422)
    expect(propria.body.erro).toBe('denuncia_propria')
    expect((await denunciar(c.cookieB, 'golpe')).status).toBe(400)
    expect((await denunciar(c.cookieB)).status).toBe(204)
    expect((await denunciar(c.cookieB)).status).toBe(204) // repetir é inofensivo
    const visto = await portal('get', `/portal/publicacoes/${p.id}/comentarios`, {
      cookie: c.cookieB,
    })
    expect(visto.body.itens[0].denunciado).toBe(true)

    const lista = await crm('get', c.d.cookie, '/portal-publicacoes')
    expect(lista.body.denunciasAbertas).toBe(1)
    const moderacao = await crm(
      'get',
      c.moderador.cookie,
      `/portal-publicacoes/${p.id}/comentarios`,
    )
    expect(moderacao.body.itens[0]).toMatchObject({
      denunciasAbertas: 1,
      motivoDaDenuncia: 'spam',
      oculto: false,
    })
    expect(moderacao.body.itens[0].empresaNome).toContain('Ltda')

    const ocultar = await crm(
      'patch',
      c.moderador.cookie,
      `/portal-publicacoes/${p.id}/comentarios/${comentarioId}`,
      { acao: 'ocultar' },
    )
    expect(ocultar.status).toBe(400) // sem motivo
    const ok = await crm(
      'patch',
      c.moderador.cookie,
      `/portal-publicacoes/${p.id}/comentarios/${comentarioId}`,
      {
        acao: 'ocultar',
        motivo: 'Propaganda',
      },
    )
    expect(ok.status).toBe(200)
    expect(ok.body.itens[0]).toMatchObject({
      oculto: true,
      ocultoMotivo: 'Propaganda',
      denunciasAbertas: 0,
    })
    // some para o outro cliente; o autor continua vendo, com o motivo
    expect(
      (await portal('get', `/portal/publicacoes/${p.id}/comentarios`, { cookie: c.cookieB })).body
        .itens,
    ).toHaveLength(0)
    const doAutor = await portal('get', `/portal/publicacoes/${p.id}/comentarios`, {
      cookie: c.cookieA,
    })
    expect(doAutor.body.itens[0]).toMatchObject({
      oculto: true,
      ocultoMotivo: 'Propaganda',
      meu: true,
    })
    expect(
      (await portal('get', '/portal/publicacoes', { cookie: c.cookieB })).body.itens[0].comentarios,
    ).toBe(0)
    // reexibir desfaz
    const volta = await crm(
      'patch',
      c.moderador.cookie,
      `/portal-publicacoes/${p.id}/comentarios/${comentarioId}`,
      { acao: 'reexibir' },
    )
    expect(volta.body.itens[0].oculto).toBe(false)
    expect(
      (await portal('get', `/portal/publicacoes/${p.id}/comentarios`, { cookie: c.cookieB })).body
        .itens,
    ).toHaveLength(1)
    // comentário de outra publicação não é moderado por aqui
    const outra = await c.publicar({})
    expect(
      (
        await crm(
          'patch',
          c.moderador.cookie,
          `/portal-publicacoes/${outra.id}/comentarios/${comentarioId}`,
          { acao: 'manter' },
        )
      ).status,
    ).toBe(404)
  })

  it('manter encerra as denúncias sem ocultar', async () => {
    const c = await cenario()
    const p = await c.publicar({})
    const feito = await portal('post', `/portal/publicacoes/${p.id}/comentarios`, {
      cookie: c.cookieA,
      corpo: { corpo: 'oi' },
    })
    await portal('post', `/portal/publicacoes/comentarios/${feito.body.id}/denuncia`, {
      cookie: c.cookieB,
      corpo: { motivo: 'ofensivo' },
    })
    const r = await crm(
      'patch',
      c.moderador.cookie,
      `/portal-publicacoes/${p.id}/comentarios/${feito.body.id}`,
      { acao: 'manter' },
    )
    expect(r.body.itens[0]).toMatchObject({ oculto: false, denunciasAbertas: 0 })
    expect((await crm('get', c.d.cookie, '/portal-publicacoes')).body.denunciasAbertas).toBe(0)
  })
})

describe('leituras e alcance', () => {
  it('registra uma leitura por pessoa, ignora publicação invisível e mede o alcance', async () => {
    const c = await cenario()
    const todas = await c.publicar({ titulo: 'Para todos' })
    const soB = await c.publicar({ titulo: 'Só B', alcance: 'empresas', empresaIds: [c.empresaB] })
    const ler = (cookie: string, ids: string[]) =>
      portal('post', '/portal/publicacoes/leituras', { cookie, corpo: { ids } })
    expect((await ler(c.cookieA, [todas.id, soB.id])).body).toEqual({ marcadas: 1 })
    expect((await ler(c.cookieA, [todas.id])).body).toEqual({ marcadas: 0 })
    expect((await ler(c.cookieB, [todas.id, soB.id])).body).toEqual({ marcadas: 2 })
    expect((await ler(c.cookieA, [])).status).toBe(400)
    const m = async (id: string) =>
      (await crm('get', c.d.cookie, `/portal-publicacoes/${id}`)).body.metricas as unknown
    expect(await m(todas.id)).toMatchObject({ leitores: 2, alvo: 2, empresasAlcancadas: 2 })
    expect(await m(soB.id)).toMatchObject({ leitores: 1, alvo: 1, empresasAlcancadas: 1 })
  })

  it('o alcance nunca passa de 100%: leitura de acesso revogado ou fora do alcance não conta', async () => {
    const c = await cenario()
    const outro = await novoAcesso(c.d, { empresaId: c.empresaA, nome: 'Ana Prado' })
    const cookieOutro = await entrarNoPortal(portal, outro)
    const todas = await c.publicar({ titulo: 'Para todos' })
    const soB = await c.publicar({ titulo: 'Só B', alcance: 'empresas', empresaIds: [c.empresaB] })
    const ler = (cookie: string, ids: string[]) =>
      portal('post', '/portal/publicacoes/leituras', { cookie, corpo: { ids } })
    await ler(c.cookieA, [todas.id])
    await ler(cookieOutro, [todas.id])
    await ler(c.cookieB, [todas.id, soB.id])
    const m = async (id: string) =>
      (await crm('get', c.d.cookie, `/portal-publicacoes/${id}`)).body.metricas as {
        leitores: number
        alvo: number
      }
    expect(await m(todas.id)).toMatchObject({ leitores: 3, alvo: 3 })
    // Revogar quem leu tira a pessoa do numerador E do denominador
    expect((await crm('delete', c.d.cookie, `/portal-acessos/${outro.acessoId}`)).status).toBe(204)
    expect(await m(todas.id)).toMatchObject({ leitores: 2, alvo: 2 })
    // A empresa B sai do alcance: a leitura antiga dela não conta mais
    expect(
      (
        await crm('patch', c.d.cookie, `/portal-publicacoes/${soB.id}`, {
          titulo: 'Só B',
          corpo: 'Texto',
          alcance: 'empresas',
          situacao: 'publicada',
          empresaIds: [c.empresaA],
        })
      ).status,
    ).toBe(200)
    const depois = await m(soB.id)
    expect(depois).toMatchObject({ leitores: 0, alvo: 1 })
    expect(depois.leitores).toBeLessThanOrEqual(depois.alvo)
  })
})

describe('isolamento entre empresas da equipe', () => {
  it('o cliente de uma empresa não vê nem mexe nas publicações de outra', async () => {
    const x = await cenario()
    const y = await cenario()
    const doY = await y.publicar({ titulo: 'Do Y' })
    expect((await portal('get', '/portal/publicacoes', { cookie: x.cookieA })).body.itens).toEqual(
      [],
    )
    expect(
      (await portal('get', `/portal/publicacoes/${doY.id}`, { cookie: x.cookieA })).status,
    ).toBe(404)
    expect(
      (
        await portal('post', `/portal/publicacoes/${doY.id}/reacoes`, {
          cookie: x.cookieA,
          corpo: { tipo: 'curtir' },
        })
      ).status,
    ).toBe(404)
    expect((await crm('get', x.d.cookie, `/portal-publicacoes/${doY.id}`)).status).toBe(404)
    expect(
      (
        await crm('patch', x.d.cookie, `/portal-publicacoes/${doY.id}`, {
          titulo: 'Invadido',
          corpo: 'x',
          alcance: 'todos',
          situacao: 'publicada',
        })
      ).status,
    ).toBe(404)
    expect((await crm('delete', x.d.cookie, `/portal-publicacoes/${doY.id}`)).status).toBe(404)
  })
})
