import type { Server } from 'node:http'

import { camposDeVisitaSchema } from '@leadtogo/shared'
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
    [metodo](`/v1/configuracoes/visitas/${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

interface Campo {
  id: string
  rotulo: string
  tipo: string
  obrigatorio: boolean
  [k: string]: unknown
}
interface Modelo {
  id: string
  nome: string
  padrao: boolean
  ativo: boolean
  emUso: boolean
  resultados: number
  versaoAtual: { id: string; numero: number; campos: Campo[] }
}
interface Resultado {
  id: string
  nome: string
  chaveSistema: string | null
  modeloId: string
  ativo: boolean
}

const uuid = (n: number) => `0199a000-0000-7000-8000-${String(n).padStart(12, '0')}`
const texto = (n: number, rotulo = `Pergunta ${n}`): Campo => ({
  id: uuid(n),
  rotulo,
  tipo: 'texto_curto',
  obrigatorio: false,
})

const modelos = async (cookie: string, extra = '') =>
  (await chamar('get', cookie, `modelos${extra}`)).body as Modelo[]
const resultados = async (cookie: string, extra = '') =>
  (await chamar('get', cookie, `resultados${extra}`)).body as Resultado[]

describe('/v1/configuracoes/visitas', () => {
  it('a empresa nasce com o modelo de fábrica (7 campos válidos) e os seis resultados ligados a ele', async () => {
    const d = await novoDono(app)
    const [modelo, ...outros] = await modelos(d.cookie)
    expect(outros).toHaveLength(0)
    expect(modelo).toMatchObject({ nome: 'Relatório de visita', padrao: true, emUso: false })
    expect(modelo?.resultados).toBe(6)
    expect(modelo?.versaoAtual.numero).toBe(1)
    expect(camposDeVisitaSchema.safeParse(modelo?.versaoAtual.campos).success).toBe(true)
    expect(modelo?.versaoAtual.campos.map((c) => c.rotulo)).toEqual([
      'Contato',
      'Número de funcionários',
      'Interesse',
      'Demandas',
      'Ações feitas',
      'Próximo passo',
      'Resumo',
    ])
    const rs = await resultados(d.cookie)
    expect(rs.map((r) => r.chaveSistema)).toEqual([
      null,
      null,
      null,
      null,
      'nao_localizada',
      'encerrada',
    ])
    expect(rs.every((r) => r.modeloId === modelo?.id)).toBe(true)
    expect((await chamar('get', d.cookie, 'checkin')).body).toEqual({
      checkinModo: 'avisar',
      checkinLimiteM: 300,
      lembreteRelatoriosHora: '17:30',
    })
  })

  it('qualquer membro lê; gestor e vendedor não escrevem (403); sem sessão 401', async () => {
    const d = await novoDono(app)
    const [modelo] = await modelos(d.cookie)
    const [resultado] = await resultados(d.cookie)
    for (const papel of ['vendedor', 'gestor'] as const) {
      const u = await usuarioSimples(app)
      await vincular(d.tenantId, u.id, papel)
      await ativar(u.id, d.tenantId)
      expect(await modelos(u.cookie)).toHaveLength(1)
      expect(await resultados(u.cookie)).toHaveLength(6)
      expect((await chamar('get', u.cookie, 'checkin')).status).toBe(200)
      const tentativas = [
        chamar('post', u.cookie, 'modelos', { nome: 'X', campos: [] }),
        chamar('patch', u.cookie, `modelos/${modelo?.id}`, { nome: 'X' }),
        chamar('delete', u.cookie, `modelos/${modelo?.id}`),
        chamar('post', u.cookie, 'resultados', { nome: 'X', modeloId: modelo?.id }),
        chamar('patch', u.cookie, `resultados/${resultado?.id}`, { nome: 'X' }),
        chamar('put', u.cookie, 'checkin', {
          checkinModo: 'bloquear',
          checkinLimiteM: 100,
          lembreteRelatoriosHora: '18:00',
        }),
      ]
      for (const r of await Promise.all(tentativas)) {
        expect(r.status).toBe(403)
        expect(erroDe(r)).toBe('acesso_negado')
      }
    }
    expect((await chamar('get', undefined, 'modelos')).status).toBe(401)
  })

  it('resultados de sistema: renomeiam e trocam de modelo, mas não se inativam nem se excluem', async () => {
    const d = await novoDono(app)
    const rs = await resultados(d.cookie)
    const naoLocalizada = rs.find((r) => r.chaveSistema === 'nao_localizada')
    const outro = (
      await chamar('post', d.cookie, 'modelos', { nome: 'Rápido', campos: [texto(1)] })
    ).body as Modelo
    const alt = await chamar('patch', d.cookie, `resultados/${naoLocalizada?.id}`, {
      nome: 'Endereço não encontrado',
      modeloId: outro.id,
    })
    expect(alt.status).toBe(200)
    expect(alt.body).toMatchObject({ nome: 'Endereço não encontrado', modeloId: outro.id })
    const inativar = await chamar('patch', d.cookie, `resultados/${naoLocalizada?.id}`, {
      ativo: false,
    })
    expect(inativar.status).toBe(409)
    expect(erroDe(inativar)).toBe('resultado_de_sistema')
    const excluir = await chamar('delete', d.cookie, `resultados/${naoLocalizada?.id}`)
    expect(erroDe(excluir)).toBe('resultado_de_sistema')

    // os demais se excluem (sem relatório) e criar exige modelo ativo da empresa
    const livre = rs.find((r) => r.nome === 'Sem interesse')
    expect((await chamar('delete', d.cookie, `resultados/${livre?.id}`)).status).toBe(204)
    const semModelo = await chamar('post', d.cookie, 'resultados', {
      nome: 'Fechado',
      modeloId: uuid(999),
    })
    expect(semModelo.status).toBe(404)
    expect(erroDe(semModelo)).toBe('modelo_nao_encontrado')
  })

  it('modelo: cria a versão 1, edita no lugar enquanto não há relatório, valida os campos e a tag', async () => {
    const d = await novoDono(app)
    const r = await chamar('post', d.cookie, 'modelos', {
      nome: 'Visita técnica',
      campos: [texto(1), texto(2)],
    })
    expect(r.status).toBe(201)
    const m = r.body as Modelo
    expect(m).toMatchObject({ padrao: false, ativo: true, resultados: 0, emUso: false })
    expect(m.versaoAtual.numero).toBe(1)

    const alt = await chamar('patch', d.cookie, `modelos/${m.id}`, {
      campos: [texto(2, 'Renomeada'), texto(3)],
    })
    expect(alt.status).toBe(200)
    const depois = alt.body as Modelo
    expect(depois.versaoAtual).toMatchObject({ id: m.versaoAtual.id, numero: 1 })
    expect(depois.versaoAtual.campos.map((c) => c.rotulo)).toEqual(['Renomeada', 'Pergunta 3'])
    expect((await chamar('get', d.cookie, `modelos/${m.id}/versoes`)).body).toHaveLength(1)

    for (const campos of [
      [texto(1), texto(1)],
      [{ ...texto(1), tipo: 'dados_empresa', campoEmpresa: 'razao_social' }],
      [{ ...texto(1), tipo: 'escolha_unica', opcoes: [] }],
    ]) {
      expect((await chamar('patch', d.cookie, `modelos/${m.id}`, { campos })).status).toBe(400)
    }
    const tagDeOutra = await chamar('patch', d.cookie, `modelos/${m.id}`, {
      campos: [{ ...texto(1), tipo: 'tag', tagId: uuid(77) }],
    })
    expect(tagDeOutra.status).toBe(400)
    expect(erroDe(tagDeOutra)).toBe('tag_invalida')

    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'modelo_visita')
    expect(reg.map((x) => x.acao)).toEqual(['criar', 'alterar'])
  })

  it('padrão: troca para outro modelo; o padrão e o usado por resultado não se inativam nem se excluem', async () => {
    const d = await novoDono(app)
    const [fabrica] = await modelos(d.cookie)
    const novo = (await chamar('post', d.cookie, 'modelos', { nome: 'Novo', campos: [] }))
      .body as Modelo

    const inativarPadrao = await chamar('patch', d.cookie, `modelos/${fabrica?.id}`, {
      ativo: false,
    })
    expect(erroDe(inativarPadrao)).toBe('modelo_padrao')
    expect(erroDe(await chamar('delete', d.cookie, `modelos/${fabrica?.id}`))).toBe('modelo_padrao')

    expect(
      (await chamar('patch', d.cookie, `modelos/${novo.id}`, { padrao: true })).body,
    ).toMatchObject({ padrao: true })
    const lista = await modelos(d.cookie)
    expect(lista.filter((x) => x.padrao).map((x) => x.id)).toEqual([novo.id])

    // o de fábrica deixou de ser o padrão, mas os seis resultados ainda o usam
    const usado = await chamar('patch', d.cookie, `modelos/${fabrica?.id}`, { ativo: false })
    expect(usado.status).toBe(409)
    expect(erroDe(usado)).toBe('modelo_usado_por_resultado')
    expect(erroDe(await chamar('delete', d.cookie, `modelos/${fabrica?.id}`))).toBe(
      'modelo_usado_por_resultado',
    )

    // um modelo livre se inativa (some da lista padrão) e se exclui
    const livre = (await chamar('post', d.cookie, 'modelos', { nome: 'Livre', campos: [] }))
      .body as Modelo
    expect((await chamar('patch', d.cookie, `modelos/${livre.id}`, { ativo: false })).status).toBe(
      200,
    )
    expect((await modelos(d.cookie)).map((x) => x.id)).not.toContain(livre.id)
    expect((await modelos(d.cookie, '?incluirInativos=true')).map((x) => x.id)).toContain(livre.id)
    // resultado não aponta para modelo inativo
    const r = await chamar('post', d.cookie, 'resultados', { nome: 'X', modeloId: livre.id })
    expect(erroDe(r)).toBe('modelo_inativo')
    expect((await chamar('delete', d.cookie, `modelos/${livre.id}`)).status).toBe(204)
    expect((await chamar('get', d.cookie, `modelos/${livre.id}`)).status).toBe(404)
  })

  it('check-in: altera com o corpo completo, valida a faixa e registra na auditoria', async () => {
    const d = await novoDono(app)
    const nova = { checkinModo: 'bloquear', checkinLimiteM: 150, lembreteRelatoriosHora: '18:15' }
    const r = await chamar('put', d.cookie, 'checkin', nova)
    expect(r.status).toBe(200)
    expect((await chamar('get', d.cookie, 'checkin')).body).toEqual(nova)
    for (const ruim of [
      { ...nova, checkinLimiteM: 5 },
      { ...nova, lembreteRelatoriosHora: '7h' },
      { checkinModo: 'avisar' },
    ]) {
      expect((await chamar('put', d.cookie, 'checkin', ruim)).status).toBe(400)
    }
    const [reg] = (await auditoriaDe(d.tenantId)).filter(
      (x) => x.entidade === 'configuracao_de_visitas',
    )
    expect(reg?.alteracoes).toMatchObject({
      checkinModo: { de: 'avisar', para: 'bloquear' },
      checkinLimiteM: { de: 300, para: 150 },
    })
  })

  it('isolamento: o modelo de outra empresa é 404 e não serve para um resultado', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app)
    const [modeloDeB] = await modelos(b.cookie)
    expect((await chamar('get', a.cookie, `modelos/${modeloDeB?.id}`)).status).toBe(404)
    expect(
      (await chamar('patch', a.cookie, `modelos/${modeloDeB?.id}`, { nome: 'X' })).status,
    ).toBe(404)
    const r = await chamar('post', a.cookie, 'resultados', { nome: 'X', modeloId: modeloDeB?.id })
    expect(erroDe(r)).toBe('modelo_nao_encontrado')
  })
})
