import type { Server } from 'node:http'

import { completarCnpj, type ConsultaReceita } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { dono, novoDono } from '../testes/mundo.js'
import { respostaDaReceita, type ServidorFalso, subirServidorFalso } from './servidor-falso.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const usados: string[] = []
afterAll(async () => {
  if (usados.length > 0) await dono`DELETE FROM receita_consultas WHERE cnpj = ANY(${usados})`
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
let primaria: ServidorFalso
let alternativa: ServidorFalso
let ip = 0
async function subir(troca: Record<string, string> = {}) {
  primaria = await subirServidorFalso({ status: 200 })
  alternativa = await subirServidorFalso({ status: 200 })
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({
      TRUST_PROXY: '1',
      MINHA_RECEITA_URL: primaria.url,
      BRASILAPI_URL: alternativa.url,
      RECEITA_TIMEOUT_MS: '700',
      ...troca,
    }),
  )
}
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  await subir()
})
afterEach(async () => {
  await app.close()
  await primaria.fechar()
  await alternativa.fechar()
})

/** CNPJ novo a cada teste (o cache persiste no banco de teste). */
let seq = 0
function cnpjNovo(ordem = '0001'): string {
  seq += 1
  const base = `T${Date.now().toString(36).slice(-5).toUpperCase()}${String(seq).padStart(2, '0')}`
    .replace(/[^0-9A-Z]/g, '0')
    .padEnd(8, '0')
    .slice(0, 8)
  const cnpj = completarCnpj(`${base}${ordem}`)
  usados.push(cnpj)
  return cnpj
}

const consultar = (cookie: string | undefined, cnpj: string, consulta = '') => {
  ip += 1
  const r = request(app.getHttpServer())
    .get(`/v1/receita/cnpj/${cnpj}${consulta}`)
    .set('X-Forwarded-For', `10.9.${Math.floor(ip / 250)}.${ip % 250}`)
  return cookie ? r.set('Cookie', cookie) : r
}
const corpo = (r: request.Response) => r.body as ConsultaReceita
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

