import type { Server } from 'node:http'

import type {
  Contato,
  EmpresaCarteira,
  HistoricoDaEmpresa,
  ListaDeContatos,
  TagGrupo,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

// Tags de contato (docs/plano_contatos_filtros_e_tags.md): grupos com `aplicaA = 'contato'`, que não
// valem para empresas, aplicadas no cadastro, na edição e pela rota PUT /contatos/:id/tags.

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
const nomes = (c: Contato) => c.tags.map((t) => t.nome)

/** Empresa com o administrador e duas vendedoras. */
async function cenario() {
  const d = await novoDono(app)
  const pessoa = async (nome: string) => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, 'vendedor', nome)
    await ativar(u.id, d.tenantId)
    return { ...u, membroId }
  }
  return { d, ana: await pessoa('Ana'), bia: await pessoa('Bia') }
}

/** Cria um grupo com as tags dadas e devolve o grupo com elas. */
async function grupo(
  cookie: string,
  nome: string,
  tags: string[],
  extra: Record<string, unknown> = { aplicaA: 'contato', selecao: 'multipla' },
): Promise<TagGrupo> {
  const g = await chamar('post', cookie, '/v1/configuracoes/tag-grupos', { nome, ...extra })
  expect(g.status, JSON.stringify(g.body)).toBe(201)
  const id = (g.body as TagGrupo).id
  for (const t of tags) {
    const r = await chamar('post', cookie, '/v1/configuracoes/tags', { tagGrupoId: id, nome: t })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
  }
  const todos = (await chamar('get', cookie, '/v1/configuracoes/tag-grupos?aplicaA=todos'))
    .body as TagGrupo[]
  return todos.find((x) => x.id === id) as TagGrupo
}
const idDe = (g: TagGrupo, nome: string) => g.tags.find((t) => t.nome === nome)?.id as string

