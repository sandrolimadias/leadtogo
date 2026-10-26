/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- os corpos JSON do supertest chegam como any */
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { type ClamdFalso, eicar, subirClamdFalso } from '../testes/clamd-falso.js'
import { esperarAte } from '../testes/espera.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  entrarNoPortal,
  novaEmpresaCliente,
  novoAcesso,
} from '../testes/portal.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'

let app: INestApplication<Server>
let clamd: ClamdFalso
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)

beforeAll(async () => {
  clamd = await subirClamdFalso()
  const antivirus = { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(clamd.porta) }
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({ ...configuracaoDoPortalDeTeste, ...antivirus }),
  )
  worker = await subirWorkerDeTeste(antivirus)
})
afterAll(async () => {
  await worker.parar()
  await app.close()
  await clamd.parar()
})

const PDF = Buffer.from('%PDF-1.4 conteúdo inofensivo do guia')

async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  await configurarPortal(d.tenantId)
  const empresaA = await novaEmpresaCliente(d)
  const empresaB = await novaEmpresaCliente(d)
  const editor = await pessoa('Editor', { 'portal.documentos': null })
  const leitor = await pessoa('Leitor', { 'portal.ver': null })
  const semPortal = await pessoa('Sem portal', { 'chamados.ver': 'propria' })
  const acessoA = await novoAcesso(d, { empresaId: empresaA, nome: 'Maria da Silva' })
  const acessoB = await novoAcesso(d, { empresaId: empresaB, nome: 'Carlos Lima' })
  const cookieA = await entrarNoPortal(portal, acessoA)
  const cookieB = await entrarNoPortal(portal, acessoB)
  return { d, empresaA, empresaB, editor, leitor, semPortal, cookieA, cookieB }
}

type Cenario = Awaited<ReturnType<typeof cenario>>

const estadoNoBanco = async (tenantId: string, id: string) =>
  (
    await noTenant(
      tenantId,
      (tx) =>
        tx<{ estado: string }[]>`SELECT estado::text AS estado FROM documentos WHERE id = ${id}`,
    )
  )[0]?.estado

