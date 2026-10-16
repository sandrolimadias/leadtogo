import type { Server } from 'node:http'

import type { Funil } from '@leadtogo/shared'
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

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  let r = request(app.getHttpServer())
    [metodo](`/v1/configuracoes/funis${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const funis = async (cookie: string, extra = '') =>
  (await chamar('get', cookie, extra)).body as Funil[]
const criarFunil = async (
  cookie: string,
  nome: string,
  fases: string[] = ['Contato', 'Fechamento'],
) =>
  (await chamar('post', cookie, '', { nome, fases: fases.map((f) => ({ nome: f })) })).body as Funil

describe('GET /v1/configuracoes/funis', () => {
  it('sem sessão 401; qualquer membro lê o funil padrão com as 4 fases', async () => {
    const d = await novoDono(app)
    const vendedor = await usuarioSimples(app)
    await vincular(d.tenantId, vendedor.id, 'vendedor')
    await ativar(vendedor.id, d.tenantId)
    expect((await chamar('get', undefined, '')).status).toBe(401)
    for (const cookie of [d.cookie, vendedor.cookie]) {
      const lista = await funis(cookie)
      expect(lista).toHaveLength(1)
      expect(lista[0]).toMatchObject({ nome: 'Vendas', padrao: true, ativo: true, ordem: 0 })
      expect(
        lista[0]?.fases.map(
          (f) => `${f.nome}:${f.cor}:${f.probabilidadePadrao}:${f.diasAlertaParada}`,
        ),
      ).toEqual([
        'Qualificação:teal:10:14',
        'Diagnóstico:blue:25:14',
        'Proposta:indigo:50:14',
        'Negociação:amber:75:14',
      ])
    }
  })
})

describe('permissões de escrita', () => {
  it('gestor e vendedor leem mas não escrevem (403)', async () => {
    const d = await novoDono(app)
    const [padrao] = await funis(d.cookie)
    const fase = padrao?.fases[0]
    const gestor = await usuarioSimples(app)
    await vincular(d.tenantId, gestor.id, 'gestor')
    await ativar(gestor.id, d.tenantId)
    const vendedor = await usuarioSimples(app)
    await vincular(d.tenantId, vendedor.id, 'vendedor')
    await ativar(vendedor.id, d.tenantId)
    for (const cookie of [gestor.cookie, vendedor.cookie]) {
      const tentativas = [
        chamar('post', cookie, '', { nome: 'X', fases: [{ nome: 'A' }] }),
        chamar('patch', cookie, `/${padrao?.id}`, { nome: 'X' }),
        chamar('delete', cookie, `/${padrao?.id}`),
        chamar('put', cookie, '/ordem', { ids: [padrao?.id] }),
        chamar('post', cookie, `/${padrao?.id}/fases`, { nome: 'X' }),
        chamar('patch', cookie, `/fases/${fase?.id}`, { nome: 'X' }),
        chamar('delete', cookie, `/fases/${fase?.id}`),
        chamar('put', cookie, `/${padrao?.id}/fases/ordem`, { ids: [fase?.id] }),
      ]
      for (const r of await Promise.all(tentativas)) {
        expect(r.status).toBe(403)
        expect(erroDe(r)).toBe('acesso_negado')
      }
    }
    expect(
      (await chamar('post', undefined, '', { nome: 'X', fases: [{ nome: 'A' }] })).status,
    ).toBe(401)
    expect(await funis(d.cookie)).toHaveLength(1)
  })
})

describe('funis', () => {
  it('cria com fases na ordem enviada (comum, não padrão) e registra a auditoria', async () => {
    const d = await novoDono(app)
    const r = await chamar('post', d.cookie, '', {
      nome: '  Renovação ',
      fases: [
        { nome: 'Contato', cor: 'teal', probabilidadePadrao: 20, diasAlertaParada: 7 },
        { nome: 'Proposta' },
      ],
    })
    expect(r.status).toBe(201)
    const f = r.body as Funil
    expect(f).toMatchObject({ nome: 'Renovação', padrao: false, ativo: true, ordem: 1 })
    expect(
      f.fases.map((x) => [x.nome, x.cor, x.probabilidadePadrao, x.diasAlertaParada, x.ordem]),
    ).toEqual([
      ['Contato', 'teal', 20, 7, 0],
      ['Proposta', 'gray', 0, null, 1],
    ])
    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'funil')
    expect(reg.map((x) => x.acao)).toEqual(['criar'])
    expect(reg[0]?.alteracoes).toEqual({ nome: 'Renovação', fases: ['Contato', 'Proposta'] })
  })

  it('valida: sem fases, fase inválida, extras e nomes repetidos (funil e fase) não criam nada', async () => {
    const d = await novoDono(app)
    for (const ruim of [
      { nome: 'X' },
      { nome: 'X', fases: [] },
      { nome: ' ', fases: [{ nome: 'A' }] },
      { nome: 'X', fases: [{ nome: 'A', probabilidadePadrao: 101 }] },
      { nome: 'X', fases: [{ nome: 'A', diasAlertaParada: 0 }] },
      { nome: 'X', fases: [{ nome: 'A' }], padrao: true },
    ]) {
      expect((await chamar('post', d.cookie, '', ruim)).status, JSON.stringify(ruim)).toBe(400)
    }
    const dupFunil = await chamar('post', d.cookie, '', { nome: 'vendas', fases: [{ nome: 'A' }] })
    expect(dupFunil.status).toBe(409)
    expect(erroDe(dupFunil)).toBe('nome_duplicado')
    const dupFase = await chamar('post', d.cookie, '', {
      nome: 'Novo',
      fases: [{ nome: 'A' }, { nome: 'a' }],
    })
    expect(dupFase.status).toBe(409)
    expect(await funis(d.cookie, '?incluirInativos=true')).toHaveLength(1)
  })

  it('o mesmo nome de fase pode existir em funis diferentes', async () => {
    const d = await novoDono(app)
    const f = await criarFunil(d.cookie, 'Pós-venda', ['Proposta', 'Negociação'])
    expect(f.fases.map((x) => x.nome)).toEqual(['Proposta', 'Negociação'])
  })

  it('tornar padrão troca o padrão (sempre um só); desmarcar, inativar o padrão e excluir o padrão não', async () => {
    const d = await novoDono(app)
    const [vendas] = await funis(d.cookie)
    const outro = await criarFunil(d.cookie, 'Renovação')

    const sem = await chamar('patch', d.cookie, `/${vendas?.id}`, { padrao: false })
    expect(sem.status).toBe(400)
    for (const r of [
      await chamar('patch', d.cookie, `/${vendas?.id}`, { ativo: false }),
      await chamar('delete', d.cookie, `/${vendas?.id}`),
    ]) {
      expect(r.status).toBe(409)
      expect(erroDe(r)).toBe('funil_padrao')
    }

    const r = await chamar('patch', d.cookie, `/${outro.id}`, { padrao: true })
    expect(r.status).toBe(200)
    expect((r.body as Funil).padrao).toBe(true)
    const depois = await funis(d.cookie)
    expect(depois.filter((x) => x.padrao).map((x) => x.nome)).toEqual(['Renovação'])
    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.acao === 'alterar')
    expect(reg[0]?.alteracoes).toEqual({ padrao: { de: false, para: true } })

    // agora o antigo padrão pode ser inativado e, depois, excluído
    expect((await chamar('patch', d.cookie, `/${vendas?.id}`, { ativo: false })).status).toBe(200)
    expect((await funis(d.cookie)).map((x) => x.nome)).toEqual(['Renovação'])
    expect((await chamar('delete', d.cookie, `/${vendas?.id}`)).status).toBe(204)
    expect((await chamar('delete', d.cookie, `/${vendas?.id}`)).status).toBe(404)
  })

  it('duas trocas de padrão ao mesmo tempo: as duas dão certo e sobra exatamente um padrão', async () => {
    const d = await novoDono(app)
    const b = await criarFunil(d.cookie, 'B')
    const c = await criarFunil(d.cookie, 'C')
    const [rb, rc] = await Promise.all([
      chamar('patch', d.cookie, `/${b.id}`, { padrao: true }),
      chamar('patch', d.cookie, `/${c.id}`, { padrao: true }),
    ])
    expect([rb.status, rc.status]).toEqual([200, 200])
    const padroes = (await funis(d.cookie, '?incluirInativos=true')).filter((f) => f.padrao)
    expect(padroes).toHaveLength(1)
    expect([b.id, c.id]).toContain(padroes[0]?.id)
  })

  it('funil inativo não vira padrão sem ser reativado; reativar e tornar padrão juntos funciona', async () => {
    const d = await novoDono(app)
    const outro = await criarFunil(d.cookie, 'Renovação')
    await chamar('patch', d.cookie, `/${outro.id}`, { ativo: false })
    const r = await chamar('patch', d.cookie, `/${outro.id}`, { padrao: true })
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('funil_inativo')
    const ok = await chamar('patch', d.cookie, `/${outro.id}`, { ativo: true, padrao: true })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ padrao: true, ativo: true })
  })

  it('renomeia (409 se repetir) e exclui o funil comum com as fases, liberando o nome', async () => {
    const d = await novoDono(app)
    const f = await criarFunil(d.cookie, 'Renovação')
    expect((await chamar('patch', d.cookie, `/${f.id}`, { nome: 'VENDAS' })).status).toBe(409)
    expect(
      (await chamar('patch', d.cookie, `/${f.id}`, { nome: 'Renovações' })).body,
    ).toMatchObject({
      nome: 'Renovações',
    })
    expect((await chamar('patch', d.cookie, `/${f.id}`, {})).status).toBe(400)
    expect((await chamar('patch', d.cookie, '/nao-e-uuid', { nome: 'A' })).status).toBe(400)
    expect((await chamar('delete', d.cookie, `/${f.id}`)).status).toBe(204)
    const [linha] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM funil_fases WHERE funil_id = ${f.id} AND excluido_em IS NOT NULL`
    })
    expect(linha?.n).toBe(2)
    expect(
      (await chamar('post', d.cookie, '', { nome: 'Renovações', fases: [{ nome: 'A' }] })).status,
    ).toBe(201)
  })

  it('reordena todos os funis; lista incompleta ou repetida é 400 ordem_invalida', async () => {
    const d = await novoDono(app)
    const [vendas] = await funis(d.cookie)
    const outro = await criarFunil(d.cookie, 'Renovação')
    const ok = await chamar('put', d.cookie, '/ordem', { ids: [outro.id, vendas?.id] })
    expect(ok.status).toBe(200)
    expect((await funis(d.cookie)).map((x) => x.nome)).toEqual(['Renovação', 'Vendas'])
    for (const ids of [[outro.id], [outro.id, outro.id]]) {
      const r = await chamar('put', d.cookie, '/ordem', { ids })
      expect(r.status).toBe(400)
      expect(erroDe(r)).toBe('ordem_invalida')
    }
  })

  it('inativos só aparecem com incluirInativos=true', async () => {
    const d = await novoDono(app)
    const outro = await criarFunil(d.cookie, 'Renovação')
    await chamar('patch', d.cookie, `/${outro.id}`, { ativo: false })
    expect(await funis(d.cookie)).toHaveLength(1)
    expect(await funis(d.cookie, '?incluirInativos=true')).toHaveLength(2)
    expect((await chamar('get', d.cookie, '?x=1')).status).toBe(400)
  })
})

