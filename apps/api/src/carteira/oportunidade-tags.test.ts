import type { Server } from 'node:http'

import type {
  EmpresaCarteira,
  KanbanDeOportunidades,
  ListaDeOportunidades,
  Oportunidade,
  TagGrupo,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

// Tags de oportunidade (docs/plano_oportunidades_kanban_e_tags.md): grupos com `aplicaA = 'oportunidade'`,
// que não valem para empresas nem contatos, aplicadas no cadastro, na edição e por PUT /oportunidades/:id/tags.

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
    .set('X-Forwarded-For', `10.8.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const OPS = '/v1/carteira/oportunidades'
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const nomes = (o: Oportunidade) => o.tags.map((t) => t.nome)

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
  extra: Record<string, unknown> = { aplicaA: 'oportunidade', selecao: 'multipla' },
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
const nova = async (cookie: string, corpo: Record<string, unknown>, status = 201) => {
  const r = await chamar('post', cookie, OPS, corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(status)
  return r.body as Oportunidade
}
const definir = (cookie: string, id: string, tagIds: string[]) =>
  chamar('put', cookie, `${OPS}/${id}/tags`, { tagIds })

describe('grupos de tags de oportunidade', () => {
  it('aplicaA=oportunidade traz só os de oportunidade; sem parâmetro continuam só os de empresa', async () => {
    const { d } = await cenario()
    await grupo(d.cookie, 'Tipo de negócio', ['Novo'])
    await grupo(d.cookie, 'Perfil', ['Técnico'], { aplicaA: 'contato', selecao: 'multipla' })
    const lista = async (q: string) =>
      ((await chamar('get', d.cookie, `/v1/configuracoes/tag-grupos${q}`)).body as TagGrupo[]).map(
        (g) => `${g.nome}:${g.aplicaA}`,
      )
    expect(await lista('?aplicaA=oportunidade')).toEqual(['Tipo de negócio:oportunidade'])
    expect(await lista('')).toEqual(['Status:empresa', 'Visitação:empresa', 'Cadastro:empresa'])
    expect(await lista('?aplicaA=todos')).toContain('Tipo de negócio:oportunidade')
  })

  it('não é obrigatório (400 na criação, 409 na alteração) e o nome é único entre os destinos', async () => {
    const { d } = await cenario()
    const criar = await chamar('post', d.cookie, '/v1/configuracoes/tag-grupos', {
      nome: 'Concorrente',
      selecao: 'unica',
      aplicaA: 'oportunidade',
      obrigatorio: true,
    })
    expect(criar.status).toBe(400)
    const g = await grupo(d.cookie, 'Concorrente', ['A'])
    const alterar = await chamar('patch', d.cookie, `/v1/configuracoes/tag-grupos/${g.id}`, {
      obrigatorio: true,
    })
    expect(alterar.status).toBe(409)
    const repetido = await chamar('post', d.cookie, '/v1/configuracoes/tag-grupos', {
      nome: 'Status',
      selecao: 'multipla',
      aplicaA: 'oportunidade',
    })
    expect(erroDe(repetido)).toBe('nome_duplicado')
  })
})

describe('tags da oportunidade', () => {
  it('no cadastro, na edição e pela rota de tags, na ordem do grupo e da tag; a auditoria registra', async () => {
    const { d } = await cenario()
    const tipo = await grupo(d.cookie, 'Tipo de negócio', ['Novo', 'Renovação', 'Upsell'])
    const e = await empresa(d.cookie, 'Mercado Bom')
    const o = await nova(d.cookie, {
      titulo: 'Contrato',
      empresaId: e.id,
      tagIds: [idDe(tipo, 'Upsell'), idDe(tipo, 'Novo')],
    })
    expect(nomes(o)).toEqual(['Novo', 'Upsell'])

    const editada = await chamar('patch', d.cookie, `${OPS}/${o.id}`, {
      tagIds: [idDe(tipo, 'Renovação')],
    })
    expect(editada.status, JSON.stringify(editada.body)).toBe(200)
    expect(nomes(editada.body as Oportunidade)).toEqual(['Renovação'])

    const r = await definir(d.cookie, o.id, [idDe(tipo, 'Novo'), idDe(tipo, 'Renovação')])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(nomes(r.body as Oportunidade)).toEqual(['Novo', 'Renovação'])
    // a ficha também traz
    expect(nomes((await chamar('get', d.cookie, `${OPS}/${o.id}`)).body as Oportunidade)).toEqual([
      'Novo',
      'Renovação',
    ])

    const auditoria = (await auditoriaDe(d.tenantId)).filter(
      (l) => l.entidade_id === o.id && l.acao === 'alterar_tags',
    )
    expect(auditoria.map((l) => l.alteracoes)).toEqual([
      { adicionadas: ['Renovação'], removidas: ['Novo', 'Upsell'] },
      { adicionadas: ['Novo'], removidas: [] },
    ])
  })

  it('tag de empresa ou de contato não entra; inativa não entra; seleção única aceita uma só', async () => {
    const { d } = await cenario()
    const e = await empresa(d.cookie, 'Padaria')
    const o = await nova(d.cookie, { titulo: 'Contrato', empresaId: e.id })
    const deContato = await grupo(d.cookie, 'Perfil', ['Técnico'], {
      aplicaA: 'contato',
      selecao: 'multipla',
    })
    const deEmpresa = (
      (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
    )[0]!
    expect(erroDe(await definir(d.cookie, o.id, [idDe(deContato, 'Técnico')]))).toBe('tag_invalida')
    expect(erroDe(await definir(d.cookie, o.id, [deEmpresa.tags[0]!.id]))).toBe('tag_invalida')

    const unica = await grupo(d.cookie, 'Concorrente', ['A', 'B'], {
      aplicaA: 'oportunidade',
      selecao: 'unica',
    })
    expect(erroDe(await definir(d.cookie, o.id, [idDe(unica, 'A'), idDe(unica, 'B')]))).toBe(
      'grupo_selecao_unica',
    )
    await chamar('patch', d.cookie, `/v1/configuracoes/tags/${idDe(unica, 'B')}`, { ativo: false })
    expect(erroDe(await definir(d.cookie, o.id, [idDe(unica, 'B')]))).toBe('tag_inativa')
    // na criação também
    await nova(
      d.cookie,
      { titulo: 'X', empresaId: e.id, tagIds: [idDe(deContato, 'Técnico')] },
      400,
    )
  })

  it('a oportunidade fechada aceita mudar as tags', async () => {
    const { d } = await cenario()
    const tipo = await grupo(d.cookie, 'Concorrente', ['Concorrente A'])
    const e = await empresa(d.cookie, 'Gráfica')
    const o = await nova(d.cookie, { titulo: 'Contrato', empresaId: e.id })
    await chamar('post', d.cookie, `${OPS}/${o.id}/fechar`, { status: 'conquistado' })
    const r = await definir(d.cookie, o.id, [idDe(tipo, 'Concorrente A')])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(nomes(r.body as Oportunidade)).toEqual(['Concorrente A'])
  })

  it('o Kanban e a lista trazem as tags e filtram pela tag da oportunidade', async () => {
    const { d } = await cenario()
    const tipo = await grupo(d.cookie, 'Tipo de negócio', ['Novo', 'Renovação'])
    const e = await empresa(d.cookie, 'Loja')
    const com = await nova(d.cookie, {
      titulo: 'Com tag',
      empresaId: e.id,
      tagIds: [idDe(tipo, 'Renovação')],
    })
    await nova(d.cookie, { titulo: 'Sem tag', empresaId: e.id })

    const kanban = (await chamar('get', d.cookie, `${OPS}/kanban`)).body as KanbanDeOportunidades
    const cards = kanban.fases.flatMap((f) => f.itens)
    expect(cards.find((c) => c.id === com.id)?.tags.map((t) => t.nome)).toEqual(['Renovação'])
    const filtrado = (
      await chamar('get', d.cookie, `${OPS}/kanban?tagOportunidadeId=${idDe(tipo, 'Renovação')}`)
    ).body as KanbanDeOportunidades
    expect(filtrado.fases.flatMap((f) => f.itens).map((c) => c.titulo)).toEqual(['Com tag'])

    const lista = (
      await chamar('get', d.cookie, `${OPS}?tagOportunidadeId=${idDe(tipo, 'Renovação')}`)
    ).body as ListaDeOportunidades
    expect(lista.itens.map((i) => i.titulo)).toEqual(['Com tag'])
    expect(lista.total).toBe(1)
  })

  it('tag usada só por oportunidade não se exclui, nem o grupo dela (409)', async () => {
    const { d } = await cenario()
    const tipo = await grupo(d.cookie, 'Tipo de negócio', ['Novo'])
    const e = await empresa(d.cookie, 'Oficina')
    await nova(d.cookie, { titulo: 'Contrato', empresaId: e.id, tagIds: [idDe(tipo, 'Novo')] })
    const tag = await chamar('delete', d.cookie, `/v1/configuracoes/tags/${idDe(tipo, 'Novo')}`)
    expect(erroDe(tag)).toBe('tag_em_uso')
    const g = await chamar('delete', d.cookie, `/v1/configuracoes/tag-grupos/${tipo.id}`)
    expect(erroDe(g)).toBe('grupo_em_uso')
  })

  it('a vendedora fora da carteira não mexe nas tags (404); outra empresa (tenant) também não', async () => {
    const { d, ana, bia } = await cenario()
    const tipo = await grupo(d.cookie, 'Tipo de negócio', ['Novo'])
    const e = await empresa(ana.cookie, 'Da Ana')
    const o = await nova(ana.cookie, { titulo: 'Contrato', empresaId: e.id })
    expect((await definir(bia.cookie, o.id, [idDe(tipo, 'Novo')])).status).toBe(404)
    const r = await definir(ana.cookie, o.id, [idDe(tipo, 'Novo')])
    expect(r.status, JSON.stringify(r.body)).toBe(200)

    const outro = await novoDono(app)
    expect((await definir(outro.cookie, o.id, [])).status).toBe(404)
    const tipoDoOutro = await grupo(outro.cookie, 'Tipo de negócio', ['Novo'])
    // a tag do outro tenant não existe para esta empresa
    expect(erroDe(await definir(ana.cookie, o.id, [idDe(tipoDoOutro, 'Novo')]))).toBe(
      'tag_invalida',
    )
  })
})
