import type { Server } from 'node:http'

import type { Tag, TagGrupo } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

// Estes testes fazem centenas de chamadas do mesmo IP: o limite global (300/min) não é o assunto aqui
let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({ TRUST_PROXY: '1', RATE_LIMIT_MAX: '100000' }),
  )
})
afterEach(() => app.close())

const BASE = '/v1/configuracoes'
type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  let r = request(app.getHttpServer())[metodo](`${BASE}${url}`).set('Origin', ORIGEM_DO_FRONT)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const grupos = async (cookie: string, extra = '') =>
  (await chamar('get', cookie, `/tag-grupos${extra}`)).body as TagGrupo[]

/** Empresa com os padrões (o primeiro acesso os cria), o administrador e uma pessoa com o papel dado. */
async function cenario(papel: 'gestor' | 'vendedor' = 'vendedor') {
  const d = await novoDono(app)
  const u = await usuarioSimples(app)
  await vincular(d.tenantId, u.id, papel)
  await ativar(u.id, d.tenantId)
  return { d, u }
}

describe('GET /v1/configuracoes/tag-grupos', () => {
  it('sem sessão 401; qualquer membro lê os padrões em ordem, com as tags dentro', async () => {
    const { d, u } = await cenario('vendedor')
    expect((await chamar('get', undefined, '/tag-grupos')).status).toBe(401)
    for (const cookie of [d.cookie, u.cookie]) {
      const g = await grupos(cookie)
      expect(g.map((x) => x.nome)).toEqual(['Status', 'Visitação'])
      expect(g[0]).toMatchObject({ selecao: 'unica', obrigatorio: true, sistema: true })
      expect(g[0]?.tags.map((t) => `${t.nome}:${t.cor}`)).toEqual([
        'Lead:teal',
        'Prospect:amber',
        'Cliente:green',
        'Inativo:gray',
      ])
      expect(g[1]).toMatchObject({ selecao: 'multipla', automatico: true, sistema: true })
      expect(g[1]?.tags.map((t) => t.nome)).toEqual(['Visitada', 'Contactada'])
    }
  })

  it('inativos só aparecem com incluirInativos=true; consulta desconhecida é 400', async () => {
    const { d } = await cenario()
    const status = (await grupos(d.cookie))[0] as TagGrupo
    const prospect = status.tags.find((t) => t.nome === 'Prospect') as Tag
    expect((await chamar('patch', d.cookie, `/tags/${prospect.id}`, { ativo: false })).status).toBe(
      200,
    )
    expect(((await grupos(d.cookie))[0] as TagGrupo).tags).toHaveLength(3)
    expect(((await grupos(d.cookie, '?incluirInativos=true'))[0] as TagGrupo).tags).toHaveLength(4)
    expect((await chamar('get', d.cookie, '/tag-grupos?x=1')).status).toBe(400)
  })
})

describe('permissões de escrita', () => {
  it('gestor e vendedor leem mas não escrevem (403); sem sessão 401', async () => {
    const { d, u } = await cenario('vendedor')
    const gestor = await usuarioSimples(app)
    await vincular(d.tenantId, gestor.id, 'gestor')
    await ativar(gestor.id, d.tenantId)
    const status = (await grupos(d.cookie))[0] as TagGrupo
    const tag = status.tags[0] as Tag
    for (const cookie of [gestor.cookie, u.cookie]) {
      const tentativas = [
        chamar('post', cookie, '/tag-grupos', { nome: 'X', selecao: 'multipla' }),
        chamar('patch', cookie, `/tag-grupos/${status.id}`, { nome: 'X' }),
        chamar('delete', cookie, `/tag-grupos/${status.id}`),
        chamar('put', cookie, '/tag-grupos/ordem', { ids: [status.id] }),
        chamar('post', cookie, '/tags', { tagGrupoId: status.id, nome: 'X' }),
        chamar('patch', cookie, `/tags/${tag.id}`, { nome: 'X' }),
        chamar('delete', cookie, `/tags/${tag.id}`),
        chamar('put', cookie, `/tag-grupos/${status.id}/tags/ordem`, { ids: [tag.id] }),
      ]
      for (const r of await Promise.all(tentativas)) {
        expect(r.status).toBe(403)
        expect(erroDe(r)).toBe('acesso_negado')
      }
    }
    expect(
      (await chamar('post', undefined, '/tags', { tagGrupoId: status.id, nome: 'X' })).status,
    ).toBe(401)
    // nada mudou
    expect(((await grupos(d.cookie))[0] as TagGrupo).tags.map((t) => t.nome)).toContain('Lead')
  })
})

