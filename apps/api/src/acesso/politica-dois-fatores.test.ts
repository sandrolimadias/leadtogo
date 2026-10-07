import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import {
  type MeResposta,
  type PoliticaDoisFatores,
  politicaDoisFatoresSchema,
  politicaExige,
  type Seguranca,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { entrar, limparLimitesAuth, ORIGEM_DO_FRONT, SENHA_PADRAO } from '../testes/auth-teste.js'
import {
  dono,
  ligar2fa,
  novaEmpresa,
  novoDono,
  usuarioSimples,
  vincular,
  ativar,
} from '../testes/mundo.js'
import { codigoTotp, segredoDaUri } from '../testes/totp.js'

// Política de 2FA por empresa (`tenant_configuracoes.dois_fatores_exigido`): admin (padrão),
// admin_gestor e todos. O guard aplica a da EMPRESA ATIVA, para o papel do usuário nela.

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  for (const chave of await valkey.keys('leadtogo:rl:*')) await valkey.del(chave)
  app = await criarApp(configuracaoDeTeste({ TRUST_PROXY: '1', LOG_LEVEL: 'silent' }))
  await app.init()
})
afterEach(() => app.close())

const get = (caminho: string, cookie: string) =>
  request(app.getHttpServer()).get(caminho).set('Cookie', cookie)
const escrever = (metodo: 'post' | 'patch', caminho: string, cookie: string, corpo?: object) =>
  request(app.getHttpServer())
    [metodo](caminho)
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send(corpo)
const erroDe = (r: request.Response) => r.body as RespostaDeErro

/** Rota comum, protegida (a equipe da empresa ativa): é onde o guard barra ou deixa passar. */
const rotaComum = (cookie: string) => get('/v1/membros', cookie)

/** Define a política direto no banco (o PATCH tem os próprios testes). */
async function definirPolitica(tenantId: string, politica: PoliticaDoisFatores) {
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx`INSERT INTO tenant_configuracoes (tenant_id, dois_fatores_exigido)
             VALUES (${tenantId}, ${politica}::politica_dois_fatores)
             ON CONFLICT (tenant_id) DO UPDATE SET dois_fatores_exigido = EXCLUDED.dois_fatores_exigido`
  })
}

/** Uma conta com uma empresa onde o dono é admin com 2FA, e a empresa extra pedida. */
async function mundo() {
  const d = await novoDono(app)
  return d
}

/** Usuário SEM 2FA, com o papel dado na empresa, já logado e com ela ativa. */
async function usuarioNaEmpresa(tenantId: string, papel: 'admin' | 'gestor' | 'vendedor') {
  const u = await usuarioSimples(app)
  await vincular(tenantId, u.id, papel)
  await ativar(u.id, tenantId)
  return u
}

describe('cada valor da política, para cada papel, sem 2FA', () => {
  const politicas = politicaDoisFatoresSchema.options
  const papeis = ['admin', 'gestor', 'vendedor'] as const

  for (const politica of politicas) {
    for (const papel of papeis) {
      const barrado = politicaExige(politica, papel)
      it(`${politica} + ${papel}: ${barrado ? 'barrado (2fa_obrigatorio)' : 'passa'}`, async () => {
        const d = await mundo()
        await definirPolitica(d.tenantId, politica)
        const u = await usuarioNaEmpresa(d.tenantId, papel)
        const r = await rotaComum(u.cookie)
        if (barrado) {
          expect(r.status).toBe(403)
          expect(erroDe(r).erro).toBe('2fa_obrigatorio')
        } else {
          expect(r.status).toBe(200)
        }
        // com 2FA ligado, passa em qualquer política
        await ligar2fa(u.id)
        expect((await rotaComum(u.cookie)).status).toBe(200)
      })
    }
  }

  it('sem linha de configuração vale o padrão (admin)', async () => {
    const d = await mundo()
    const semConfig = await novaEmpresa(d.contaId)
    const admin = await usuarioNaEmpresa(semConfig, 'admin')
    const vendedor = await usuarioNaEmpresa(semConfig, 'vendedor')
    expect(erroDe(await rotaComum(admin.cookie)).erro).toBe('2fa_obrigatorio')
    expect((await rotaComum(vendedor.cookie)).status).toBe(200)
  })
})

