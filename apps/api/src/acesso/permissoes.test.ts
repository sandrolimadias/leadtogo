import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { MeResposta } from '@leadtogo/shared'
import { Controller, Get, type INestApplication, Param } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { ativar, dono, novaEmpresa, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'
import { Permissao, SemEmpresa } from './acesso.decorators.js'
import { ContextoTenantService } from './contexto-tenant.service.js'
import { PermissaoService } from './permissao.service.js'

@Controller('teste-permissao')
class RotasDePermissao {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly permissao: PermissaoService,
  ) {}

  @Get('excluir')
  @Permissao('empresas.excluir')
  excluir() {
    return { ok: true }
  }

  @Get('alguma')
  @Permissao('empresas.excluir', 'empresas.criar')
  alguma() {
    return { ok: true }
  }

  @Get('sem-empresa')
  @SemEmpresa()
  @Permissao('empresas.criar')
  semEmpresa() {
    return { ok: true }
  }

  @Get('eu')
  async eu() {
    return {
      membro: this.ctx.membro,
      equipe: (await this.permissao.equipe()).sort(),
      // a segunda chamada usa a memória da requisição (a mesma lista)
      equipeDeNovo: (await this.permissao.equipe()).sort(),
    }
  }

  @Get('alcanca/:chave/:responsavel')
  async alcanca(@Param('chave') chave: string, @Param('responsavel') responsavel: string) {
    return { alcanca: await this.permissao.alcanca(chave, responsavel) }
  }
}

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([RotasDePermissao])
})
afterEach(() => app.close())

const get = (caminho: string, cookie: string) =>
  request(app.getHttpServer()).get(caminho).set('Cookie', cookie)

type Eu = {
  membro: {
    id: string
    perfil: { id: string; nome: string } | null
    permissoes: Record<string, unknown>
  }
  equipe: string[]
  equipeDeNovo: string[]
}

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

const perfilDeSistema = (tenantId: string, chave: string) =>
  noTenant(tenantId, async (tx) => {
    const [p] = await tx<{ id: string }[]>`
      SELECT id FROM perfis_acesso WHERE chave_sistema = ${chave}::chave_perfil_sistema`
    return p?.id ?? ''
  })