describe('grupos', () => {
  it('cria (nome aparado, vai para o fim), altera e registra na auditoria com antes e depois', async () => {
    const { d } = await cenario()
    const r = await chamar('post', d.cookie, '/tag-grupos', {
      nome: '  Interesse ',
      selecao: 'multipla',
    })
    expect(r.status).toBe(201)
    const g = r.body as TagGrupo
    expect(g).toMatchObject({
      nome: 'Interesse',
      selecao: 'multipla',
      obrigatorio: false,
      sistema: false,
      automatico: false,
      ordem: 2,
      tags: [],
    })
    const alt = await chamar('patch', d.cookie, `/tag-grupos/${g.id}`, {
      nome: 'Interesses',
      selecao: 'unica',
      obrigatorio: true,
    })
    expect(alt.status).toBe(200)
    expect(alt.body).toMatchObject({ nome: 'Interesses', selecao: 'unica', obrigatorio: true })

    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'tag_grupo')
    expect(reg.map((x) => x.acao)).toEqual(['criar', 'alterar'])
    expect(reg[1]?.entidade_id).toBe(g.id)
    expect(reg[1]?.alteracoes).toEqual({
      nome: { de: 'Interesse', para: 'Interesses' },
      selecao: { de: 'multipla', para: 'unica' },
      obrigatorio: { de: false, para: true },
    })
    expect(reg[1]?.membro_id).not.toBeNull()
  })

  it('nome repetido (sem diferença de caixa) é 409 nome_duplicado; validação 400', async () => {
    const { d } = await cenario()
    const r = await chamar('post', d.cookie, '/tag-grupos', { nome: 'STATUS', selecao: 'unica' })
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('nome_duplicado')
    for (const ruim of [{}, { nome: ' ', selecao: 'unica' }, { nome: 'A', selecao: 'x' }]) {
      expect((await chamar('post', d.cookie, '/tag-grupos', ruim)).status).toBe(400)
    }
    expect((await chamar('patch', d.cookie, '/tag-grupos/nao-e-uuid', { nome: 'A' })).status).toBe(
      400,
    )
  })

  it('grupo do sistema: pode renomear; seleção, "obrigatório", inativar e excluir dão 409', async () => {
    const { d } = await cenario()
    const status = (await grupos(d.cookie))[0] as TagGrupo
    const ren = await chamar('patch', d.cookie, `/tag-grupos/${status.id}`, { nome: 'Situação' })
    expect(ren.status).toBe(200)
    for (const corpo of [{ selecao: 'multipla' }, { obrigatorio: false }, { ativo: false }]) {
      const r = await chamar('patch', d.cookie, `/tag-grupos/${status.id}`, corpo)
      expect(r.status, JSON.stringify(corpo)).toBe(409)
      expect(erroDe(r)).toBe('grupo_de_sistema')
    }
    // repetir o mesmo valor não é mudança
    expect(
      (await chamar('patch', d.cookie, `/tag-grupos/${status.id}`, { selecao: 'unica' })).status,
    ).toBe(200)
    const del = await chamar('delete', d.cookie, `/tag-grupos/${status.id}`)
    expect(del.status).toBe(409)
    expect(erroDe(del)).toBe('grupo_de_sistema')
  })

  it('exclui o grupo comum com as tags dele (exclusão lógica) e libera o nome', async () => {
    const { d } = await cenario()
    const g = (await chamar('post', d.cookie, '/tag-grupos', { nome: 'Temp', selecao: 'multipla' }))
      .body as TagGrupo
    await chamar('post', d.cookie, '/tags', { tagGrupoId: g.id, nome: 'A' })
    expect((await chamar('delete', d.cookie, `/tag-grupos/${g.id}`)).status).toBe(204)
    expect((await grupos(d.cookie, '?incluirInativos=true')).map((x) => x.nome)).not.toContain(
      'Temp',
    )
    expect((await chamar('delete', d.cookie, `/tag-grupos/${g.id}`)).status).toBe(404)
    expect(
      (await chamar('post', d.cookie, '/tag-grupos', { nome: 'Temp', selecao: 'unica' })).status,
    ).toBe(201)
    const [linha] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM tags WHERE tag_grupo_id = ${g.id} AND excluido_em IS NOT NULL`
    })
    expect(linha?.n).toBe(1)
  })

  it('reordena todos os grupos; lista incompleta, repetida ou alheia é 400 ordem_invalida', async () => {
    const { d } = await cenario()
    const [status, visitacao] = (await grupos(d.cookie)) as [TagGrupo, TagGrupo]
    const ok = await chamar('put', d.cookie, '/tag-grupos/ordem', {
      ids: [visitacao.id, status.id],
    })
    expect(ok.status).toBe(200)
    expect((await grupos(d.cookie)).map((x) => x.nome)).toEqual(['Visitação', 'Status'])
    for (const ids of [[status.id], [status.id, status.id], [status.id, visitacao.id, status.id]]) {
      const r = await chamar('put', d.cookie, '/tag-grupos/ordem', { ids })
      expect(r.status).toBe(400)
      expect(erroDe(r)).toBe('ordem_invalida')
    }
  })
})

describe('tags', () => {
  it('cria no fim do grupo (cor padrão cinza), altera nome e cor e registra a auditoria', async () => {
    const { d } = await cenario()
    const g = (
      await chamar('post', d.cookie, '/tag-grupos', { nome: 'Interesse', selecao: 'multipla' })
    ).body as TagGrupo
    const a = (await chamar('post', d.cookie, '/tags', { tagGrupoId: g.id, nome: ' Retrofit ' }))
      .body as Tag
    const b = (
      await chamar('post', d.cookie, '/tags', {
        tagGrupoId: g.id,
        nome: 'Monitoramento',
        cor: 'blue',
      })
    ).body as Tag
    expect(a).toMatchObject({
      nome: 'Retrofit',
      cor: 'gray',
      ordem: 0,
      chaveSistema: null,
      ativo: true,
    })
    expect(b).toMatchObject({ cor: 'blue', ordem: 1 })
    const alt = await chamar('patch', d.cookie, `/tags/${a.id}`, {
      nome: 'Retrofit CLP',
      cor: 'orange',
    })
    expect(alt.body).toMatchObject({ nome: 'Retrofit CLP', cor: 'orange' })
    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'tag')
    expect(reg.map((x) => x.acao)).toEqual(['criar', 'criar', 'alterar'])
    expect(reg[2]?.alteracoes).toEqual({
      nome: { de: 'Retrofit', para: 'Retrofit CLP' },
      cor: { de: 'gray', para: 'orange' },
    })
  })

  it('o nome é único dentro do grupo, mas pode repetir em outro; cor fora da paleta é 400', async () => {
    const { d } = await cenario()
    const status = (await grupos(d.cookie))[0] as TagGrupo
    const g = (
      await chamar('post', d.cookie, '/tag-grupos', { nome: 'Outro', selecao: 'multipla' })
    ).body as TagGrupo
    const dup = await chamar('post', d.cookie, '/tags', { tagGrupoId: status.id, nome: 'lead' })
    expect(dup.status).toBe(409)
    expect(erroDe(dup)).toBe('nome_duplicado')
    expect(
      (await chamar('post', d.cookie, '/tags', { tagGrupoId: g.id, nome: 'Lead' })).status,
    ).toBe(201)
    for (const ruim of [
      { tagGrupoId: g.id, nome: 'X', cor: '#ff0000' },
      { tagGrupoId: g.id, nome: 'X', cor: 'dourado' },
      { tagGrupoId: 'x', nome: 'X' },
      { tagGrupoId: g.id, nome: 'X', chaveSistema: 'lead' },
    ]) {
      expect((await chamar('post', d.cookie, '/tags', ruim)).status).toBe(400)
    }
    const renomear = await chamar('patch', d.cookie, `/tags/${(status.tags[1] as Tag).id}`, {
      nome: 'LEAD',
    })
    expect(renomear.status).toBe(409)
  })

  it('grupo inexistente 404; grupo automático (Visitação) não aceita tags novas', async () => {
    const { d } = await cenario()
    const visitacao = (await grupos(d.cookie))[1] as TagGrupo
    const auto = await chamar('post', d.cookie, '/tags', { tagGrupoId: visitacao.id, nome: 'Nova' })
    expect(auto.status).toBe(409)
    expect(erroDe(auto)).toBe('grupo_automatico')
    const sem = await chamar('post', d.cookie, '/tags', {
      tagGrupoId: '0199a000-0000-7000-8000-000000000001',
      nome: 'X',
    })
    expect(sem.status).toBe(404)
    expect(erroDe(sem)).toBe('grupo_nao_encontrado')
  })

  it('tag com regra do sistema: renomeia e recolore, mas não inativa nem exclui (409 tag_de_sistema)', async () => {
    const { d } = await cenario()
    const lead = ((await grupos(d.cookie))[0] as TagGrupo).tags[0] as Tag
    expect(lead.chaveSistema).toBe('lead')
    // Prospect e Inativo têm chave, mas nenhuma regra depende delas: podem sair de cena
    const prospect = ((await grupos(d.cookie))[0] as TagGrupo).tags[1] as Tag
    expect((await chamar('patch', d.cookie, `/tags/${prospect.id}`, { ativo: false })).status).toBe(
      200,
    )
    const ok = await chamar('patch', d.cookie, `/tags/${lead.id}`, {
      nome: 'Oportunidade',
      cor: 'blue',
    })
    expect(ok.body).toMatchObject({ nome: 'Oportunidade', cor: 'blue', chaveSistema: 'lead' })
    for (const r of [
      await chamar('patch', d.cookie, `/tags/${lead.id}`, { ativo: false }),
      await chamar('delete', d.cookie, `/tags/${lead.id}`),
    ]) {
      expect(r.status).toBe(409)
      expect(erroDe(r)).toBe('tag_de_sistema')
    }
  })

  it('exclui a tag comum (404 depois, nome liberado) e reordena as tags do grupo', async () => {
    const { d } = await cenario()
    const g = (await chamar('post', d.cookie, '/tag-grupos', { nome: 'G', selecao: 'multipla' }))
      .body as TagGrupo
    const [a, b, c] = [
      (await chamar('post', d.cookie, '/tags', { tagGrupoId: g.id, nome: 'A' })).body as Tag,
      (await chamar('post', d.cookie, '/tags', { tagGrupoId: g.id, nome: 'B' })).body as Tag,
      (await chamar('post', d.cookie, '/tags', { tagGrupoId: g.id, nome: 'C' })).body as Tag,
    ]
    const nova = await chamar('put', d.cookie, `/tag-grupos/${g.id}/tags/ordem`, {
      ids: [c.id, a.id, b.id],
    })
    expect(nova.status).toBe(200)
    expect((nova.body as TagGrupo).tags.map((t) => t.nome)).toEqual(['C', 'A', 'B'])
    const ruim = await chamar('put', d.cookie, `/tag-grupos/${g.id}/tags/ordem`, {
      ids: [a.id, b.id],
    })
    expect(ruim.status).toBe(400)
    expect(erroDe(ruim)).toBe('ordem_invalida')

    expect((await chamar('delete', d.cookie, `/tags/${a.id}`)).status).toBe(204)
    expect((await chamar('delete', d.cookie, `/tags/${a.id}`)).status).toBe(404)
    expect((await chamar('patch', d.cookie, `/tags/${a.id}`, { nome: 'Z' })).status).toBe(404)
    expect((await chamar('post', d.cookie, '/tags', { tagGrupoId: g.id, nome: 'A' })).status).toBe(
      201,
    )
  })
})

describe('isolamento entre empresas', () => {
  it('quem administra a empresa A não vê nem altera grupos e tags da B (404, igual a inexistente)', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app)
    const gruposB = await grupos(b.cookie)
    const grupoB = gruposB[0] as TagGrupo
    const tagB = grupoB.tags[0] as Tag

    // a lista de A traz só os de A
    const idsA = new Set(
      (await grupos(a.cookie)).flatMap((g) => [g.id, ...g.tags.map((t) => t.id)]),
    )
    expect(idsA.has(grupoB.id)).toBe(false)
    expect(idsA.has(tagB.id)).toBe(false)

    const tentativas = [
      chamar('patch', a.cookie, `/tag-grupos/${grupoB.id}`, { nome: 'Invadido' }),
      chamar('delete', a.cookie, `/tag-grupos/${grupoB.id}`),
      chamar('patch', a.cookie, `/tags/${tagB.id}`, { nome: 'Invadida' }),
      chamar('delete', a.cookie, `/tags/${tagB.id}`),
      chamar('post', a.cookie, '/tags', { tagGrupoId: grupoB.id, nome: 'Invasora' }),
      chamar('put', a.cookie, `/tag-grupos/${grupoB.id}/tags/ordem`, { ids: [tagB.id] }),
    ]
    for (const r of await Promise.all(tentativas)) expect(r.status).toBe(404)

    // a ordem de A não aceita ids de B
    const [grupoA] = await grupos(a.cookie)
    const mistura = await chamar('put', a.cookie, '/tag-grupos/ordem', {
      ids: [...(await grupos(a.cookie)).map((g) => g.id), grupoB.id],
    })
    expect(mistura.status).toBe(400)
    expect(grupoA).toBeDefined()

    // B continua intacto
    const depois = await grupos(b.cookie)
    expect(depois[0]).toMatchObject({ nome: 'Status' })
    expect(depois[0]?.tags.map((t) => t.nome)).toContain('Lead')
  })
})