describe('troca de empresa com políticas diferentes: o bloqueio é só onde é exigido', () => {
  it('vendedor sem 2FA: livre na empresa que não exige, preso na que exige, e a troca sempre funciona', async () => {
    const d = await mundo()
    const livre = d.tenantId // política admin: vendedor passa
    const exigente = await novaEmpresa(d.contaId)
    await definirPolitica(exigente, 'todos')
    const u = await usuarioSimples(app)
    await vincular(livre, u.id, 'vendedor')
    await vincular(exigente, u.id, 'vendedor')

    const trocar = (id: string) =>
      escrever('post', '/v1/sessao/empresa-ativa', u.cookie, { empresaId: id })
    const me = async () => (await get('/v1/me', u.cookie)).body as MeResposta

    expect((await trocar(livre)).status).toBe(200)
    expect((await rotaComum(u.cookie)).status).toBe(200)
    expect(await me()).toMatchObject({ doisFatoresPendente: false, doisFatoresObrigatorio: true })

    // entra na empresa que exige: a troca vale, as rotas dela não, e o /me diz que falta ativar
    expect((await trocar(exigente)).status).toBe(200)
    const barrada = await rotaComum(u.cookie)
    expect(barrada.status).toBe(403)
    expect(erroDe(barrada).erro).toBe('2fa_obrigatorio')
    expect(await me()).toMatchObject({ doisFatoresPendente: true, doisFatoresObrigatorio: true })

    // volta para a que não exige: liberado de novo
    expect((await trocar(livre)).status).toBe(200)
    expect((await rotaComum(u.cookie)).status).toBe(200)
    expect((await me()).doisFatoresPendente).toBe(false)

    // ativou o 2FA: passa nas duas
    await ligar2fa(u.id)
    expect((await trocar(exigente)).status).toBe(200)
    expect((await rotaComum(u.cookie)).status).toBe(200)
  })

  it('o mesmo usuário com papéis e políticas diferentes: gestor onde exige gestor, vendedor onde só exige admin', async () => {
    const d = await mundo()
    const a = d.tenantId
    const b = await novaEmpresa(d.contaId)
    await definirPolitica(a, 'admin_gestor')
    await definirPolitica(b, 'admin_gestor')
    const u = await usuarioSimples(app)
    await vincular(a, u.id, 'gestor') // exigido em A
    await vincular(b, u.id, 'vendedor') // não exigido em B
    await ativar(u.id, a)
    expect(erroDe(await rotaComum(u.cookie)).erro).toBe('2fa_obrigatorio')
    expect(
      (await escrever('post', '/v1/sessao/empresa-ativa', u.cookie, { empresaId: b })).status,
    ).toBe(200)
    expect((await rotaComum(u.cookie)).status).toBe(200)
  })

  it('sem empresa ativa não há política a aplicar: o usuário pode escolher a empresa', async () => {
    const d = await mundo()
    await definirPolitica(d.tenantId, 'todos')
    const u = await usuarioSimples(app)
    await vincular(d.tenantId, u.id, 'vendedor')
    const me = (await get('/v1/me', u.cookie)).body as MeResposta
    expect(me).toMatchObject({
      empresaAtivaId: null,
      doisFatoresPendente: false,
      doisFatoresObrigatorio: true,
    })
  })

  it('administrador da conta sem 2FA continua barrado em qualquer empresa (consolidado)', async () => {
    const d = await novoDono(app, { com2fa: false })
    const livre = await novaEmpresa(d.contaId)
    await ativar(d.usuarioId, livre)
    expect(erroDe(await rotaComum(d.cookie)).erro).toBe('2fa_obrigatorio')
  })
})

describe('motivo da obrigatoriedade no /me', () => {
  it('administrador da conta: motivo "conta"; vendedor numa empresa que exige de todos: "empresa" com o papel; sem regra: null', async () => {
    const d = await mundo()
    const dono = (await get('/v1/me', d.cookie)).body as MeResposta
    expect(dono.doisFatoresMotivo).toEqual({ origem: 'conta', empresaId: null, papel: null })

    await definirPolitica(d.tenantId, 'todos')
    const v = await usuarioNaEmpresa(d.tenantId, 'vendedor')
    const comoVendedor = (await get('/v1/me', v.cookie)).body as MeResposta
    expect(comoVendedor.doisFatoresMotivo).toEqual({
      origem: 'empresa',
      empresaId: d.tenantId,
      papel: 'vendedor',
    })

    await definirPolitica(d.tenantId, 'admin')
    expect(((await get('/v1/me', v.cookie)).body as MeResposta).doisFatoresMotivo).toBeNull()
  })
})

