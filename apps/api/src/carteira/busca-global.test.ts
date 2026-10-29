import type { Server } from 'node:http'

import type {
  BuscasRecentes,
  Contato,
  EmpresaCarteira,
  Oportunidade,
  ResultadoDaBuscaGlobal,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

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

type Metodo = 'get' | 'post' | 'patch' | 'delete'
let ip = 0
const chamar = (metodo: Metodo, cookie: string, url: string, corpo?: unknown) => {
  ip += 1
  const r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.7.${Math.floor(ip / 250)}.${ip % 250}`)
    .set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}

const buscar = async (cookie: string, q: string, extra = '') => {
  const r = await chamar('get', cookie, `/v1/busca?q=${encodeURIComponent(q)}${extra}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as ResultadoDaBuscaGlobal
}
const titulos = (itens: { titulo: string }[]) => itens.map((i) => i.titulo)

/** Empresa com o administrador e duas vendedoras (Ana e Bia), cada uma só com a própria carteira. */
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

const empresa = async (cookie: string, corpo: Record<string, unknown>) => {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    ...corpo,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as EmpresaCarteira
}
const contato = async (cookie: string, corpo: Record<string, unknown>) => {
  const r = await chamar('post', cookie, '/v1/carteira/contatos', corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as Contato
}
const oportunidade = async (cookie: string, corpo: Record<string, unknown>) => {
  const r = await chamar('post', cookie, '/v1/carteira/oportunidades', corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as Oportunidade
}

describe('GET /v1/busca', () => {
  it('acha empresas, contatos e oportunidades sem acento nem maiúsculas, com destino e subtítulo', async () => {
    const { d } = await cenario()
    const e = await empresa(d.cookie, {
      razaoSocial: 'Usinagem São João Ltda',
      nomeFantasia: 'Usidantec',
    })
    const c = await contato(d.cookie, {
      nome: 'Joana Conceição',
      vinculo: { empresaId: e.id, cargo: 'Diretora', principal: true },
      emails: [{ email: 'joana@usidantec.com.br' }],
      telefones: [{ numero: '(27) 99876-5432' }],
    })
    const o = await oportunidade(d.cookie, {
      titulo: 'Contrato de manutenção',
      empresaId: e.id,
      valorUnico: 1500,
    })

    const porNome = await buscar(d.cookie, 'SAO JOAO')
    expect(porNome.empresas).toEqual([
      expect.objectContaining({
        id: e.id,
        titulo: 'Usidantec',
        destino: `/empresas/${e.id}`,
        status: expect.objectContaining({ nome: 'Lead' }) as unknown,
      }),
    ])
    // a oportunidade também casa pelo nome da empresa
    expect(porNome.oportunidades.map((i) => i.id)).toEqual([o.id])

    const porContato = await buscar(d.cookie, 'conceicao')
    expect(porContato.contatos).toEqual([
      {
        id: c.id,
        titulo: 'Joana Conceição',
        subtitulo: 'Usidantec · Diretora',
        status: null,
        destino: `/contatos/${c.id}`,
      },
    ])
    expect(porContato.empresas).toEqual([])
    expect((await buscar(d.cookie, 'joana@usidantec')).contatos).toHaveLength(1)
    expect((await buscar(d.cookie, '99876-5432')).contatos).toHaveLength(1)

    const porTitulo = await buscar(d.cookie, 'manutencao')
    expect(porTitulo.oportunidades).toEqual([
      expect.objectContaining({
        id: o.id,
        titulo: 'Contrato de manutenção',
        destino: `/oportunidades/${o.id}`,
      }),
    ])
    expect(porTitulo.oportunidades[0]?.subtitulo).toMatch(/^Usidantec · .+ · R\$\s1\.500,00$/)
  })

  it('acha a empresa pelo CNPJ com ou sem máscara; % e _ valem como texto', async () => {
    const { d } = await cenario()
    // O documento entra direto no banco: o cadastro com CNPJ consultaria a Receita
    const alvo = await empresa(d.cookie, { razaoSocial: 'Cem Por Cento' })
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`UPDATE empresas SET tipo_documento = 'cnpj', documento = '11222333000181' WHERE id = ${alvo.id}`
    })
    expect((await buscar(d.cookie, '11.222.333/0001')).empresas.map((i) => i.id)).toEqual([alvo.id])
    expect((await buscar(d.cookie, '11222333')).empresas.map((i) => i.id)).toEqual([alvo.id])
    await empresa(d.cookie, { razaoSocial: 'Desconto de 50% à vista' })
    expect(titulos((await buscar(d.cookie, '%%')).empresas)).toEqual([])
    expect(titulos((await buscar(d.cookie, '0%')).empresas)).toEqual(['Desconto de 50% à vista'])
    expect(titulos((await buscar(d.cookie, 'r_')).empresas)).toEqual([])
  })

  it('quem começa com o termo vem antes de quem só o contém; respeita o limite e os tipos', async () => {
    const { d } = await cenario()
    await empresa(d.cookie, { razaoSocial: 'Grupo Acme' })
    await empresa(d.cookie, { razaoSocial: 'Acme Industrial' })
    await empresa(d.cookie, { razaoSocial: 'Super Acme' })
    expect(titulos((await buscar(d.cookie, 'acme')).empresas)[0]).toBe('Acme Industrial')
    expect((await buscar(d.cookie, 'acme', '&limite=2')).empresas).toHaveLength(2)
    const soContatos = await buscar(d.cookie, 'acme', '&tipos=contatos')
    expect(soContatos.empresas).toEqual([])
  })

  it('exige 2 letras e recusa tipo desconhecido', async () => {
    const { d } = await cenario()
    expect((await chamar('get', d.cookie, '/v1/busca?q=a')).status).toBe(400)
    expect((await chamar('get', d.cookie, '/v1/busca?q=acme&tipos=tarefas')).status).toBe(400)
  })

  it('regra de carteira: a vendedora não acha empresa, contato nem oportunidade da carteira da outra', async () => {
    const { d, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, { razaoSocial: 'Padaria Estrela' })
    await contato(ana.cookie, {
      nome: 'Pedro Estrela',
      vinculo: { empresaId: daAna.id, cargo: 'Dono' },
    })
    await oportunidade(ana.cookie, { titulo: 'Forno Estrela', empresaId: daAna.id })

    const ve = await buscar(ana.cookie, 'estrela')
    expect([ve.empresas.length, ve.contatos.length, ve.oportunidades.length]).toEqual([1, 1, 1])
    const naoVe = await buscar(bia.cookie, 'estrela')
    expect(naoVe).toEqual({ empresas: [], contatos: [], oportunidades: [] })
    // o administrador alcança todas
    const admin = await buscar(d.cookie, 'estrela')
    expect([admin.empresas.length, admin.contatos.length, admin.oportunidades.length]).toEqual([
      1, 1, 1,
    ])
  })

  it('isolamento: uma empresa (tenant) não acha nada da outra; excluídas não aparecem', async () => {
    const a = await cenario()
    const b = await cenario()
    const e = await empresa(a.d.cookie, { razaoSocial: 'Isolada Comércio' })
    expect((await buscar(b.d.cookie, 'isolada')).empresas).toEqual([])
    expect((await buscar(a.d.cookie, 'isolada')).empresas).toHaveLength(1)
    const r = await chamar('delete', a.d.cookie, `/v1/carteira/empresas/${e.id}`)
    expect(r.status, JSON.stringify(r.body)).toBe(204)
    expect((await buscar(a.d.cookie, 'isolada')).empresas).toEqual([])
  })
})

describe('buscas recentes', () => {
  const recentes = async (cookie: string) => {
    const r = await chamar('get', cookie, '/v1/busca/recentes')
    expect(r.status).toBe(200)
    return (r.body as BuscasRecentes).itens.map((i) => i.termo)
  }
  const registrar = async (cookie: string, termo: string) => {
    const r = await chamar('post', cookie, '/v1/busca/recentes', { termo })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return (r.body as BuscasRecentes).itens
  }

  it('o termo repetido (até com acento diferente) não duplica e volta ao topo; guarda só 10', async () => {
    const { d } = await cenario()
    expect(await recentes(d.cookie)).toEqual([])
    await registrar(d.cookie, 'São José')
    await registrar(d.cookie, 'acme')
    await registrar(d.cookie, '  sao   jose ')
    expect(await recentes(d.cookie)).toEqual(['sao   jose', 'acme'])

    for (let i = 1; i <= 10; i += 1) await registrar(d.cookie, `termo ${i}`)
    const lista = await recentes(d.cookie)
    expect(lista).toHaveLength(10)
    expect(lista[0]).toBe('termo 10')
    expect(lista).not.toContain('acme')
    expect((await chamar('post', d.cookie, '/v1/busca/recentes', { termo: 'x' })).status).toBe(400)
  })

  it('cada pessoa só vê e apaga o próprio histórico, nem o administrador lê o dos outros', async () => {
    const { d, ana } = await cenario()
    const [daAna] = await registrar(ana.cookie, 'cliente secreto')
    await registrar(d.cookie, 'do admin')
    expect(await recentes(d.cookie)).toEqual(['do admin'])
    expect(await recentes(ana.cookie)).toEqual(['cliente secreto'])
    expect((await chamar('delete', d.cookie, `/v1/busca/recentes/${daAna?.id}`)).status).toBe(404)
    await chamar('delete', d.cookie, '/v1/busca/recentes')
    expect(await recentes(ana.cookie)).toEqual(['cliente secreto'])
    expect(await recentes(d.cookie)).toEqual([])

    expect((await chamar('delete', ana.cookie, `/v1/busca/recentes/${daAna?.id}`)).status).toBe(204)
    expect(await recentes(ana.cookie)).toEqual([])
  })

  it('desativar o membro apaga o histórico dele', async () => {
    const { d, ana } = await cenario()
    await registrar(ana.cookie, 'padaria')
    const r = await chamar('patch', d.cookie, `/v1/membros/${ana.membroId}`, { ativo: false })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const sobra = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx`SELECT id FROM buscas_recentes WHERE membro_id = ${ana.membroId}`
    })
    expect(sobra).toHaveLength(0)
  })
})
