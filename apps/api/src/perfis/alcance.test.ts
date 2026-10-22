import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import {
  ativar,
  dono,
  membroSemLogin,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'

/**
 * Alcance própria / equipe / todas nas listas, fichas e no Dashboard da carteira (empresas, contatos,
 * oportunidades e atividades). A Gestora tem uma subordinada (Sara, sem login); a Olga é de fora da
 * equipe. Cada uma é responsável por uma empresa, com um contato, uma oportunidade e uma atividade.
 */
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([])
})
afterEach(() => app.close())

const chamar = (
  metodo: 'get' | 'post' | 'patch',
  caminho: string,
  cookie: string,
  corpo?: object,
) =>
  request(app.getHttpServer())
    [metodo](caminho)
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send(corpo)

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

const total = (corpo: unknown): number => {
  if (Array.isArray(corpo)) return corpo.length
  const c = corpo as { total?: number; itens?: unknown[] }
  return c.total ?? c.itens?.length ?? -1
}

async function cenario() {
  const d = await novoDono(app)
  const g = await usuarioSimples(app)
  const gestoraId = await vincular(d.tenantId, g.id, 'vendedor', 'Gestora')
  await ativar(g.id, d.tenantId)
  const saraId = await membroSemLogin(d.tenantId, 'Sara')
  const olgaId = await membroSemLogin(d.tenantId, 'Olga')
  await noTenant(
    d.tenantId,
    (tx) => tx`UPDATE membros SET gestor_id = ${gestoraId} WHERE id = ${saraId}`,
  )

  const [tipo] = (await chamar('get', '/v1/configuracoes/tipos-atividade', d.cookie)).body as {
    id: string
    nome: string
  }[]
  const empresas: Record<string, string> = {}
  for (const [nome, vendedorId] of [
    ['Da Gestora', gestoraId],
    ['Da Sara', saraId],
    ['Da Olga', olgaId],
  ] as const) {
    const e = await chamar('post', '/v1/carteira/empresas', d.cookie, {
      tipoDocumento: 'nenhum',
      razaoSocial: nome,
      vendedorId,
    })
    expect(e.status, JSON.stringify(e.body)).toBe(201)
    const empresaId = (e.body as { id: string }).id
    empresas[nome] = empresaId
    const c = await chamar('post', '/v1/carteira/contatos', d.cookie, {
      nome: `Contato ${nome}`,
      vinculo: { empresaId },
    })
    expect(c.status, JSON.stringify(c.body)).toBe(201)
    const o = await chamar('post', '/v1/carteira/oportunidades', d.cookie, {
      titulo: `Negócio ${nome}`,
      empresaId,
    })
    expect(o.status, JSON.stringify(o.body)).toBe(201)
    const a = await chamar('post', '/v1/carteira/atividades', d.cookie, {
      tipoAtividadeId: tipo?.id,
      titulo: `Ligar ${nome}`,
      empresaId,
      dataInicio: new Date(Date.now() + 86_400_000).toISOString(),
      situacao: 'pendente',
    })
    expect(a.status, JSON.stringify(a.body)).toBe(201)
  }

  /** Perfil da empresa para a Gestora, com o mesmo alcance em ver e editar de tudo */
  const alcance = async (valor: 'propria' | 'equipe' | 'todas') => {
    const id = novoId()
    await noTenant(d.tenantId, async (tx) => {
      await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${id}, ${d.tenantId}, ${`Alcance ${id.slice(-6)}`})`
      for (const m of ['empresas', 'contatos', 'oportunidades', 'atividades']) {
        for (const a of ['ver', 'editar']) {
          await tx`INSERT INTO perfil_permissoes (tenant_id, perfil_id, permissao, alcance)
            VALUES (${d.tenantId}, ${id}, ${`${m}.${a}`}, ${valor})`
        }
      }
      await tx`UPDATE membros SET perfil_id = ${id} WHERE id = ${gestoraId}`
    })
  }
  return { d, g, empresas, alcance }
}

describe('alcance da carteira por perfil', () => {
  it('própria, equipe e todas nas listas de empresas, contatos, oportunidades e atividades', async () => {
    const c = await cenario()
    const contagens = async () => ({
      empresas: total((await chamar('get', '/v1/carteira/empresas', c.g.cookie)).body),
      contatos: total((await chamar('get', '/v1/carteira/contatos', c.g.cookie)).body),
      oportunidades: total((await chamar('get', '/v1/carteira/oportunidades', c.g.cookie)).body),
      atividades: total((await chamar('get', '/v1/carteira/atividades', c.g.cookie)).body),
    })
    await c.alcance('propria')
    expect(await contagens()).toEqual({ empresas: 1, contatos: 1, oportunidades: 1, atividades: 1 })
    await c.alcance('equipe')
    expect(await contagens()).toEqual({ empresas: 2, contatos: 2, oportunidades: 2, atividades: 2 })
    await c.alcance('todas')
    expect(await contagens()).toEqual({ empresas: 3, contatos: 3, oportunidades: 3, atividades: 3 })
  })

  it('ficha e edição: a empresa da subordinada entra com equipe; a de fora, não', async () => {
    const c = await cenario()
    await c.alcance('equipe')
    const daSara = c.empresas['Da Sara'] ?? ''
    const daOlga = c.empresas['Da Olga'] ?? ''
    expect((await chamar('get', `/v1/carteira/empresas/${daSara}`, c.g.cookie)).status).toBe(200)
    expect((await chamar('get', `/v1/carteira/empresas/${daOlga}`, c.g.cookie)).status).toBe(404)
    const editar = await chamar('patch', `/v1/carteira/empresas/${daSara}`, c.g.cookie, {
      nomeFantasia: 'Sara & Cia',
    })
    expect(editar.status, JSON.stringify(editar.body)).toBe(200)
    await c.alcance('propria')
    expect((await chamar('get', `/v1/carteira/empresas/${daSara}`, c.g.cookie)).status).toBe(404)
  })

  it('Dashboard é de todo membro e mostra o que é da pessoa, dentro do alcance', async () => {
    const c = await cenario()
    await c.alcance('propria')
    expect((await chamar('get', '/v1/carteira/dashboard', c.g.cookie)).status).toBe(200)
    // sem nenhuma permissão da carteira, o Dashboard ainda abre (vazio)
    await noTenant(
      c.d.tenantId,
      (tx) => tx`DELETE FROM perfil_permissoes
        WHERE perfil_id = (SELECT perfil_id FROM membros WHERE nome = 'Gestora')`,
    )
    expect((await chamar('get', '/v1/carteira/dashboard', c.g.cookie)).status).toBe(200)
  })

  it('sem ver empresas: 403 na lista (a rota exige a permissão)', async () => {
    const c = await cenario()
    await c.alcance('todas')
    await noTenant(
      c.d.tenantId,
      (tx) => tx`DELETE FROM perfil_permissoes WHERE permissao = 'empresas.ver'
        AND perfil_id = (SELECT perfil_id FROM membros WHERE nome = 'Gestora')`,
    )
    expect((await chamar('get', '/v1/carteira/empresas', c.g.cookie)).status).toBe(403)
  })
})

describe('"Vendedores podem ver todas" virou o alcance de ver no perfil Vendedor', () => {
  it('ver = todas no perfil Vendedor muda a lista do vendedor; editar continua só a própria', async () => {
    const d = await novoDono(app)
    const v = await usuarioSimples(app)
    await vincular(d.tenantId, v.id, 'vendedor', 'Vendedora')
    await ativar(v.id, d.tenantId)
    const doAdmin = await chamar('post', '/v1/carteira/empresas', d.cookie, {
      tipoDocumento: 'nenhum',
      razaoSocial: 'Do admin',
    })
    const lista = async () => total((await chamar('get', '/v1/carteira/empresas', v.cookie)).body)
    expect(await lista()).toBe(0)
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE perfil_permissoes SET alcance = 'todas'
        WHERE permissao LIKE '%.ver'
          AND perfil_id = (SELECT id FROM perfis_acesso WHERE chave_sistema = 'vendedor')`,
    )
    expect(await lista()).toBe(1)
    const editar = await chamar(
      'patch',
      `/v1/carteira/empresas/${(doAdmin.body as { id: string }).id}`,
      v.cookie,
      { nomeFantasia: 'Mexi' },
    )
    expect(editar.status).toBe(403)
  })
})