describe('GET /v1/receita/cnpj/:cnpj', () => {
  it('sem sessão 401; CNPJ inválido 400 sem chamar a Receita', async () => {
    const d = await novoDono(app)
    expect((await consultar(undefined, cnpjNovo())).status).toBe(401)
    for (const ruim of ['123', '11111111000100', '12345678000196']) {
      const r = await consultar(d.cookie, ruim)
      expect(r.status, ruim).toBe(400)
      expect(erroDe(r)).toBe('cnpj_invalido')
    }
    expect(primaria.chamadas).toHaveLength(0)
  })

  it('consulta a Minha Receita, devolve os dados normalizados e grava o cache', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
    const r = await consultar(d.cookie, cnpj)
    expect(r.status).toBe(200)
    expect(corpo(r)).toMatchObject({
      fonte: 'minhareceita',
      doCache: false,
      expirada: false,
      cadastroBloqueado: false,
      dados: {
        cnpj,
        razaoSocial: 'METALURGICA EXEMPLO LTDA',
        matrizFilial: 'matriz',
        situacao: { codigo: 2, ativa: true },
        cnaes: { principal: { codigo: 2539001 } },
      },
    })
    expect(primaria.chamadas).toEqual([`/${cnpj}`])
    const [c] =
      await dono`SELECT fonte, dados->>'razao_social' AS razao FROM receita_consultas WHERE cnpj = ${cnpj}`
    expect(c).toEqual({ fonte: 'minhareceita', razao: 'METALURGICA EXEMPLO LTDA' })
  })

  it('o CPF mascarado dos sócios não vai na resposta', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
    const r = await consultar(d.cookie, cnpj)
    expect(corpo(r).dados.socios).toEqual([
      { nome: 'FULANO DE TAL', qualificacaoCodigo: 49, qualificacaoTexto: 'Sócio-Administrador' },
    ])
    expect(JSON.stringify(r.body)).not.toContain('***123456**')
  })

  it('aceita máscara e letras minúsculas (CNPJ alfanumérico)', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
    const mascarado = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
    const r = await consultar(d.cookie, encodeURIComponent(mascarado.toLowerCase()))
    expect(r.status).toBe(200)
    expect(primaria.chamadas).toEqual([`/${cnpj}`])
  })

  it('a segunda consulta vem do cache; forcar=true consulta de novo e atualiza o cache', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
    await consultar(d.cookie, cnpj)
    const segunda = await consultar(d.cookie, cnpj)
    expect(corpo(segunda)).toMatchObject({ doCache: true, fonte: 'minhareceita' })
    expect(primaria.chamadas).toHaveLength(1)

    primaria.responder({
      status: 200,
      corpo: respostaDaReceita(cnpj, { razao_social: 'NOME NOVO LTDA' }),
    })
    const forcada = await consultar(d.cookie, cnpj, '?forcar=true')
    expect(corpo(forcada)).toMatchObject({
      doCache: false,
      dados: { razaoSocial: 'NOME NOVO LTDA' },
    })
    expect(primaria.chamadas).toHaveLength(2)
    expect(corpo(await consultar(d.cookie, cnpj)).dados.razaoSocial).toBe('NOME NOVO LTDA')
  })

  it('cache com mais de 30 dias é refeito', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
    await consultar(d.cookie, cnpj)
    await dono`UPDATE receita_consultas SET consultado_em = now() - interval '31 days' WHERE cnpj = ${cnpj}`
    const r = await consultar(d.cookie, cnpj)
    expect(corpo(r).doCache).toBe(false)
    expect(primaria.chamadas).toHaveLength(2)
  })

  it('consultas iguais ao mesmo tempo viram uma só chamada à Receita', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj), atrasoMs: 300 })
    const rs = await Promise.all([1, 2, 3].map(() => consultar(d.cookie, cnpj)))
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200])
    expect(primaria.chamadas).toHaveLength(1)
  })

  it('Minha Receita fora do ar (503, 429, tempo esgotado, sem JSON): usa a BrasilAPI e grava a fonte', async () => {
    const d = await novoDono(app)
    for (const falha of [
      { status: 503 },
      { status: 429 },
      { status: 200, corpo: {}, atrasoMs: 3000 },
      { status: 200, texto: '<html>' },
    ]) {
      const cnpj = cnpjNovo()
      primaria.responder(falha)
      alternativa.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
      const r = await consultar(d.cookie, cnpj)
      expect(r.status, JSON.stringify(falha)).toBe(200)
      expect(corpo(r)).toMatchObject({ fonte: 'brasilapi', doCache: false })
      const [c] = await dono`SELECT fonte FROM receita_consultas WHERE cnpj = ${cnpj}`
      expect(c?.['fonte']).toBe('brasilapi')
    }
  })

  it('resposta fora do formato da Minha Receita também cai para a BrasilAPI', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 200, corpo: { aviso: 'manutenção' } })
    alternativa.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
    expect(corpo(await consultar(d.cookie, cnpj)).fonte).toBe('brasilapi')
  })

  it('404 e 400 da Minha Receita são definitivos: a BrasilAPI nem é consultada', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 404, corpo: { message: 'não encontrado' } })
    const r404 = await consultar(d.cookie, cnpj)
    expect(r404.status).toBe(404)
    expect(erroDe(r404)).toBe('cnpj_nao_encontrado')
    primaria.responder({ status: 400, corpo: { message: 'inválido' } })
    const r400 = await consultar(d.cookie, cnpjNovo())
    expect(r400.status).toBe(400)
    expect(erroDe(r400)).toBe('cnpj_invalido')
    expect(alternativa.chamadas).toHaveLength(0)
  })

  it('as duas fontes fora do ar: 503 receita_indisponivel sem cache; com cache vencido, usa o cache e avisa', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 503 })
    alternativa.responder({ status: 500 })
    const r = await consultar(d.cookie, cnpj)
    expect(r.status).toBe(503)
    expect(erroDe(r)).toBe('receita_indisponivel')

    // com cache vencido
    primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
    await consultar(d.cookie, cnpj)
    await dono`UPDATE receita_consultas SET consultado_em = now() - interval '40 days' WHERE cnpj = ${cnpj}`
    primaria.responder({ status: 503 })
    const velho = await consultar(d.cookie, cnpj)
    expect(velho.status).toBe(200)
    expect(corpo(velho)).toMatchObject({ doCache: true, expirada: true })
  })

  it('cadastroBloqueado: empresa baixada com o bloqueio ligado; ativa ou bloqueio desligado, não', async () => {
    const d = await novoDono(app)
    const baixada = cnpjNovo()
    primaria.responder({
      status: 200,
      corpo: respostaDaReceita(baixada, {
        situacao_cadastral: 8,
        descricao_situacao_cadastral: 'BAIXADA',
        descricao_motivo_situacao_cadastral: 'EXTINCAO',
      }),
    })
    const bloqueada = await consultar(d.cookie, baixada)
    expect(corpo(bloqueada)).toMatchObject({
      cadastroBloqueado: true,
      dados: { situacao: { codigo: 8, descricao: 'BAIXADA', motivo: 'EXTINCAO', ativa: false } },
    })

    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`UPDATE tenant_configuracoes SET bloquear_empresa_nao_ativa = false WHERE tenant_id = ${d.tenantId}`
    })
    expect(corpo(await consultar(d.cookie, baixada)).cadastroBloqueado).toBe(false)
  })

  it('limite de 20 consultas por minuto por IP: a 21ª recebe 429', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj) })
    // IP novo a cada execução: o contador do limite fica no Valkey por 60 s
    const ipUnico = `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
    const mesmoIp = (n: number) =>
      request(app.getHttpServer())
        .get(`/v1/receita/cnpj/${cnpj}`)
        .set('X-Forwarded-For', ipUnico)
        .set('Cookie', d.cookie)
        .then((r) => ({ n, status: r.status }))
    const status: number[] = []
    for (let i = 0; i < 21; i++) status.push((await mesmoIp(i)).status)
    expect(status.slice(0, 20).every((s) => s === 200)).toBe(true)
    expect(status[20]).toBe(429)
  })
})
