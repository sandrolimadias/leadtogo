import type { Server } from 'node:http'

import type { MembroDaEquipe } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import {
  ativar,
  auditoriaDe,
  dono,
  ligar2fa,
  novaEmpresa,
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
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

const http = () => request(app.getHttpServer())
const alterar = (cookie: string | undefined, id: string, corpo: unknown) => {
  const r = http().patch(`/v1/membros/${id}`).set('Origin', ORIGEM_DO_FRONT)
  return (cookie ? r.set('Cookie', cookie) : r).send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

/** Empresa com o dono (admin da empresa e dono da conta), mais uma pessoa com o papel dado, já logada nela. */
async function equipe(papel: 'admin' | 'gestor' | 'vendedor' = 'vendedor') {
  const d = await novoDono(app)
  const u = await usuarioSimples(app)
  const membroId = await vincular(d.tenantId, u.id, papel, `Pessoa ${papel}`)
  await ativar(u.id, d.tenantId)
  if (papel === 'admin') await ligar2fa(u.id) // a política padrão exige 2FA dos administradores
  const donoMembroId = (
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    })
  )[0]?.id as string
  return { d, u, membroId, donoMembroId }
}

describe('PATCH /v1/membros/:id', () => {
  it('sem sessão 401; gestor e vendedor 403; corpo vazio ou inválido 400', async () => {
    const { d, u, membroId } = await equipe('vendedor')
    expect((await alterar(undefined, membroId, { papel: 'gestor' })).status).toBe(401)
    const gestor = await usuarioSimples(app)
    await vincular(d.tenantId, gestor.id, 'gestor')
    await ativar(gestor.id, d.tenantId)
    for (const cookie of [gestor.cookie, u.cookie]) {
      const r = await alterar(cookie, membroId, { papel: 'admin' })
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('acesso_negado')
    }
    expect((await alterar(d.cookie, membroId, {})).status).toBe(400)
    expect((await alterar(d.cookie, membroId, { papel: 'chefe' })).status).toBe(400)
    expect((await alterar(d.cookie, membroId, { papel: 'gestor', extra: 1 })).status).toBe(400)
    expect((await alterar(d.cookie, 'nao-e-uuid', { papel: 'gestor' })).status).toBe(400)
  })

  it('muda o papel, devolve o membro e registra na auditoria (de, para, quem)', async () => {
    const { d, membroId, donoMembroId } = await equipe('vendedor')
    const r = await alterar(d.cookie, membroId, { papel: 'gestor' })
    expect(r.status).toBe(200)
    expect(r.body as MembroDaEquipe).toMatchObject({ id: membroId, papel: 'gestor', ativo: true })
    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'membro')
    expect(reg).toHaveLength(1)
    expect(reg[0]).toMatchObject({
      acao: 'mudar_papel',
      entidade_id: membroId,
      alteracoes: { de: 'vendedor', para: 'gestor' },
      membro_id: donoMembroId,
    })
  })

  it('sem mudança nenhuma: 200 e nada na auditoria', async () => {
    const { d, membroId } = await equipe('vendedor')
    expect((await alterar(d.cookie, membroId, { papel: 'vendedor', ativo: true })).status).toBe(200)
    expect((await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'membro')).toEqual([])
  })

  it('desativar vale na próxima requisição da pessoa (403) e reativar a traz de volta; ambos auditados', async () => {
    const { d, u, membroId } = await equipe('vendedor')
    expect((await http().get('/v1/membros').set('Cookie', u.cookie)).status).toBe(200)

    const off = await alterar(d.cookie, membroId, { ativo: false })
    expect(off.status).toBe(200)
    expect((off.body as MembroDaEquipe).ativo).toBe(false)
    const bloqueada = await http().get('/v1/membros').set('Cookie', u.cookie)
    expect(bloqueada.status).toBe(403)
    expect(erroDe(bloqueada)).toBe('empresa_ativa_invalida')

    expect((await alterar(d.cookie, membroId, { ativo: true })).status).toBe(200)
    expect((await http().get('/v1/membros').set('Cookie', u.cookie)).status).toBe(200)
    const acoes = (await auditoriaDe(d.tenantId))
      .filter((x) => x.entidade === 'membro')
      .map((x) => x.acao)
    expect(acoes).toEqual(['desativar', 'reativar'])
  })

  it('o histórico fica: desativar não apaga o membro, que segue na lista com inativos', async () => {
    const { d, membroId } = await equipe('vendedor')
    await alterar(d.cookie, membroId, { ativo: false })
    const lista = (await http().get('/v1/membros?incluirInativos=true').set('Cookie', d.cookie))
      .body as MembroDaEquipe[]
    expect(lista.find((m) => m.id === membroId)).toMatchObject({ ativo: false })
  })

  it('a auditoria grava o IP do cliente: pelo proxy confiável vale o X-Forwarded-For; sem proxy, o forjado é ignorado', async () => {
    const { d, membroId } = await equipe('vendedor')
    await alterar(d.cookie, membroId, { papel: 'gestor' }).set('X-Forwarded-For', '198.51.100.7')
    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'membro')
    expect(reg[0]?.ip).toBe('198.51.100.7') // TRUST_PROXY=1: o cabeçalho do proxy é a origem real

    await app.close()
    app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '0' }))
    const sem = await equipe('vendedor')
    await alterar(sem.d.cookie, sem.membroId, { papel: 'gestor' }).set(
      'X-Forwarded-For',
      '203.0.113.99',
    )
    const regSem = (await auditoriaDe(sem.d.tenantId)).filter((x) => x.entidade === 'membro')
    expect(regSem[0]?.ip).toMatch(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/)
    expect(regSem[0]?.ip).not.toBe('203.0.113.99') // cabeçalho forjado sem proxy confiável não vale
  })

  it('ninguém altera a si mesmo', async () => {
    const { u, membroId } = await equipe('admin')
    const r = await alterar(u.cookie, membroId, { papel: 'vendedor' })
    expect(r.status).toBe(403)
    expect(erroDe(r)).toBe('alterar_a_si_mesmo')
    expect(erroDe(await alterar(u.cookie, membroId, { ativo: false }))).toBe('alterar_a_si_mesmo')
  })

  it('o dono da conta não é rebaixado nem desativado por outro administrador', async () => {
    const { u, donoMembroId, d } = await equipe('admin')
    for (const corpo of [{ papel: 'gestor' }, { ativo: false }]) {
      const r = await alterar(u.cookie, donoMembroId, corpo)
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('dono_da_conta')
    }
    // e o dono continua administrador ativo
    expect((await http().get('/v1/membros').set('Cookie', d.cookie)).status).toBe(200)
    expect((await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'membro')).toEqual([])
  })

  it('nunca fica sem administrador: dois admins tirando o acesso um do outro ao mesmo tempo, só um vale (o segundo já não é admin)', async () => {
    const d = await novoDono(app)
    const a = await usuarioSimples(app)
    const b = await usuarioSimples(app)
    const idA = await vincular(d.tenantId, a.id, 'admin', 'Admin A')
    const idB = await vincular(d.tenantId, b.id, 'admin', 'Admin B')
    await ativar(a.id, d.tenantId)
    await ativar(b.id, d.tenantId)
    await ligar2fa(a.id)
    await ligar2fa(b.id)
    // sem o dono na jogada: ele sai de admin (direto no banco) para só sobrarem A e B
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`UPDATE membros SET papel = 'vendedor' WHERE usuario_id = ${d.usuarioId}`
    })
    const [r1, r2] = await Promise.all([
      alterar(a.cookie, idB, { papel: 'vendedor' }),
      alterar(b.cookie, idA, { papel: 'vendedor' }),
    ])
    expect([r1.status, r2.status].sort()).toEqual([200, 403])
    expect(erroDe(r1.status === 403 ? r1 : r2)).toBe('acesso_negado')
    const admins = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx`SELECT id FROM membros WHERE papel = 'admin' AND ativo`
    })
    expect(admins).toHaveLength(1)
  })

  it('isolamento: o admin da empresa A não altera membro da B (404) nem a B mexe na A', async () => {
    const a = await equipe('vendedor')
    const b = await equipe('vendedor')
    const deA = await alterar(b.d.cookie, a.membroId, { papel: 'admin' })
    expect(deA.status).toBe(404)
    expect(erroDe(deA)).toBe('membro_nao_encontrado')
    expect((await alterar(a.d.cookie, b.membroId, { ativo: false })).status).toBe(404)
    // o mesmo admin, com as duas empresas, só age na ativa
    const outra = await novaEmpresa(a.d.contaId)
    const idNaOutra = await vincular(outra, a.u.id, 'vendedor', 'Na outra')
    expect((await alterar(a.d.cookie, idNaOutra, { papel: 'gestor' })).status).toBe(404)

    for (const { d, u, membroId } of [a, b]) {
      const linha = await dono.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
        return tx<
          { papel: string; ativo: boolean }[]
        >`SELECT papel, ativo FROM membros WHERE id = ${membroId}`
      })
      expect(linha[0]).toEqual({ papel: 'vendedor', ativo: true })
      expect(u.cookie).toBeTruthy()
    }
    expect((await auditoriaDe(a.d.tenantId)).filter((x) => x.entidade === 'membro')).toEqual([])
    expect((await auditoriaDe(b.d.tenantId)).filter((x) => x.entidade === 'membro')).toEqual([])
  })
})