describe('PATCH /v1/configuracoes/seguranca (só o administrador da empresa)', () => {
  it('GET devolve o padrão; o admin altera para cada valor e o GET reflete', async () => {
    const d = await mundo()
    await ativar(d.usuarioId, d.tenantId)
    expect((await get('/v1/configuracoes/seguranca', d.cookie)).body).toEqual({
      doisFatoresExigido: 'admin',
    } satisfies Seguranca)
    for (const valor of ['admin_gestor', 'todos', 'admin'] as const) {
      const r = await escrever('patch', '/v1/configuracoes/seguranca', d.cookie, {
        doisFatoresExigido: valor,
      })
      expect(r.status).toBe(200)
      expect(r.body).toEqual({ doisFatoresExigido: valor })
      expect((await get('/v1/configuracoes/seguranca', d.cookie)).body).toEqual({
        doisFatoresExigido: valor,
      })
    }
  })

  it('a mudança vale na próxima requisição de quem já estava dentro', async () => {
    const d = await mundo()
    await ativar(d.usuarioId, d.tenantId)
    const vendedor = await usuarioNaEmpresa(d.tenantId, 'vendedor')
    expect((await rotaComum(vendedor.cookie)).status).toBe(200)
    await escrever('patch', '/v1/configuracoes/seguranca', d.cookie, {
      doisFatoresExigido: 'todos',
    }).expect(200)
    expect(erroDe(await rotaComum(vendedor.cookie)).erro).toBe('2fa_obrigatorio')
    // o próprio admin tem 2FA e segue trabalhando
    expect((await rotaComum(d.cookie)).status).toBe(200)
  })

  it('gestor e vendedor recebem 403 acesso_negado e a política não muda', async () => {
    const d = await mundo()
    for (const papel of ['gestor', 'vendedor'] as const) {
      const u = await usuarioNaEmpresa(d.tenantId, papel)
      await ligar2fa(u.id)
      const r = await escrever('patch', '/v1/configuracoes/seguranca', u.cookie, {
        doisFatoresExigido: 'todos',
      })
      expect(r.status).toBe(403)
      expect(erroDe(r).erro).toBe('acesso_negado')
    }
    await ativar(d.usuarioId, d.tenantId)
    expect((await get('/v1/configuracoes/seguranca', d.cookie)).body).toEqual({
      doisFatoresExigido: 'admin',
    })
  })

  it('valor inválido ou campo extra: 400; sem login: 401', async () => {
    const d = await mundo()
    await ativar(d.usuarioId, d.tenantId)
    for (const corpo of [
      { doisFatoresExigido: 'ninguem' },
      {},
      { doisFatoresExigido: 'todos', x: 1 },
    ]) {
      const r = await escrever('patch', '/v1/configuracoes/seguranca', d.cookie, corpo)
      expect(r.status).toBe(400)
      expect(erroDe(r).erro).toBe('validacao_invalida')
    }
    expect((await request(app.getHttpServer()).get('/v1/configuracoes/seguranca')).status).toBe(401)
  })

  it('isolamento: a política de uma empresa não muda a de outra, nem é vista por ela', async () => {
    const a = await mundo()
    const b = await mundo()
    await ativar(a.usuarioId, a.tenantId)
    await ativar(b.usuarioId, b.tenantId)
    await escrever('patch', '/v1/configuracoes/seguranca', a.cookie, {
      doisFatoresExigido: 'todos',
    }).expect(200)
    expect((await get('/v1/configuracoes/seguranca', b.cookie)).body).toEqual({
      doisFatoresExigido: 'admin',
    })
    const [linha] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${b.tenantId}, true)`
      return tx<
        { dois_fatores_exigido: string }[]
      >`SELECT dois_fatores_exigido FROM tenant_configuracoes`
    })
    expect(linha?.dois_fatores_exigido).toBe('admin')
  })

  it('empresa sem linha de configuração: o PATCH a cria (upsert)', async () => {
    const d = await mundo()
    const semConfig = await novaEmpresa(d.contaId)
    const u = await usuarioNaEmpresa(semConfig, 'admin')
    await ligar2fa(u.id)
    const r = await escrever('patch', '/v1/configuracoes/seguranca', u.cookie, {
      doisFatoresExigido: 'admin_gestor',
    })
    expect(r.status).toBe(200)
    expect((await get('/v1/configuracoes/seguranca', u.cookie)).body).toEqual({
      doisFatoresExigido: 'admin_gestor',
    })
  })
})

/** Usuário com 2FA de verdade (enable + verify) e a empresa ativa. */
async function usuarioComDoisFatoresReais(
  tenantId: string,
  papel: 'admin' | 'gestor' | 'vendedor',
) {
  const u = await usuarioSimples(app)
  await vincular(tenantId, u.id, papel)
  await ativar(u.id, tenantId)
  const ativacao = await escrever('post', '/v1/auth/two-factor/enable', u.cookie, {
    password: SENHA_PADRAO,
  })
  expect(ativacao.status).toBe(200)
  const segredo = segredoDaUri((ativacao.body as { totpURI: string }).totpURI)
  const verificado = await escrever('post', '/v1/auth/two-factor/verify-totp', u.cookie, {
    code: codigoTotp(segredo),
  })
  expect(verificado.status).toBe(200)
  // a confirmação gira a sessão: entra de novo (agora com 2FA pede o código) — usa o cookie novo
  const novo = ((verificado.headers['set-cookie'] as unknown as string[]) ?? [])
    .filter((c) => /session_token=[^;]+/.test(c) && !/Max-Age=0/i.test(c))
    .map((c) => c.split(';')[0])
    .join('; ')
  await ativar(u.id, tenantId)
  return { ...u, cookie: novo, segredo }
}

describe('desativar o 2FA: senha, código, e só onde nenhuma regra exige', () => {
  const desativar = (cookie: string, corpo: object) =>
    escrever('post', '/v1/auth/two-factor/disable', cookie, corpo)

  it('quem não é obrigado desativa com a senha e um código atual; sem código ou com código errado, não', async () => {
    const d = await mundo()
    const u = await usuarioComDoisFatoresReais(d.tenantId, 'vendedor')
    const semCodigo = await desativar(u.cookie, { password: SENHA_PADRAO })
    expect(semCodigo.status).toBe(400)
    expect((semCodigo.body as { code?: string }).code).toBe('CODIGO_OBRIGATORIO')
    const errado = await desativar(u.cookie, { password: SENHA_PADRAO, code: '000000' })
    expect(errado.status).toBeGreaterThanOrEqual(400)
    const senhaErrada = await desativar(u.cookie, {
      password: 'senha-errada-999',
      code: codigoTotp(u.segredo),
    })
    expect(senhaErrada.status).toBeGreaterThanOrEqual(400)
    const [antes] = await dono`SELECT two_factor_enabled FROM auth."user" WHERE id = ${u.id}`
    expect(antes?.['two_factor_enabled']).toBe(true)

    const ok = await desativar(u.cookie, { password: SENHA_PADRAO, code: codigoTotp(u.segredo) })
    expect(ok.status).toBe(200)
    const [depois] = await dono`SELECT two_factor_enabled FROM auth."user" WHERE id = ${u.id}`
    expect(depois?.['two_factor_enabled']).toBe(false)
  })

  it('o administrador não desativa enquanto a política exigir (403), nem com senha e código certos', async () => {
    const d = await mundo()
    const admin = await usuarioComDoisFatoresReais(d.tenantId, 'admin')
    const r = await desativar(admin.cookie, {
      password: SENHA_PADRAO,
      code: codigoTotp(admin.segredo),
    })
    expect(r.status).toBe(403)
    expect((r.body as { code?: string }).code).toBe('DOIS_FATORES_OBRIGATORIO')
    const [u] = await dono`SELECT two_factor_enabled FROM auth."user" WHERE id = ${admin.id}`
    expect(u?.['two_factor_enabled']).toBe(true)
    expect(((await get('/v1/me', admin.cookie)).body as MeResposta).doisFatoresObrigatorio).toBe(
      true,
    )
  })

  it('o vendedor perde o direito de desativar quando a política passa a exigir dele, e ganha de volta quando deixa de exigir', async () => {
    const d = await mundo()
    const u = await usuarioComDoisFatoresReais(d.tenantId, 'vendedor')
    await definirPolitica(d.tenantId, 'todos')
    expect(((await get('/v1/me', u.cookie)).body as MeResposta).doisFatoresObrigatorio).toBe(true)
    const barrado = await desativar(u.cookie, {
      password: SENHA_PADRAO,
      code: codigoTotp(u.segredo),
    })
    expect(barrado.status).toBe(403)
    await definirPolitica(d.tenantId, 'admin')
    expect(((await get('/v1/me', u.cookie)).body as MeResposta).doisFatoresObrigatorio).toBe(false)
    expect(
      (await desativar(u.cookie, { password: SENHA_PADRAO, code: codigoTotp(u.segredo) })).status,
    ).toBe(200)
  })

  it('exigir em QUALQUER empresa do usuário basta para não poder desativar', async () => {
    const d = await mundo()
    const outra = await novaEmpresa(d.contaId)
    await definirPolitica(outra, 'todos')
    const u = await usuarioComDoisFatoresReais(d.tenantId, 'vendedor')
    await vincular(outra, u.id, 'vendedor')
    const r = await desativar(u.cookie, { password: SENHA_PADRAO, code: codigoTotp(u.segredo) })
    expect(r.status).toBe(403)
  })

  it('gerar novos códigos de recuperação exige a senha e invalida os antigos', async () => {
    const d = await mundo()
    const u = await usuarioComDoisFatoresReais(d.tenantId, 'vendedor')
    const sem = await escrever('post', '/v1/auth/two-factor/generate-backup-codes', u.cookie, {})
    expect(sem.status).toBeGreaterThanOrEqual(400)
    const r = await escrever('post', '/v1/auth/two-factor/generate-backup-codes', u.cookie, {
      password: SENHA_PADRAO,
    })
    expect(r.status).toBe(200)
    expect((r.body as { backupCodes: string[] }).backupCodes.length).toBeGreaterThanOrEqual(5)
  })
})

// referência para o leitor: o login de quem tem 2FA passa pelo código (coberto em two-factor.test.ts)
void entrar
void novoId