describe('fases', () => {
  it('cria no fim, altera (inclusive tirar o alerta) e devolve o funil completo, com auditoria', async () => {
    const d = await novoDono(app)
    const [vendas] = await funis(d.cookie)
    const r = await chamar('post', d.cookie, `/${vendas?.id}/fases`, {
      nome: ' Pós-venda ',
      cor: 'green',
      probabilidadePadrao: 90,
      diasAlertaParada: 30,
    })
    expect(r.status).toBe(201)
    const f = r.body as Funil
    expect(f.fases).toHaveLength(5)
    const nova = f.fases[4]
    expect(nova).toMatchObject({
      nome: 'Pós-venda',
      cor: 'green',
      probabilidadePadrao: 90,
      diasAlertaParada: 30,
      ordem: 4,
    })

    const alt = await chamar('patch', d.cookie, `/fases/${nova?.id}`, {
      probabilidadePadrao: 95,
      diasAlertaParada: null,
    })
    expect(alt.status).toBe(200)
    expect((alt.body as Funil).fases[4]).toMatchObject({
      probabilidadePadrao: 95,
      diasAlertaParada: null,
    })

    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'funil_fase')
    expect(reg.map((x) => x.acao)).toEqual(['criar', 'alterar'])
    expect(reg[1]?.alteracoes).toEqual({
      probabilidadePadrao: { de: 90, para: 95 },
      diasAlertaParada: { de: 30, para: null },
    })
  })

  it('valida e recusa nome repetido no funil; fase de funil inexistente é 404', async () => {
    const d = await novoDono(app)
    const [vendas] = await funis(d.cookie)
    const q = vendas?.fases[0]
    const dup = await chamar('post', d.cookie, `/${vendas?.id}/fases`, { nome: 'qualificação' })
    expect(dup.status).toBe(409)
    expect(erroDe(dup)).toBe('nome_duplicado')
    const renomear = await chamar('patch', d.cookie, `/fases/${vendas?.fases[1]?.id}`, {
      nome: 'QUALIFICAÇÃO',
    })
    expect(renomear.status).toBe(409)
    for (const ruim of [
      {},
      { nome: ' ' },
      { nome: 'A', probabilidadePadrao: 101 },
      { nome: 'A', cor: '#fff' },
    ]) {
      expect((await chamar('post', d.cookie, `/${vendas?.id}/fases`, ruim)).status).toBe(400)
    }
    expect(
      (await chamar('patch', d.cookie, `/fases/${q?.id}`, { probabilidadePadrao: -1 })).status,
    ).toBe(400)
    expect(
      (await chamar('patch', d.cookie, `/fases/${q?.id}`, { funilId: vendas?.id })).status,
    ).toBe(400)
    expect(
      (await chamar('post', d.cookie, '/0199a000-0000-7000-8000-000000000001/fases', { nome: 'A' }))
        .status,
    ).toBe(404)
    expect(
      (
        await chamar('patch', d.cookie, '/fases/0199a000-0000-7000-8000-000000000001', {
          nome: 'A',
        })
      ).status,
    ).toBe(404)
  })

  it('exclui a fase (404 depois, nome liberado), mas nunca a última do funil', async () => {
    const d = await novoDono(app)
    const f = await criarFunil(d.cookie, 'Renovação', ['A', 'B'])
    const [a, b] = f.fases
    const r = await chamar('delete', d.cookie, `/fases/${a?.id}`)
    expect(r.status).toBe(200)
    expect((r.body as Funil).fases.map((x) => x.nome)).toEqual(['B'])
    expect((await chamar('delete', d.cookie, `/fases/${a?.id}`)).status).toBe(404)
    const ultima = await chamar('delete', d.cookie, `/fases/${b?.id}`)
    expect(ultima.status).toBe(409)
    expect(erroDe(ultima)).toBe('ultima_fase')
    expect((await chamar('post', d.cookie, `/${f.id}/fases`, { nome: 'A' })).status).toBe(201)
  })

  it('reordena as fases do funil; lista incompleta, repetida ou de outro funil é 400', async () => {
    const d = await novoDono(app)
    const [vendas] = await funis(d.cookie)
    const outro = await criarFunil(d.cookie, 'Renovação', ['X'])
    const ids = vendas?.fases.map((f) => f.id) ?? []
    const invertida = [...ids].reverse()
    const ok = await chamar('put', d.cookie, `/${vendas?.id}/fases/ordem`, { ids: invertida })
    expect(ok.status).toBe(200)
    expect((ok.body as Funil).fases.map((f) => f.id)).toEqual(invertida)
    for (const lista of [ids.slice(1), [...ids, ids[0]], [...ids.slice(1), outro.fases[0]?.id]]) {
      const r = await chamar('put', d.cookie, `/${vendas?.id}/fases/ordem`, { ids: lista })
      expect(r.status).toBe(400)
      expect(erroDe(r)).toBe('ordem_invalida')
    }
  })
})

