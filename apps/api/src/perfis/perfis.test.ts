import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import { type MeResposta, PERMISSOES_PADRAO, type PerfilDeAcesso } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import {
  ativar,
  auditoriaDe,
  dono,
  empresaDeOutraConta,
  ligar2fa,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'

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

const servidor = () => request(app.getHttpServer())
const get = (caminho: string, cookie: string) => servidor().get(caminho).set('Cookie', cookie)
const enviar = (
  metodo: 'post' | 'patch' | 'put' | 'delete',
  caminho: string,
  cookie: string,
  corpo?: object,
) => servidor()[metodo](caminho).set('Cookie', cookie).set('Origin', ORIGEM_DO_FRONT).send(corpo)
const erro = (r: request.Response) => (r.body as RespostaDeErro).erro

/** Empresa com o dono (Administrador), uma segunda administradora e uma vendedora, todos logados */
async function cenario() {
  const d = await novoDono(app)
  const adm = await usuarioSimples(app)
  const admId = await vincular(d.tenantId, adm.id, 'admin', 'Segunda admin')
  await ligar2fa(adm.id)
  await ativar(adm.id, d.tenantId)
  const vend = await usuarioSimples(app)
  const vendId = await vincular(d.tenantId, vend.id, 'vendedor', 'Vendedora')
  await ativar(vend.id, d.tenantId)
  const perfis = (await get('/v1/perfis', d.cookie)).body as PerfilDeAcesso[]
  const de = (chave: string) => perfis.find((p) => p.chaveSistema === chave) as PerfilDeAcesso
  return {
    d,
    adm,
    admId,
    vend,
    vendId,
    admin: de('admin'),
    gestor: de('gestor'),
    vendedor: de('vendedor'),
  }
}

/** Um perfil de OUTRA conta e empresa (criado como owner, sem login: os testes já fazem logins demais) */
async function perfilDeOutraEmpresa(): Promise<string> {
  const { tenantId } = await empresaDeOutraConta()
  const id = novoId()
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO perfis_acesso (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'De outra empresa')`
  })
  return id
}

const criar = (cookie: string, corpo: object) => enviar('post', '/v1/perfis', cookie, corpo)

describe('perfis de acesso: leitura', () => {
  it('só quem tem perfis.gerir: a vendedora leva 403; o admin vê os três de sistema primeiro', async () => {
    const { d, vend, admin, gestor, vendedor } = await cenario()
    const negado = await get('/v1/perfis', vend.cookie)
    expect(negado.status).toBe(403)
    expect(erro(negado)).toBe('acesso_negado')
    const perfis = (await get('/v1/perfis', d.cookie)).body as PerfilDeAcesso[]
    expect(perfis.slice(0, 3).map((p) => p.chaveSistema)).toEqual(['admin', 'gestor', 'vendedor'])
    expect(admin.membros).toBe(2) // o dono e a segunda admin (esta ainda pelo papel)
    expect(vendedor.membros).toBe(1)
    expect(gestor.permissoes).toEqual(PERMISSOES_PADRAO.gestor)
  })

  it('usuários do perfil e perfil de outra empresa (404)', async () => {
    const { d, vendedor } = await cenario()
    const membros = (await get(`/v1/perfis/${vendedor.id}/membros`, d.cookie)).body as {
      nome: string
    }[]
    expect(membros.map((m) => m.nome)).toEqual(['Vendedora'])
    const deOutra = await perfilDeOutraEmpresa()
    expect((await get(`/v1/perfis/${deOutra}`, d.cookie)).status).toBe(404)
    expect((await enviar('patch', `/v1/perfis/${deOutra}`, d.cookie, { nome: 'X' })).status).toBe(
      404,
    )
  })
})

describe('perfis de acesso: criar, duplicar, editar, excluir', () => {
  it('cria com a matriz validada e registra na auditoria; nome repetido 409', async () => {
    const { d } = await cenario()
    const r = await criar(d.cookie, {
      nome: 'Supervisor',
      permissoes: { 'empresas.ver': 'equipe', 'importacao.executar': true },
    })
    expect(r.status).toBe(201)
    const p = r.body as PerfilDeAcesso
    expect(p).toMatchObject({ nome: 'Supervisor', sistema: false, chaveSistema: null, membros: 0 })
    expect(p.permissoes).toEqual({ 'empresas.ver': 'equipe', 'importacao.executar': true })
    expect((await criar(d.cookie, { nome: 'supervisor' })).status).toBe(409)
    const log = await auditoriaDe(d.tenantId)
    expect(log.find((l) => l.acao === 'criar_perfil' && l.entidade_id === p.id)).toBeTruthy()
  })

  it('recusa chave fora do catálogo e alcance onde não se admite (ou faltando)', async () => {
    const { d } = await cenario()
    expect(
      (await criar(d.cookie, { nome: 'A', permissoes: { 'chamados.abrir': true } })).status,
    ).toBe(400)
    expect(
      (await criar(d.cookie, { nome: 'B', permissoes: { 'empresas.criar': 'todas' } })).status,
    ).toBe(400)
    expect(
      (await criar(d.cookie, { nome: 'C', permissoes: { 'empresas.ver': true } })).status,
    ).toBe(400)
  })

  it('duplica com as permissões e o 2FA da origem', async () => {
    const { d, gestor } = await cenario()
    const r = await enviar('post', `/v1/perfis/${gestor.id}/duplicar`, d.cookie, {
      nome: 'Gestor regional',
    })
    expect(r.status).toBe(201)
    const copia = r.body as PerfilDeAcesso
    expect(copia.sistema).toBe(false)
    expect(copia.permissoes).toEqual(gestor.permissoes)
    expect(copia.exige2fa).toBe(gestor.exige2fa)
  })

  it('edita e audita as permissões antes e depois', async () => {
    const { d, vendedor } = await cenario()
    const permissoes = { ...vendedor.permissoes, 'empresas.ver': 'todas' as const }
    const r = await enviar('patch', `/v1/perfis/${vendedor.id}`, d.cookie, {
      permissoes,
      exige2fa: true,
    })
    expect(r.status).toBe(200)
    expect((r.body as PerfilDeAcesso).permissoes['empresas.ver']).toBe('todas')
    const registro = (await auditoriaDe(d.tenantId)).find(
      (l) => l.acao === 'editar_perfil' && l.entidade_id === vendedor.id,
    )
    expect(registro?.alteracoes).toMatchObject({
      exige2fa: { de: false, para: true },
      permissoes: { de: { 'empresas.ver': 'propria' }, para: { 'empresas.ver': 'todas' } },
    })
  })

  it('o Administrador não perde perfis.gerir nem equipe.gerir', async () => {
    const { d, admin } = await cenario()
    for (const tirar of ['perfis.gerir', 'equipe.gerir']) {
      const permissoes = { ...admin.permissoes }
      delete permissoes[tirar]
      const r = await enviar('patch', `/v1/perfis/${admin.id}`, d.cookie, { permissoes })
      expect(r.status).toBe(409)
      expect(erro(r)).toBe('permissao_protegida')
    }
    // o resto do Administrador é editável
    const permissoes = { ...admin.permissoes }
    delete permissoes['importacao.executar']
    expect((await enviar('patch', `/v1/perfis/${admin.id}`, d.cookie, { permissoes })).status).toBe(
      200,
    )
  })

  it('ninguém tira perfis.gerir do perfil que usa', async () => {
    const { d, adm, admId } = await cenario()
    const p = (await criar(d.cookie, { nome: 'Gerente', permissoes: { 'perfis.gerir': true } }))
      .body as PerfilDeAcesso
    expect(
      (await enviar('put', `/v1/membros/${admId}/perfil`, d.cookie, { perfilId: p.id })).status,
    ).toBe(200)
    const r = await enviar('patch', `/v1/perfis/${p.id}`, adm.cookie, { permissoes: {} })
    expect(r.status).toBe(409)
    expect(erro(r)).toBe('propria_permissao')
  })

  it('perfil de sistema não se exclui nem se inativa; perfil com membros também não', async () => {
    const { d, vendedor, vendId } = await cenario()
    expect(erro(await enviar('delete', `/v1/perfis/${vendedor.id}`, d.cookie))).toBe(
      'perfil_de_sistema',
    )
    expect(
      erro(await enviar('patch', `/v1/perfis/${vendedor.id}`, d.cookie, { ativo: false })),
    ).toBe('perfil_de_sistema')
    const p = (await criar(d.cookie, { nome: 'Externo' })).body as PerfilDeAcesso
    await enviar('put', `/v1/membros/${vendId}/perfil`, d.cookie, { perfilId: p.id })
    expect(erro(await enviar('delete', `/v1/perfis/${p.id}`, d.cookie))).toBe('perfil_em_uso')
    expect(erro(await enviar('patch', `/v1/perfis/${p.id}`, d.cookie, { ativo: false }))).toBe(
      'perfil_em_uso',
    )
  })

  it('perfil da empresa sem membros se exclui (lógica) e sai da lista', async () => {
    const { d } = await cenario()
    const p = (await criar(d.cookie, { nome: 'Temporário' })).body as PerfilDeAcesso
    expect((await enviar('delete', `/v1/perfis/${p.id}`, d.cookie)).status).toBe(204)
    const lista = (await get('/v1/perfis', d.cookie)).body as PerfilDeAcesso[]
    expect(lista.some((x) => x.id === p.id)).toBe(false)
    expect((await criar(d.cookie, { nome: 'Temporário' })).status).toBe(201) // o nome volta a ficar livre
  })
})

describe('trocar o perfil de um membro', () => {
  it('troca, grava o papel legado, audita e vale na requisição seguinte (/v1/me)', async () => {
    const { d, vend, vendId, gestor } = await cenario()
    const r = await enviar('put', `/v1/membros/${vendId}/perfil`, d.cookie, { perfilId: gestor.id })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ membroId: vendId, perfil: { id: gestor.id, nome: 'Gestor' } })
    const me = (await get('/v1/me', vend.cookie)).body as MeResposta
    const empresa = me.empresas.find((e) => e.id === d.tenantId)
    expect(empresa?.perfil?.id).toBe(gestor.id)
    expect(empresa?.papel).toBe('gestor')
    const [papel] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<{ papel: string }[]>`SELECT papel FROM membros WHERE id = ${vendId}`
    })
    expect(papel?.papel).toBe('gestor')
    const registro = (await auditoriaDe(d.tenantId)).find((l) => l.acao === 'trocar_perfil')
    expect(registro?.alteracoes).toMatchObject({ para: { id: gestor.id, nome: 'Gestor' } })
  })

  it('perfil da empresa grava papel vendedor (compatibilidade)', async () => {
    const { d, admId } = await cenario()
    const p = (await criar(d.cookie, { nome: 'Gerente', permissoes: { 'perfis.gerir': true } }))
      .body as PerfilDeAcesso
    await enviar('put', `/v1/membros/${admId}/perfil`, d.cookie, { perfilId: p.id })
    const [linha] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<{ papel: string }[]>`SELECT papel FROM membros WHERE id = ${admId}`
    })
    expect(linha?.papel).toBe('vendedor')
  })

  it('ninguém troca o próprio perfil; o do dono da conta também não', async () => {
    const { d, adm, gestor } = await cenario()
    const [eu] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    })
    const proprio = await enviar('put', `/v1/membros/${eu?.id ?? ''}/perfil`, d.cookie, {
      perfilId: gestor.id,
    })
    expect(proprio.status).toBe(403)
    expect(erro(proprio)).toBe('alterar_a_si_mesmo')
    const doDono = await enviar('put', `/v1/membros/${eu?.id ?? ''}/perfil`, adm.cookie, {
      perfilId: gestor.id,
    })
    expect(doDono.status).toBe(403)
    expect(erro(doDono)).toBe('dono_da_conta')
  })

  it('perfil inativo (409), de outra empresa (404) e membro de outra empresa (404)', async () => {
    const { d, vendId } = await cenario()
    const p = (await criar(d.cookie, { nome: 'Parado' })).body as PerfilDeAcesso
    await enviar('patch', `/v1/perfis/${p.id}`, d.cookie, { ativo: false })
    expect(
      erro(await enviar('put', `/v1/membros/${vendId}/perfil`, d.cookie, { perfilId: p.id })),
    ).toBe('perfil_inativo')
    const deOutra = await perfilDeOutraEmpresa()
    expect(
      (await enviar('put', `/v1/membros/${vendId}/perfil`, d.cookie, { perfilId: deOutra })).status,
    ).toBe(404)
    expect(
      (await enviar('put', `/v1/membros/${novoId()}/perfil`, d.cookie, { perfilId: p.id })).status,
    ).toBe(404)
  })

  it('a vendedora não troca perfis (403)', async () => {
    const { vend, admId, gestor } = await cenario()
    const r = await enviar('put', `/v1/membros/${admId}/perfil`, vend.cookie, {
      perfilId: gestor.id,
    })
    expect(r.status).toBe(403)
  })
})