async function perfilDaEmpresa(tenantId: string, permissoes: Record<string, string | null>) {
  const id = novoId()
  await noTenant(tenantId, async (tx) => {
    await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${id}, ${tenantId}, ${`Perfil ${id.slice(-6)}`})`
    for (const [permissao, alcance] of Object.entries(permissoes)) {
      await tx`INSERT INTO perfil_permissoes (tenant_id, perfil_id, permissao, alcance)
        VALUES (${tenantId}, ${id}, ${permissao}, ${alcance}::alcance_permissao)`
    }
  })
  return id
}

const usarPerfil = (tenantId: string, membroId: string, perfilId: string | null) =>
  noTenant(tenantId, (tx) => tx`UPDATE membros SET perfil_id = ${perfilId} WHERE id = ${membroId}`)

/** Dono (Administrador) e um vendedor logado na mesma empresa */
async function cenario() {
  const d = await novoDono(app)
  const u = await usuarioSimples(app)
  const vendedorId = await vincular(d.tenantId, u.id, 'vendedor', 'Vendedora')
  await ativar(u.id, d.tenantId)
  return { d, u, vendedorId }
}

describe('@Permissao no interceptor', () => {
  it('sem a permissão, 403 acesso_negado; com ela, 200', async () => {
    const { d, u } = await cenario()
    const negado = await get('/v1/teste-permissao/excluir', u.cookie)
    expect(negado.status).toBe(403)
    expect((negado.body as RespostaDeErro).erro).toBe('acesso_negado')
    expect((await get('/v1/teste-permissao/excluir', d.cookie)).status).toBe(200)
  })

  it('com várias chaves, basta ter uma', async () => {
    const { u } = await cenario()
    expect((await get('/v1/teste-permissao/alguma', u.cookie)).status).toBe(200)
  })

  it('rota com @Permissao fora da empresa ativa é negada (não há perfil para conferir)', async () => {
    const { d } = await cenario()
    expect((await get('/v1/teste-permissao/sem-empresa', d.cookie)).status).toBe(403)
  })

  it('vale a mudança do perfil na requisição seguinte (sem cache)', async () => {
    const { d, u, vendedorId } = await cenario()
    const perfil = await perfilDaEmpresa(d.tenantId, { 'empresas.excluir': 'propria' })
    await usarPerfil(d.tenantId, vendedorId, perfil)
    expect((await get('/v1/teste-permissao/excluir', u.cookie)).status).toBe(200)
    await noTenant(
      d.tenantId,
      (tx) => tx`DELETE FROM perfil_permissoes WHERE perfil_id = ${perfil}`,
    )
    expect((await get('/v1/teste-permissao/excluir', u.cookie)).status).toBe(403)
  })
})

describe('perfil efetivo do membro', () => {
  it('o membro sem perfil usa o de sistema do papel (transição até a contração)', async () => {
    const { d, u } = await cenario()
    const r = await get('/v1/teste-permissao/eu', u.cookie)
    const eu = r.body as Eu
    expect(eu.membro.perfil?.id).toBe(await perfilDeSistema(d.tenantId, 'vendedor'))
    expect(eu.membro.permissoes['empresas.ver']).toBe('propria')
    expect(eu.membro.permissoes['empresas.excluir']).toBeUndefined()
  })

  it('o perfil do membro vale no lugar do papel', async () => {
    const { d, u, vendedorId } = await cenario()
    const perfil = await perfilDaEmpresa(d.tenantId, {
      'empresas.ver': 'equipe',
      'importacao.executar': null,
    })
    await usarPerfil(d.tenantId, vendedorId, perfil)
    const eu = (await get('/v1/teste-permissao/eu', u.cookie)).body as Eu
    expect(eu.membro.perfil?.id).toBe(perfil)
    expect(eu.membro.permissoes).toEqual({ 'empresas.ver': 'equipe', 'importacao.executar': true })
  })

  it('perfil excluído ou inativo: nenhuma permissão (não volta para o do papel)', async () => {
    const { d, u, vendedorId } = await cenario()
    const perfil = await perfilDaEmpresa(d.tenantId, { 'empresas.criar': null })
    await usarPerfil(d.tenantId, vendedorId, perfil)
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE perfis_acesso SET ativo = false WHERE id = ${perfil}`,
    )
    let eu = (await get('/v1/teste-permissao/eu', u.cookie)).body as Eu
    expect(eu.membro.perfil).toBeNull()
    expect(eu.membro.permissoes).toEqual({})
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE perfis_acesso SET ativo = true, excluido_em = now() WHERE id = ${perfil}`,
    )
    eu = (await get('/v1/teste-permissao/eu', u.cookie)).body as Eu
    expect(eu.membro.permissoes).toEqual({})
    expect((await get('/v1/teste-permissao/alguma', u.cookie)).status).toBe(403)
  })

  it('empresa sem perfil de sistema e membro sem perfil: nenhuma permissão', async () => {
    const d = await novoDono(app)
    const outra = await novaEmpresa(d.contaId) // sem os padrões: sem perfis
    const u = await usuarioSimples(app)
    await vincular(outra, u.id, 'gestor') // admin pediria 2FA (política padrão)
    await ativar(u.id, outra)
    const eu = (await get('/v1/teste-permissao/eu', u.cookie)).body as Eu
    expect(eu.membro.perfil).toBeNull()
    expect(eu.membro.permissoes).toEqual({})
  })

  it('chave fora do catálogo é ignorada', async () => {
    const { d, u, vendedorId } = await cenario()
    const perfil = await perfilDaEmpresa(d.tenantId, {
      'chamados.abrir': null,
      'empresas.criar': null,
    })
    await usarPerfil(d.tenantId, vendedorId, perfil)
    const eu = (await get('/v1/teste-permissao/eu', u.cookie)).body as Eu
    expect(eu.membro.permissoes).toEqual({ 'empresas.criar': true })
  })
})

describe('alcance e equipe', () => {
  async function hierarquia() {
    const { d, u, vendedorId } = await cenario()
    // Vendedora (logada) gere B, B gere C; D é de fora da equipe
    const [b, c, fora] = [novoId(), novoId(), novoId()]
    await noTenant(d.tenantId, async (tx) => {
      await tx`INSERT INTO membros (id, tenant_id, nome, gestor_id) VALUES (${b}, ${d.tenantId}, 'B', ${vendedorId})`
      await tx`INSERT INTO membros (id, tenant_id, nome, gestor_id) VALUES (${c}, ${d.tenantId}, 'C', ${b})`
      await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${fora}, ${d.tenantId}, 'Fora')`
    })
    return { d, u, vendedorId, b, c, fora }
  }

  it('equipe = o próprio + subordinados diretos e indiretos, calculada uma vez por requisição', async () => {
    const { u, vendedorId, b, c } = await hierarquia()
    const eu = (await get('/v1/teste-permissao/eu', u.cookie)).body as Eu
    expect(eu.equipe).toEqual([vendedorId, b, c].sort())
    expect(eu.equipeDeNovo).toEqual(eu.equipe)
  })

  it('ciclo no gestor_id não trava', async () => {
    const { d, u, vendedorId, b, c } = await hierarquia()
    // C passa a gerir a Vendedora: Vendedora → B → C → Vendedora
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE membros SET gestor_id = ${c} WHERE id = ${vendedorId}`,
    )
    const eu = (await get('/v1/teste-permissao/eu', u.cookie)).body as Eu
    expect(eu.equipe).toEqual([vendedorId, b, c].sort())
  })

  it('própria, equipe e todas decidem quem está no alcance; sem a permissão, ninguém', async () => {
    const { d, u, vendedorId, c, fora } = await hierarquia()
    const alcanca = async (chave: string, responsavel: string) =>
      (
        (await get(`/v1/teste-permissao/alcanca/${chave}/${responsavel}`, u.cookie)).body as {
          alcanca: boolean
        }
      ).alcanca
    const perfil = await perfilDaEmpresa(d.tenantId, {
      'empresas.ver': 'todas',
      'empresas.editar': 'equipe',
      'empresas.excluir': 'propria',
    })
    await usarPerfil(d.tenantId, vendedorId, perfil)
    expect(await alcanca('empresas.ver', fora)).toBe(true)
    expect(await alcanca('empresas.editar', c)).toBe(true)
    expect(await alcanca('empresas.editar', fora)).toBe(false)
    expect(await alcanca('empresas.excluir', vendedorId)).toBe(true)
    expect(await alcanca('empresas.excluir', c)).toBe(false)
    expect(await alcanca('contatos.ver', vendedorId)).toBe(false)
  })
})

describe('GET /v1/me', () => {
  it('traz o perfil e as permissões de cada empresa do usuário', async () => {
    const { d, u, vendedorId } = await cenario()
    // A mesma pessoa é Administradora numa segunda empresa (com perfis)
    const outro = await novoDono(app)
    await vincular(outro.tenantId, u.id, 'admin')
    const perfil = await perfilDaEmpresa(d.tenantId, { 'empresas.ver': 'equipe' })
    await usarPerfil(d.tenantId, vendedorId, perfil)

    const me = (await get('/v1/me', u.cookie)).body as MeResposta
    const naPrimeira = me.empresas.find((e) => e.id === d.tenantId)
    const naSegunda = me.empresas.find((e) => e.id === outro.tenantId)
    expect(naPrimeira?.perfil?.id).toBe(perfil)
    expect(naPrimeira?.permissoes).toEqual({ 'empresas.ver': 'equipe' })
    expect(naPrimeira?.papel).toBe('vendedor') // legado, até a contração
    expect(naSegunda?.perfil?.nome).toBe('Administrador')
    expect(naSegunda?.permissoes['perfis.gerir']).toBe(true)
    expect(naSegunda?.permissoes['empresas.ver']).toBe('todas')
  })
})