describe('isolamento entre empresas', () => {
  it('quem administra a empresa A não vê nem altera funis e fases da B (404)', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app)
    const [funilB] = await funis(b.cookie)
    const faseB = funilB?.fases[0]
    expect((await funis(a.cookie)).map((f) => f.id)).not.toContain(funilB?.id)

    const tentativas = [
      chamar('patch', a.cookie, `/${funilB?.id}`, { nome: 'Invadido' }),
      chamar('delete', a.cookie, `/${funilB?.id}`),
      chamar('post', a.cookie, `/${funilB?.id}/fases`, { nome: 'Invasora' }),
      chamar('patch', a.cookie, `/fases/${faseB?.id}`, { nome: 'Invadida' }),
      chamar('delete', a.cookie, `/fases/${faseB?.id}`),
      chamar('put', a.cookie, `/${funilB?.id}/fases/ordem`, { ids: [faseB?.id] }),
    ]
    for (const r of await Promise.all(tentativas)) expect(r.status).toBe(404)

    const [funilA] = await funis(a.cookie)
    const mistura = await chamar('put', a.cookie, '/ordem', { ids: [funilA?.id, funilB?.id] })
    expect(mistura.status).toBe(400)

    // a B continua intacta, e o mesmo nome vale nas duas empresas
    const [depois] = await funis(b.cookie)
    expect(depois?.nome).toBe('Vendas')
    expect(depois?.fases).toHaveLength(4)
    expect((await funis(a.cookie))[0]?.nome).toBe('Vendas')
  })
})