/** Cadastra, envia o arquivo ao armazenamento, confirma e espera o antivírus responder. */
async function publicar(
  c: Cenario,
  extra: Record<string, unknown> = {},
  bytes: Buffer = PDF,
  nome = 'guia.pdf',
) {
  const r = await crm('post', c.d.cookie, '/portal-documentos', {
    titulo: 'Guia rápido do portal',
    alcance: 'todos',
    arquivo: { nome, mime: 'application/pdf', tamanho: bytes.length },
    ...extra,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const { documento, envio } = r.body as { documento: { id: string }; envio: { url: string } }
  expect((await fetch(envio.url, { method: 'PUT', body: new Uint8Array(bytes) })).ok).toBe(true)
  const conf = await crm('post', c.d.cookie, `/portal-documentos/${documento.id}/confirmar`)
  expect(conf.status, JSON.stringify(conf.body)).toBe(200)
  await esperarAte(
    async () => (await estadoNoBanco(c.d.tenantId, documento.id)) !== 'pendente_varredura',
  )
  return documento.id
}

describe('permissões da equipe', () => {
  it('ver lista e baixa; documentos escreve; sem permissão do portal é 403', async () => {
    const c = await cenario()
    const id = await publicar(c)
    for (const [pessoa, esperado] of [
      [c.leitor, 200],
      [c.editor, 200],
      [c.semPortal, 403],
    ] as const) {
      expect((await crm('get', pessoa.cookie, '/portal-documentos')).status).toBe(esperado)
      expect((await crm('get', pessoa.cookie, `/portal-documentos/${id}/baixas`)).status).toBe(
        esperado,
      )
    }
    const corpo = {
      titulo: 'Outro documento',
      alcance: 'todos',
      arquivo: { nome: 'a.pdf', mime: 'application/pdf', tamanho: 10 },
    }
    expect((await crm('post', c.leitor.cookie, '/portal-documentos', corpo)).status).toBe(403)
    expect(
      (await crm('patch', c.leitor.cookie, `/portal-documentos/${id}`, { titulo: 'Novo título' }))
        .status,
    ).toBe(403)
    expect((await crm('delete', c.leitor.cookie, `/portal-documentos/${id}`)).status).toBe(403)
    expect((await crm('post', c.leitor.cookie, `/portal-documentos/${id}/confirmar`)).status).toBe(
      403,
    )
    expect((await crm('post', c.editor.cookie, '/portal-documentos', corpo)).status).toBe(201)
  })

  it('o portal do cliente não aceita a sessão do CRM e o CRM não aceita a do portal', async () => {
    const c = await cenario()
    expect((await portal('get', '/portal/documentos', { cookie: c.d.cookie })).status).toBe(401)
    expect((await portal('get', '/portal/documentos')).status).toBe(401)
    expect((await crm('get', c.cookieA, '/portal-documentos')).status).toBe(401)
  })
})

describe('publicar um documento', () => {
  it('envia, o antivírus libera e o cliente vê e baixa; o download fica registrado', async () => {
    const c = await cenario()
    const id = await publicar(c, { descricao: 'Passo a passo' })
    expect(await estadoNoBanco(c.d.tenantId, id)).toBe('limpo')
    const lista = await portal('get', '/portal/documentos', { cookie: c.cookieA })
    expect(lista.body.total).toBe(1)
    expect(lista.body.itens[0]).toMatchObject({
      id,
      titulo: 'Guia rápido do portal',
      descricao: 'Passo a passo',
      nome: 'guia.pdf',
      tamanho: PDF.length,
    })
    expect(Object.keys(lista.body.itens[0]).sort()).toEqual(
      ['descricao', 'id', 'nome', 'publicadoEm', 'tamanho', 'titulo'].sort(),
    )
    const baixa = await portal('post', `/portal/documentos/${id}/download`, { cookie: c.cookieA })
    expect(baixa.status, JSON.stringify(baixa.body)).toBe(200)
    expect(new Date(baixa.body.expiraEm).getTime() - Date.now()).toBeLessThanOrEqual(60_000)
    const arquivo = await fetch(baixa.body.url)
    expect(Buffer.from(await arquivo.arrayBuffer()).equals(PDF)).toBe(true)
    expect(arquivo.headers.get('content-disposition')).toContain('attachment')

    // a equipe vê quem baixou e o total
    await portal('post', `/portal/documentos/${id}/download`, { cookie: c.cookieB })
    const baixas = await crm('get', c.d.cookie, `/portal-documentos/${id}/baixas`)
    expect(baixas.body.total).toBe(2)
    expect(baixas.body.itens.map((b: { pessoa: string }) => b.pessoa).sort()).toEqual([
      'Carlos Lima',
      'Maria da Silva',
    ])
    expect(baixas.body.itens[0].empresa).toContain('Ltda')
    const detalhe = await crm('get', c.d.cookie, `/portal-documentos/${id}`)
    expect(detalhe.body.totalDownloads).toBe(2)
    expect(detalhe.body.arquivo).toMatchObject({ estado: 'limpo', enviado: true })
  })

  it('o infectado fica bloqueado: o cliente não vê nem baixa, e a equipe também não', async () => {
    const c = await cenario()
    const id = await publicar(c, {}, eicar(), 'virus.pdf')
    expect(await estadoNoBanco(c.d.tenantId, id)).toBe('infectado')
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieA })).body.total).toBe(0)
    expect(
      (await portal('post', `/portal/documentos/${id}/download`, { cookie: c.cookieA })).status,
    ).toBe(404)
    const equipe = await crm('get', c.d.cookie, `/portal-documentos/${id}/download`)
    expect(equipe.status).toBe(409)
    expect(equipe.body.erro).toBe('anexo_bloqueado')
    expect((await crm('get', c.d.cookie, `/portal-documentos/${id}`)).body.arquivo.estado).toBe(
      'infectado',
    )
  })

  it('em verificação o cliente não vê; a equipe baixa o limpo por uma URL de 5 minutos', async () => {
    const c = await cenario()
    const r = await crm('post', c.d.cookie, '/portal-documentos', {
      titulo: 'Ainda não enviado',
      alcance: 'todos',
      arquivo: { nome: 'a.pdf', mime: 'application/pdf', tamanho: PDF.length },
    })
    expect(r.status).toBe(201)
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieA })).body.total).toBe(0)
    const antes = await crm('get', c.d.cookie, `/portal-documentos/${r.body.documento.id}/download`)
    expect(antes.status).toBe(409)
    expect(antes.body.erro).toBe('anexo_em_verificacao')
    // confirmar sem ter enviado o arquivo
    const semEnvio = await crm(
      'post',
      c.d.cookie,
      `/portal-documentos/${r.body.documento.id}/confirmar`,
    )
    expect(semEnvio.status).toBe(409)
    expect(semEnvio.body.erro).toBe('anexo_nao_enviado')
    const id = await publicar(c)
    const ok = await crm('get', c.d.cookie, `/portal-documentos/${id}/download`)
    expect(ok.status).toBe(200)
    expect(Buffer.from(await (await fetch(ok.body.url)).arrayBuffer()).equals(PDF)).toBe(true)
  })

  it('arquivo com tamanho diferente do dito é recusado (400) e o documento descartado', async () => {
    const c = await cenario()
    const r = await crm('post', c.d.cookie, '/portal-documentos', {
      titulo: 'Tamanho errado',
      alcance: 'todos',
      arquivo: { nome: 'a.pdf', mime: 'application/pdf', tamanho: PDF.length + 100 },
    })
    await fetch(r.body.envio.url, { method: 'PUT', body: new Uint8Array(PDF) })
    const conf = await crm(
      'post',
      c.d.cookie,
      `/portal-documentos/${r.body.documento.id}/confirmar`,
    )
    expect(conf.status).toBe(400)
    expect(conf.body.erro).toBe('anexo_invalido')
    expect((await crm('get', c.d.cookie, `/portal-documentos/${r.body.documento.id}`)).status).toBe(
      404,
    )
  })

  it('validação: título curto, arquivo vazio ou grande demais, alcance sem empresa e empresa inexistente', async () => {
    const c = await cenario()
    const base = {
      titulo: 'Documento válido',
      alcance: 'todos',
      arquivo: { nome: 'a.pdf', mime: 'application/pdf', tamanho: 10 },
    }
    const post = (extra: Record<string, unknown>) =>
      crm('post', c.d.cookie, '/portal-documentos', { ...base, ...extra })
    expect((await post({ titulo: 'ab' })).status).toBe(400)
    expect((await post({ arquivo: { ...base.arquivo, tamanho: 0 } })).status).toBe(400)
    expect((await post({ arquivo: { ...base.arquivo, tamanho: 26 * 1024 * 1024 } })).status).toBe(
      400,
    )
    expect((await post({ alcance: 'empresas' })).status).toBe(400)
    const inexistente = await post({
      alcance: 'empresas',
      empresaIds: ['0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b'],
    })
    expect(inexistente.status).toBe(422)
    expect(inexistente.body.erro).toBe('empresa_invalida')
  })
})

