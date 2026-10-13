import type { Server } from 'node:http'

import type { Contato, EmpresaCarteira, HistoricoDaEmpresa } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

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

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.7.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const CONTATOS = '/v1/carteira/contatos'
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const contatoDe = (r: request.Response) => r.body as Contato

/** Empresa com o administrador, um gestor e dois vendedores. */
async function cenario() {
  const d = await novoDono(app)
  const pessoa = async (papel: 'gestor' | 'vendedor', nome: string) => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, papel, nome)
    await ativar(u.id, d.tenantId)
    return { ...u, membroId }
  }
  return {
    d,
    gestor: await pessoa('gestor', 'Gestor'),
    ana: await pessoa('vendedor', 'Ana'),
    bia: await pessoa('vendedor', 'Bia'),
  }
}
const empresa = async (cookie: string, nome: string, extra: Record<string, unknown> = {}) => {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    razaoSocial: nome,
    ...extra,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as EmpresaCarteira
}
const criar = async (cookie: string, corpo: Record<string, unknown>) => {
  const r = await chamar('post', cookie, CONTATOS, corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return contatoDe(r)
}

const historico = async (cookie: string | undefined, id: string, pagina = 1, porPagina = 20) =>
  chamar('get', cookie, `${CONTATOS}/${id}/historico?pagina=${pagina}&porPagina=${porPagina}`)
const titulos = (r: request.Response) => (r.body as HistoricoDaEmpresa).itens.map((i) => i.titulo)

describe('GET /v1/carteira/contatos/:id/historico', () => {
  it('conta a vida do contato em português, do mais recente para o mais antigo', async () => {
    const { d } = await cenario()
    const alfa = await empresa(d.cookie, 'Alfa')
    const beta = await empresa(d.cookie, 'Beta')
    const c = await criar(d.cookie, {
      nome: 'Rogério',
      vinculo: { empresaId: alfa.id, cargo: 'Sócio' },
    })
    expect((await historico(undefined, c.id)).status).toBe(401)

    await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, {
      nome: 'Rogério Bindaco',
      telefones: [{ numero: '27998472210', tipo: 'whatsapp', principal: true }],
    })
    await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, { aceitaWhatsapp: false })
    await chamar('post', d.cookie, `${CONTATOS}/${c.id}/vinculos`, {
      empresaId: beta.id,
      cargo: 'Contador',
    })
    await chamar('patch', d.cookie, `${CONTATOS}/${c.id}/vinculos/${beta.id}`, {
      cargo: 'Diretor',
    })
    await chamar('patch', d.cookie, `${CONTATOS}/${c.id}/vinculos/${beta.id}`, { ativo: false })
    await chamar('patch', d.cookie, `${CONTATOS}/${c.id}/vinculos/${beta.id}`, { ativo: true })

    const r = await historico(d.cookie, c.id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(titulos(r)).toEqual([
      'Vínculo com Beta reativado',
      'Vínculo com Beta inativado',
      'Vínculo com Beta alterado',
      'Vinculado a Beta',
      'Consentimento alterado',
      'Dados alterados',
      'Contato cadastrado',
    ])
    const itens = (r.body as HistoricoDaEmpresa).itens
    expect(itens.every((i) => i.por.id !== null && !i.automatica)).toBe(true)
    expect(itens.map((i) => i.em)).toEqual([...itens.map((i) => i.em)].sort().reverse())

    const cadastro = itens[6]
    expect(cadastro?.mudancas).toEqual([
      { campo: 'empresa', rotulo: 'Empresa', de: null, para: 'Alfa' },
      { campo: 'cargo', rotulo: 'Cargo', de: null, para: 'Sócio' },
    ])
    const dados = itens[5]?.mudancas ?? []
    expect(dados.find((m) => m.campo === 'nome')).toMatchObject({
      rotulo: 'Nome',
      de: 'Rogério',
      para: 'Rogério Bindaco',
    })
    expect(dados.find((m) => m.campo === 'telefones')).toMatchObject({
      rotulo: 'Telefones',
      de: null,
      para: '(27) 99847-2210',
    })
    expect(itens[4]?.mudancas).toEqual([
      { campo: 'aceitaWhatsapp', rotulo: 'Aceita WhatsApp', de: 'Sim', para: 'Não' },
    ])
    expect(itens[3]?.mudancas).toEqual([
      { campo: 'cargo', rotulo: 'Cargo', de: null, para: 'Contador' },
    ])
    expect(itens[2]?.mudancas).toEqual([
      { campo: 'cargo', rotulo: 'Cargo', de: 'Contador', para: 'Diretor' },
    ])
  })

  it('pagina, e o total conta tudo', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const c = await criar(d.cookie, { nome: 'Rogério', vinculo: { empresaId: a.id } })
    for (const nome of ['Um', 'Dois', 'Três']) {
      await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, { nome })
    }
    const p1 = (await historico(d.cookie, c.id, 1, 3)).body as HistoricoDaEmpresa
    const p2 = (await historico(d.cookie, c.id, 2, 3)).body as HistoricoDaEmpresa
    expect(p1).toMatchObject({ total: 4, pagina: 1, porPagina: 3 })
    expect(p1.itens).toHaveLength(3)
    expect(p2.itens.map((i) => i.titulo)).toEqual(['Contato cadastrado'])
  })

  it('quem não vê o contato recebe 404; o vendedor não vê as linhas de empresa que não é dele', async () => {
    const { d, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const c = await criar(d.cookie, {
      nome: 'Compartilhado',
      vinculo: { empresaId: daAna.id, cargo: 'Dono' },
    })
    await chamar('post', d.cookie, `${CONTATOS}/${c.id}/vinculos`, {
      empresaId: daBia.id,
      cargo: 'Sócio',
    })
    await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, { nome: 'Compartilhado 2' })

    expect(titulos(await historico(d.cookie, c.id))).toEqual([
      'Dados alterados',
      'Vinculado a Da Bia',
      'Contato cadastrado',
    ])
    const daVendedora = await historico(ana.cookie, c.id)
    expect(daVendedora.status).toBe(200)
    expect(titulos(daVendedora)).toEqual(['Dados alterados', 'Contato cadastrado'])
    expect((daVendedora.body as HistoricoDaEmpresa).total).toBe(2)
    expect(JSON.stringify(daVendedora.body)).not.toContain('Da Bia')

    // A Bia também vê o contato (pela empresa dela), e a empresa da Ana é que fica de fora
    const daBiaVendo = await historico(bia.cookie, c.id)
    expect(titulos(daBiaVendo)).toEqual(['Dados alterados', 'Vinculado a Da Bia'])
    expect(JSON.stringify(daBiaVendo.body)).not.toContain('Da Ana')

    // contato que ela não vê: 404
    const soDaBia = await criar(bia.cookie, { nome: 'Só da Bia', vinculo: { empresaId: daBia.id } })
    const negado = await historico(ana.cookie, soDaBia.id)
    expect(negado.status).toBe(404)
    expect(erroDe(negado)).toBe('contato_nao_encontrado')
  })

  it('outra empresa (tenant) não lê o histórico: 404', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const c = await criar(d.cookie, { nome: 'Rogério', vinculo: { empresaId: a.id } })
    const outro = await novoDono(app)
    expect((await historico(outro.cookie, c.id)).status).toBe(404)
  })
})
