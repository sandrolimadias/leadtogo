import type { Server } from 'node:http'

import type { EmpresaAtivaResposta, MeResposta } from '@leadtogo/shared'
import { sql } from '@leadtogo/db'
import { Controller, Get, type INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { entrar, limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import {
  ativar,
  dono,
  ligar2fa,
  empresaDeOutraConta,
  membroSemLogin,
  mudarMembro,
  mudarSituacao,
  novaEmpresa,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'

// Rota de teste que usa o contexto de tenant: prova que a troca de empresa vale nas próximas requisições
@Controller('teste-me')
class RotaDeTenant {
  constructor(private readonly ctx: ContextoTenantService) {}

  @Get('dados')
  async dados() {
    const membros = await this.ctx
      .db()
      .execute<{ nome: string }>(sql`SELECT nome FROM membros ORDER BY nome`)
    return { tenantId: this.ctx.tenantId, nomes: [...membros].map((m) => m.nome) }
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
  app = await criarAppComRotas([RotaDeTenant], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

const get = (caminho: string, cookie?: string) => {
  const r = request(app.getHttpServer()).get(caminho)
  return cookie ? r.set('Cookie', cookie) : r
}
const trocar = (cookie: string, corpo: object) =>
  request(app.getHttpServer())
    .post('/v1/sessao/empresa-ativa')
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send(corpo)
const meDe = async (cookie: string) => (await get('/v1/me', cookie).expect(200)).body as MeResposta
const erroDe = (r: request.Response) => r.body as RespostaDeErro
const empresaAtivaNoBanco = async (usuarioId: string) =>
  (
    await dono<
      { empresa_ativa_id: string | null }[]
    >`SELECT empresa_ativa_id FROM auth.session WHERE user_id = ${usuarioId}`
  ).map((s) => s.empresa_ativa_id)

describe('GET /v1/me', () => {
  it('sem sessão: 401', async () => {
    expect((await get('/v1/me')).status).toBe(401)
  })

  it('devolve o usuário e as empresas dele com o papel em cada uma (admin na A, vendedor na B)', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'vendedor')
    await ativar(d.usuarioId, d.tenantId)
    const me = await meDe(d.cookie)
    expect(me.usuario).toMatchObject({
      id: d.usuarioId,
      email: d.email,
      nome: 'Dono de Teste',
      emailVerificado: true,
      twoFactorEnabled: true,
    })
    expect(me.empresas).toHaveLength(2)
    const naA = me.empresas.find((e) => e.id === d.tenantId)
    const naB = me.empresas.find((e) => e.id === b)
    expect(naA).toMatchObject({ papel: 'admin', situacao: 'teste', ativa: true })
    expect(naB).toMatchObject({ papel: 'vendedor', situacao: 'ativo', ativa: false })
    expect(typeof naA?.razaoSocial).toBe('string')
    expect(me.empresaAtivaId).toBe(d.tenantId)
    expect(me.administradorDeConta).toBe(true)
    expect(me.doisFatoresPendente).toBe(false)
  })

  it('não lista empresa de que o usuário não é membro, nem de outra conta', async () => {
    const d = await novoDono(app)
    const semVinculo = await novaEmpresa(d.contaId) // mesma conta, mas ele não é membro
    const fora = await empresaDeOutraConta()
    const me = await meDe(d.cookie)
    expect(me.empresas.map((e) => e.id)).toEqual([d.tenantId])
    expect(JSON.stringify(me)).not.toContain(semVinculo)
    expect(JSON.stringify(me)).not.toContain(fora.tenantId)
  })

  it('usuário sem nenhuma empresa: lista vazia, sem empresa ativa e sem consolidado', async () => {
    const u = await usuarioSimples(app)
    const me = await meDe(u.cookie)
    expect(me.empresas).toEqual([])
    expect(me.empresaAtivaId).toBeNull()
    expect(me.administradorDeConta).toBe(false)
    expect(me.doisFatoresPendente).toBe(false)
  })

  it('mostra a empresa suspensa com a situação (o front a exibe desabilitada)', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'gestor')
    await mudarSituacao(b, 'suspenso')
    const naB = (await meDe(d.cookie)).empresas.find((e) => e.id === b)
    expect(naB).toMatchObject({ situacao: 'suspenso', papel: 'gestor' })
  })

  it('o administrador sem 2FA acessa o /me e vê doisFatoresPendente', async () => {
    const d = await novoDono(app, { com2fa: false })
    const me = await meDe(d.cookie)
    expect(me.doisFatoresPendente).toBe(true)
    expect(me.usuario.twoFactorEnabled).toBe(false)
  })

  it('não vaza hash de senha, token nem segredo', async () => {
    const d = await novoDono(app)
    const texto = JSON.stringify((await get('/v1/me', d.cookie)).body)
    for (const proibido of ['password', 'token', 'secret', 'scrypt', 'backupCodes']) {
      expect(texto.toLowerCase()).not.toContain(proibido.toLowerCase())
    }
  })
})

describe('POST /v1/sessao/empresa-ativa', () => {
  it('sem sessão: 401', async () => {
    const r = await request(app.getHttpServer())
      .post('/v1/sessao/empresa-ativa')
      .send({ empresaId: '01a111e8-f08a-70b7-b5f3-52998ced0a3d' })
    expect(r.status).toBe(401)
  })

  it('troca a empresa ativa: grava na sessão e as rotas seguintes passam a ver a nova empresa', async () => {
    const d = await novoDono(app, { semEmpresaAtiva: true })
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'vendedor')
    await membroSemLogin(d.tenantId, 'Só da A')
    await membroSemLogin(b, 'Só da B')
    expect(await empresaAtivaNoBanco(d.usuarioId)).toEqual([null])
    expect(erroDe(await get('/v1/teste-me/dados', d.cookie)).erro).toBe('sem_empresa_ativa')

    const r = await trocar(d.cookie, { empresaId: d.tenantId })
    expect(r.status).toBe(200)
    const corpo = r.body as EmpresaAtivaResposta
    expect(corpo.empresaAtivaId).toBe(d.tenantId)
    expect(corpo.empresa).toMatchObject({ id: d.tenantId, papel: 'admin', ativa: true })
    expect(await empresaAtivaNoBanco(d.usuarioId)).toEqual([d.tenantId])
    const naA = (await get('/v1/teste-me/dados', d.cookie)).body as {
      tenantId: string
      nomes: string[]
    }
    expect(naA.tenantId).toBe(d.tenantId)
    expect(naA.nomes).toContain('Só da A')
    expect(naA.nomes).not.toContain('Só da B')

    // para a B (onde é só vendedor) e de volta para a A
    await trocar(d.cookie, { empresaId: b }).expect(200)
    const naB = (await get('/v1/teste-me/dados', d.cookie)).body as {
      tenantId: string
      nomes: string[]
    }
    expect(naB.tenantId).toBe(b)
    expect(naB.nomes).toContain('Só da B')
    expect(naB.nomes).not.toContain('Só da A')
    expect((await meDe(d.cookie)).empresas.find((e) => e.ativa)?.id).toBe(b)
    await trocar(d.cookie, { empresaId: d.tenantId }).expect(200)
    expect(
      ((await get('/v1/teste-me/dados', d.cookie)).body as { tenantId: string }).tenantId,
    ).toBe(d.tenantId)
  })

  it('muda só esta sessão: outro login do mesmo usuário continua na empresa dele', async () => {
    const d = await novoDono(app, { com2fa: false }) // sem o flag, o segundo login não pede código
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'vendedor')
    const outroLogin = await entrar(app, d.email)
    expect(outroLogin.status).toBe(200)
    await ligar2fa(d.usuarioId)
    await trocar(d.cookie, { empresaId: d.tenantId }).expect(200)
    await trocar(outroLogin.cookie, { empresaId: b }).expect(200)
    expect(
      ((await get('/v1/teste-me/dados', d.cookie)).body as { tenantId: string }).tenantId,
    ).toBe(d.tenantId)
    expect(
      ((await get('/v1/teste-me/dados', outroLogin.cookie)).body as { tenantId: string }).tenantId,
    ).toBe(b)
  })

  it('empresa de que não é membro ou que não existe: 403 idêntico (não revela cadastro) e a sessão não muda', async () => {
    const d = await novoDono(app)
    const alheia = await empresaDeOutraConta()
    const dela = await novaEmpresa(d.contaId) // mesma conta, sem vínculo
    await trocar(d.cookie, { empresaId: d.tenantId }).expect(200)
    const respostas = [
      await trocar(d.cookie, { empresaId: alheia.tenantId }),
      await trocar(d.cookie, { empresaId: dela }),
      await trocar(d.cookie, { empresaId: '01a111e8-0000-7000-8000-000000000000' }),
    ]
    for (const r of respostas) {
      expect(r.status).toBe(403)
      expect(erroDe(r).erro).toBe('empresa_nao_permitida')
    }
    expect(new Set(respostas.map((r) => erroDe(r).mensagem)).size).toBe(1)
    expect(await empresaAtivaNoBanco(d.usuarioId)).toEqual([d.tenantId]) // continua na A
  })

  it('suspensa ou cancelada: 403 empresa_indisponivel; membro inativo: 403 empresa_nao_permitida', async () => {
    const d = await novoDono(app)
    for (const situacao of ['suspenso', 'cancelado'] as const) {
      const e = await novaEmpresa(d.contaId)
      await vincular(e, d.usuarioId, 'vendedor')
      await mudarSituacao(e, situacao)
      const r = await trocar(d.cookie, { empresaId: e })
      expect(r.status).toBe(403)
      expect(erroDe(r).erro).toBe('empresa_indisponivel')
    }
    const inativa = await novaEmpresa(d.contaId)
    await vincular(inativa, d.usuarioId, 'vendedor')
    await mudarMembro(inativa, d.usuarioId, 'ativo = false')
    expect(erroDe(await trocar(d.cookie, { empresaId: inativa })).erro).toBe(
      'empresa_nao_permitida',
    )
  })

  it('entrada inválida: 400 validacao_invalida (id que não é uuid, campo faltando ou extra)', async () => {
    const d = await novoDono(app)
    for (const corpo of [
      {},
      { empresaId: 'abc' },
      { empresaId: 42 },
      { empresaId: d.tenantId, papel: 'admin' },
    ]) {
      const r = await trocar(d.cookie, corpo)
      expect(r.status).toBe(400)
      expect(erroDe(r).erro).toBe('validacao_invalida')
    }
  })

  it('quem ainda não ativou o 2FA troca a empresa (a regra vale na empresa que fica ativa); as demais rotas seguem barradas', async () => {
    const d = await novoDono(app, { com2fa: false })
    const r = await trocar(d.cookie, { empresaId: d.tenantId })
    expect(r.status).toBe(200)
    expect(await empresaAtivaNoBanco(d.usuarioId)).toEqual([d.tenantId])
    const outra = await get('/v1/teste-me/dados', d.cookie)
    expect(outra.status).toBe(403)
    expect(erroDe(outra).erro).toBe('2fa_obrigatorio')
  })

  it('perdeu o vínculo com a empresa ativa: as rotas dão 403 e o /me deixa escolher outra', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'vendedor')
    await trocar(d.cookie, { empresaId: b }).expect(200)
    expect((await get('/v1/teste-me/dados', d.cookie)).status).toBe(200)
    await mudarMembro(b, d.usuarioId, 'excluido_em = now()')
    expect(erroDe(await get('/v1/teste-me/dados', d.cookie)).erro).toBe('empresa_ativa_invalida')
    const me = await meDe(d.cookie)
    expect(me.empresas.map((e) => e.id)).toEqual([d.tenantId])
    expect(me.empresas.some((e) => e.ativa)).toBe(false) // a ativa gravada não está mais entre as dele
    await trocar(d.cookie, { empresaId: d.tenantId }).expect(200)
    expect((await get('/v1/teste-me/dados', d.cookie)).status).toBe(200)
  })
})