describe('alcance, visibilidade e exclusão', () => {
  it('por empresas: só elas veem e baixam; trocar o alcance vale na hora', async () => {
    const c = await cenario()
    const id = await publicar(c, { alcance: 'empresas', empresaIds: [c.empresaA] })
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieA })).body.total).toBe(1)
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieB })).body.total).toBe(0)
    expect(
      (await portal('post', `/portal/documentos/${id}/download`, { cookie: c.cookieB })).status,
    ).toBe(404)
    const detalhe = await crm('get', c.d.cookie, `/portal-documentos/${id}`)
    expect(detalhe.body.empresas).toHaveLength(1)

    const troca = await crm('patch', c.d.cookie, `/portal-documentos/${id}`, {
      alcance: 'empresas',
      empresaIds: [c.empresaB],
    })
    expect(troca.status).toBe(200)
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieA })).body.total).toBe(0)
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieB })).body.total).toBe(1)
    await crm('patch', c.d.cookie, `/portal-documentos/${id}`, { alcance: 'todos', empresaIds: [] })
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieA })).body.total).toBe(1)
    expect(
      (await crm('patch', c.d.cookie, `/portal-documentos/${id}`, { empresaIds: [c.empresaA] }))
        .status,
    ).toBe(400)
  })

  it('tirar do portal esconde sem excluir; excluir some de vez; edição de título e descrição', async () => {
    const c = await cenario()
    const id = await publicar(c)
    const editado = await crm('patch', c.d.cookie, `/portal-documentos/${id}`, {
      titulo: 'Guia atualizado',
      descricao: 'v2',
    })
    expect(editado.body).toMatchObject({ titulo: 'Guia atualizado', descricao: 'v2' })
    await crm('patch', c.d.cookie, `/portal-documentos/${id}`, { visivelNoPortal: false })
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieA })).body.total).toBe(0)
    expect((await crm('get', c.d.cookie, '/portal-documentos')).body.total).toBe(1)
    await crm('patch', c.d.cookie, `/portal-documentos/${id}`, { visivelNoPortal: true })
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieA })).body.total).toBe(1)
    expect((await crm('delete', c.d.cookie, `/portal-documentos/${id}`)).status).toBe(204)
    expect((await portal('get', '/portal/documentos', { cookie: c.cookieA })).body.total).toBe(0)
    expect((await crm('get', c.d.cookie, `/portal-documentos/${id}`)).status).toBe(404)
    expect((await crm('delete', c.d.cookie, `/portal-documentos/${id}`)).status).toBe(404)
  })

  it('a busca acha pelo título e pela descrição, sem diferença de acento', async () => {
    const c = await cenario()
    await publicar(c, { titulo: 'Manual de instalação' })
    await publicar(c, { titulo: 'Tabela de preços', descricao: 'Valores do semestre' })
    const busca = async (termo: string): Promise<string[]> => {
      const r = await portal('get', `/portal/documentos?busca=${encodeURIComponent(termo)}`, {
        cookie: c.cookieA,
      })
      return (r.body.itens as { titulo: string }[]).map((i) => i.titulo)
    }
    expect(await busca('instalacao')).toEqual(['Manual de instalação'])
    expect(await busca('semestre')).toEqual(['Tabela de preços'])
    expect(await busca('inexistente')).toEqual([])
  })
})

describe('isolamento entre empresas da equipe', () => {
  it('o cliente e a equipe de outra empresa não veem nem mexem nos documentos', async () => {
    const x = await cenario()
    const y = await cenario()
    const doY = await publicar(y)
    expect((await portal('get', '/portal/documentos', { cookie: x.cookieA })).body.total).toBe(0)
    expect(
      (await portal('post', `/portal/documentos/${doY}/download`, { cookie: x.cookieA })).status,
    ).toBe(404)
    expect((await crm('get', x.d.cookie, `/portal-documentos/${doY}`)).status).toBe(404)
    expect(
      (await crm('patch', x.d.cookie, `/portal-documentos/${doY}`, { titulo: 'Invadido' })).status,
    ).toBe(404)
    expect((await crm('delete', x.d.cookie, `/portal-documentos/${doY}`)).status).toBe(404)
    expect((await crm('get', x.d.cookie, `/portal-documentos/${doY}/baixas`)).status).toBe(404)
  })
})