describe('limite de 6 fases ativas por funil', () => {
  const nomes = (n: number) => Array.from({ length: n }, (_, i) => `Fase ${i + 1}`)

  it('um funil novo aceita 6 fases e recusa 7 (409 limite_de_fases_ativas)', async () => {
    const d = await novoDono(app)
    const seis = await chamar('post', d.cookie, '', {
      nome: 'Seis',
      fases: nomes(6).map((nome) => ({ nome })),
    })
    expect(seis.status).toBe(201)
    const sete = await chamar('post', d.cookie, '', {
      nome: 'Sete',
      fases: nomes(7).map((nome) => ({ nome })),
    })
    expect(sete.status).toBe(409)
    expect(erroDe(sete)).toBe('limite_de_fases_ativas')
  })

  it('não cria a 7ª fase ativa; inativar uma libera, e reativar com 6 ativas também é recusado', async () => {
    const d = await novoDono(app)
    const f = await criarFunil(d.cookie, 'Cheio', nomes(6))
    const sete = await chamar('post', d.cookie, `/${f.id}/fases`, { nome: 'Fase 7' })
    expect(sete.status).toBe(409)
    expect(erroDe(sete)).toBe('limite_de_fases_ativas')

    const [primeira, segunda] = f.fases
    const inativada = await chamar('patch', d.cookie, `/fases/${primeira?.id}`, { ativo: false })
    expect(inativada.status).toBe(200)
    const criada = await chamar('post', d.cookie, `/${f.id}/fases`, { nome: 'Fase 7' })
    expect(criada.status).toBe(201)
    expect((criada.body as Funil).fases.filter((x) => x.ativo)).toHaveLength(6)

    // de volta a 6 ativas: reativar a que estava inativa passaria de 6
    const reativar = await chamar('patch', d.cookie, `/fases/${primeira?.id}`, { ativo: true })
    expect(reativar.status).toBe(409)
    expect(erroDe(reativar)).toBe('limite_de_fases_ativas')
    // editar outra coisa de uma fase ativa continua valendo no funil cheio
    expect(
      (await chamar('patch', d.cookie, `/fases/${segunda?.id}`, { nome: 'Segunda' })).status,
    ).toBe(200)
  })

  it('fases inativas não contam: um funil com 6 ativas e 2 inativas vale; outro funil não é afetado', async () => {
    const d = await novoDono(app)
    const f = await criarFunil(d.cookie, 'Com inativas', nomes(6))
    await chamar('patch', d.cookie, `/fases/${f.fases[0]?.id}`, { ativo: false })
    await chamar('patch', d.cookie, `/fases/${f.fases[1]?.id}`, { ativo: false })
    expect((await chamar('post', d.cookie, `/${f.id}/fases`, { nome: 'A' })).status).toBe(201)
    expect((await chamar('post', d.cookie, `/${f.id}/fases`, { nome: 'B' })).status).toBe(201)
    expect((await chamar('post', d.cookie, `/${f.id}/fases`, { nome: 'C' })).status).toBe(409)
    // o limite é por funil
    const outro = await criarFunil(d.cookie, 'Outro', nomes(2))
    expect((await chamar('post', d.cookie, `/${outro.id}/fases`, { nome: 'Nova' })).status).toBe(
      201,
    )
  })
})