const empresa = async (cookie: string, nome: string) => {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    razaoSocial: nome,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as EmpresaCarteira
}
const criar = async (cookie: string, corpo: Record<string, unknown>) => {
  const r = await chamar('post', cookie, CONTATOS, corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return contatoDe(r)
}

describe('grupos de tags de contato', () => {
  it('o GET sem parâmetro traz só os de empresa; aplicaA=contato só os de contato; todos, os dois', async () => {
    const { d } = await cenario()
    await grupo(d.cookie, 'Perfil', ['Técnico'])
    const lista = async (q: string) =>
      ((await chamar('get', d.cookie, `/v1/configuracoes/tag-grupos${q}`)).body as TagGrupo[]).map(
        (g) => `${g.nome}:${g.aplicaA}`,
      )
    expect(await lista('')).toEqual(['Status:empresa', 'Visitação:empresa', 'Cadastro:empresa'])
    expect(await lista('?aplicaA=contato')).toEqual(['Perfil:contato'])
    expect(await lista('?aplicaA=todos')).toEqual([
      'Status:empresa',
      'Visitação:empresa',
      'Cadastro:empresa',
      'Perfil:contato',
    ])
    expect((await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos?aplicaA=x')).status).toBe(
      400,
    )
  })

  it('não é obrigatório (400 na criação, 409 na alteração) e o destino não muda (400)', async () => {
    const { d } = await cenario()
    const r = await chamar('post', d.cookie, '/v1/configuracoes/tag-grupos', {
      nome: 'Perfil',
      selecao: 'unica',
      aplicaA: 'contato',
      obrigatorio: true,
    })
    expect(r.status).toBe(400)
    const g = await grupo(d.cookie, 'Perfil', [])
    const virar = await chamar('patch', d.cookie, `/v1/configuracoes/tag-grupos/${g.id}`, {
      obrigatorio: true,
    })
    expect(virar.status).toBe(409)
    expect(erroDe(virar)).toBe('grupo_de_contato')
    expect(
      (
        await chamar('patch', d.cookie, `/v1/configuracoes/tag-grupos/${g.id}`, {
          aplicaA: 'empresa',
        })
      ).status,
    ).toBe(400)
    // o nome é único entre empresa e contato
    expect(
      (
        await chamar('post', d.cookie, '/v1/configuracoes/tag-grupos', {
          nome: 'perfil',
          selecao: 'unica',
        })
      ).status,
    ).toBe(409)
  })

  it('tag ou grupo usado só por contato não se exclui (409): só inativar', async () => {
    const { d } = await cenario()
    const g = await grupo(d.cookie, 'Perfil', ['Técnico', 'Livre'])
    await criar(d.cookie, { nome: 'Com tag', tagIds: [idDe(g, 'Técnico')] })
    const tag = await chamar('delete', d.cookie, `/v1/configuracoes/tags/${idDe(g, 'Técnico')}`)
    expect(tag.status).toBe(409)
    expect(erroDe(tag)).toBe('tag_em_uso')
    const doGrupo = await chamar('delete', d.cookie, `/v1/configuracoes/tag-grupos/${g.id}`)
    expect(doGrupo.status).toBe(409)
    expect(erroDe(doGrupo)).toBe('grupo_em_uso')
    expect(
      (await chamar('delete', d.cookie, `/v1/configuracoes/tags/${idDe(g, 'Livre')}`)).status,
    ).toBe(204)
  })
})

describe('tags do contato', () => {
  it('cadastro e edição com tagIds; PUT /tags substitui; na ordem do grupo e da tag', async () => {
    const { d } = await cenario()
    const perfil = await grupo(d.cookie, 'Perfil', ['Técnico', 'Comprador'])
    const rel = await grupo(d.cookie, 'Relacionamento', ['Promotor', 'Detrator'], {
      aplicaA: 'contato',
      selecao: 'unica',
    })
    const c = await criar(d.cookie, {
      nome: 'Rogério',
      tagIds: [idDe(rel, 'Promotor'), idDe(perfil, 'Comprador'), idDe(perfil, 'Técnico')],
    })
    expect(nomes(c)).toEqual(['Técnico', 'Comprador', 'Promotor'])
    expect(c.tags[0]).toMatchObject({ cor: 'gray', tagGrupoId: perfil.id })

    const editado = contatoDe(
      await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, {
        tagIds: [idDe(rel, 'Detrator')],
      }),
    )
    expect(nomes(editado)).toEqual(['Detrator'])
    expect(editado.atualizadoEm > c.atualizadoEm).toBe(true)

    const r = await chamar('put', d.cookie, `${CONTATOS}/${c.id}/tags`, {
      tagIds: [idDe(perfil, 'Técnico')],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(nomes(contatoDe(r))).toEqual(['Técnico'])
    expect(
      nomes(contatoDe(await chamar('put', d.cookie, `${CONTATOS}/${c.id}/tags`, { tagIds: [] }))),
    ).toEqual([])
  })

  it('tag de empresa, inexistente, inativa ou duas do grupo de seleção única: 400 e nada muda', async () => {
    const { d } = await cenario()
    const perfil = await grupo(d.cookie, 'Perfil', ['Técnico', 'Antiga'])
    const rel = await grupo(d.cookie, 'Relacionamento', ['Promotor', 'Detrator'], {
      aplicaA: 'contato',
      selecao: 'unica',
    })
    const status = (
      (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
    )[0] as TagGrupo
    expect(
      (
        await chamar('patch', d.cookie, `/v1/configuracoes/tags/${idDe(perfil, 'Antiga')}`, {
          ativo: false,
        })
      ).status,
    ).toBe(200)
    const c = await criar(d.cookie, { nome: 'Contato', tagIds: [idDe(perfil, 'Técnico')] })
    for (const [tagIds, codigo] of [
      [[status.tags[0]?.id], 'tag_invalida'],
      [['01890000-0000-7000-8000-000000000000'], 'tag_invalida'],
      [[idDe(perfil, 'Antiga')], 'tag_inativa'],
      [[idDe(rel, 'Promotor'), idDe(rel, 'Detrator')], 'grupo_selecao_unica'],
    ] as const) {
      const r = await chamar('put', d.cookie, `${CONTATOS}/${c.id}/tags`, { tagIds })
      expect(r.status, codigo).toBe(400)
      expect(erroDe(r)).toBe(codigo)
      // na edição e no cadastro também
      expect(
        (await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, { tagIds, nome: 'Outro' })).status,
      ).toBe(400)
      expect((await chamar('post', d.cookie, CONTATOS, { nome: 'Novo', tagIds })).status).toBe(400)
    }
    const depois = contatoDe(await chamar('get', d.cookie, `${CONTATOS}/${c.id}`))
    expect(depois.nome).toBe('Contato')
    expect(nomes(depois)).toEqual(['Técnico'])
  })

  it('tag de contato não entra na empresa (ficha): 400 tag_invalida', async () => {
    const { d } = await cenario()
    const perfil = await grupo(d.cookie, 'Perfil', ['Técnico'])
    const e = await empresa(d.cookie, 'Usidantec')
    const ficha = await chamar('put', d.cookie, `/v1/carteira/empresas/${e.id}/tags`, {
      tagIds: [...e.tags.map((t) => t.id), idDe(perfil, 'Técnico')],
    })
    expect(ficha.status).toBe(400)
    expect(erroDe(ficha)).toBe('tag_invalida')
  })

  it('a vendedora edita as tags do contato da carteira dela; o da outra é 404; sem sessão 401', async () => {
    const { d, ana, bia } = await cenario()
    const perfil = await grupo(d.cookie, 'Perfil', ['Técnico'])
    const e = await empresa(ana.cookie, 'Da Ana')
    const c = await criar(ana.cookie, { nome: 'Contato da Ana', vinculo: { empresaId: e.id } })
    const corpo = { tagIds: [idDe(perfil, 'Técnico')] }
    expect((await chamar('put', undefined, `${CONTATOS}/${c.id}/tags`, corpo)).status).toBe(401)
    expect((await chamar('put', bia.cookie, `${CONTATOS}/${c.id}/tags`, corpo)).status).toBe(404)
    expect((await chamar('put', ana.cookie, `${CONTATOS}/${c.id}/tags`, corpo)).status).toBe(200)
    expect(
      (await chamar('put', ana.cookie, `${CONTATOS}/${c.id}/tags`, { tagIds: ['x'] })).status,
    ).toBe(400)
  })

  it('isolamento: o contato e as tags de outra empresa do grupo não se alcançam', async () => {
    const { d } = await cenario()
    const perfil = await grupo(d.cookie, 'Perfil', ['Técnico'])
    const c = await criar(d.cookie, { nome: 'Isolado' })
    const outro = await novoDono(app)
    const corpo = { tagIds: [idDe(perfil, 'Técnico')] }
    expect((await chamar('put', outro.cookie, `${CONTATOS}/${c.id}/tags`, corpo)).status).toBe(404)
    // a tag da empresa A é inexistente para um contato da B
    const deB = await criar(outro.cookie, { nome: 'Da B' })
    const r = await chamar('put', outro.cookie, `${CONTATOS}/${deB.id}/tags`, corpo)
    expect(r.status).toBe(400)
    expect(erroDe(r)).toBe('tag_invalida')
  })

  it('lista: as tags de cada contato e o filtro tagContatoId', async () => {
    const { d } = await cenario()
    const perfil = await grupo(d.cookie, 'Perfil', ['Técnico', 'Comprador'])
    await criar(d.cookie, { nome: 'Ana Técnica', tagIds: [idDe(perfil, 'Técnico')] })
    await criar(d.cookie, { nome: 'Bruno Comprador', tagIds: [idDe(perfil, 'Comprador')] })
    await criar(d.cookie, { nome: 'Carla sem tag' })
    const lista = async (q = '') =>
      (await chamar('get', d.cookie, `${CONTATOS}${q}`)).body as ListaDeContatos
    expect((await lista()).itens.map((i) => [i.nome, i.tags.map((t) => t.nome)])).toEqual([
      ['Ana Técnica', ['Técnico']],
      ['Bruno Comprador', ['Comprador']],
      ['Carla sem tag', []],
    ])
    const filtrada = await lista(`?tagContatoId=${idDe(perfil, 'Comprador')}`)
    expect(filtrada.total).toBe(1)
    expect(filtrada.itens.map((i) => i.nome)).toEqual(['Bruno Comprador'])
  })

  it('histórico do contato: tags no cadastro e "Tags alteradas" com as adicionadas e as removidas', async () => {
    const { d } = await cenario()
    const perfil = await grupo(d.cookie, 'Perfil', ['Técnico', 'Comprador'])
    const c = await criar(d.cookie, { nome: 'Contato', tagIds: [idDe(perfil, 'Técnico')] })
    await chamar('put', d.cookie, `${CONTATOS}/${c.id}/tags`, {
      tagIds: [idDe(perfil, 'Comprador')],
    })
    // sem mudança: nada novo no histórico
    await chamar('put', d.cookie, `${CONTATOS}/${c.id}/tags`, {
      tagIds: [idDe(perfil, 'Comprador')],
    })
    const h = (await chamar('get', d.cookie, `${CONTATOS}/${c.id}/historico`))
      .body as HistoricoDaEmpresa
    expect(h.itens.map((i) => i.titulo)).toEqual(['Tags alteradas', 'Contato cadastrado'])
    expect(h.itens[0]?.mudancas).toEqual([
      { campo: 'adicionadas', rotulo: 'Tags adicionadas', de: null, para: 'Comprador' },
      { campo: 'removidas', rotulo: 'Tags removidas', de: 'Técnico', para: null },
    ])
    expect(h.itens[1]?.mudancas).toContainEqual({
      campo: 'tags',
      rotulo: 'Tags',
      de: null,
      para: 'Técnico',
    })
  })
})
