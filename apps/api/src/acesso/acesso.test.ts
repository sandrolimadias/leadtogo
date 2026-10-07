import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import { sql } from '@leadtogo/db'
import { Body, Controller, Get, type INestApplication, Post } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ErroApi } from '../http/erro-api.js'
import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT, SENHA_PADRAO } from '../testes/auth-teste.js'
import { codigoTotp, segredoDaUri } from '../testes/totp.js'
import {
  ativar,
  dono,
  empresaDeOutraConta,
  ligar2fa,
  membroSemLogin,
  mudarMembro,
  mudarSituacao,
  novaEmpresa,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'
import { Consolidado, PermiteSem2fa, Publica, SemEmpresa } from './acesso.decorators.js'
import { ContextoTenantService } from './contexto-tenant.service.js'

type LinhaMembro = { id: string; nome: string; tenant_id: string }

@Controller('teste-acesso')
class RotasDeAcesso {
  constructor(private readonly ctx: ContextoTenantService) {}

  /** Rota comum (sem marca nenhuma): protegida por padrão */
  @Get('empresa')
  async empresa() {
    const membros = await this.ctx
      .db()
      .execute<LinhaMembro>(sql`SELECT id, nome, tenant_id FROM membros ORDER BY nome`)
    const [cfg] = await this.ctx
      .db()
      .execute<{ tenant: string; usuario: string }>(
        sql`SELECT current_setting('app.tenant_id', true) AS tenant, current_setting('app.user_id', true) AS usuario`,
      )
    return {
      tenantId: this.ctx.tenantId,
      membro: this.ctx.membro,
      membros: [...membros],
      config: cfg,
    }
  }

  @Post('escrever')
  async escrever(@Body() corpo: { tenantId: string; nome: string }) {
    await this.ctx
      .db()
      .execute(
        sql`INSERT INTO membros (id, tenant_id, nome) VALUES (${crypto.randomUUID()}, ${corpo.tenantId}, ${corpo.nome})`,
      )
    return { ok: true }
  }

  @Post('escrever-e-falhar')
  async escreverEFalhar(@Body() corpo: { nome: string }) {
    await this.ctx
      .db()
      .execute(
        sql`INSERT INTO membros (id, tenant_id, nome) VALUES (${crypto.randomUUID()}, ${this.ctx.tenantId}, ${corpo.nome})`,
      )
    throw new ErroApi('falha_de_teste', 'falhou depois de gravar', 422)
  }

  @Get('sem-empresa')
  @SemEmpresa()
  semEmpresa() {
    return { ok: true }
  }

  @Get('sem-2fa')
  @SemEmpresa()
  @PermiteSem2fa()
  semDoisFatores() {
    return { ok: true }
  }

  @Get('publica')
  @Publica()
  publica() {
    return { ok: true }
  }

  @Get('consolidado')
  @Consolidado()
  async consolidado() {
    const tenants = await this.ctx.db().execute<{ id: string }>(sql`SELECT id FROM tenants`)
    const membros = await this.ctx
      .db()
      .execute<LinhaMembro>(sql`SELECT id, nome, tenant_id FROM membros`)
    const [cfg] = await this.ctx
      .db()
      .execute<{ tenant: string | null; ids: string }>(
        sql`SELECT nullif(current_setting('app.tenant_id', true), '') AS tenant, current_setting('app.tenant_ids', true) AS ids`,
      )
    return {
      tenants: tenants.map((t) => t.id),
      membros: [...membros],
      config: cfg,
      tenantIds: this.ctx.tenantIds,
    }
  }

  @Get('consolidado-tenta-escrever')
  @Consolidado()
  async consolidadoTentaEscrever() {
    await this.ctx
      .db()
      .execute(
        sql`INSERT INTO membros (id, tenant_id, nome) VALUES (${crypto.randomUUID()}, ${this.ctx.tenantIds[0] ?? ''}, 'intruso')`,
      )
    return { ok: true }
  }

  @Post('consolidado-post')
  @Consolidado()
  consolidadoPost() {
    return { ok: true }
  }
}

const erroDe = (r: request.Response) => r.body as RespostaDeErro
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
const linhasDeLog: Record<string, unknown>[] = []
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  linhasDeLog.length = 0
  const destino = new Writable({
    write(pedaco, _c, pronto) {
      for (const t of String(pedaco).split('\n').filter(Boolean))
        linhasDeLog.push(JSON.parse(t) as Record<string, unknown>)
      pronto()
    },
  })
  app = await criarAppComRotas(
    [RotasDeAcesso],
    configuracaoDeTeste({ LOG_LEVEL: 'info', TRUST_PROXY: '1' }),
    {
      destinoLog: destino,
    },
  )
})
afterEach(() => app.close())

const get = (caminho: string, cookie?: string) => {
  const r = request(app.getHttpServer()).get(caminho)
  return cookie ? r.set('Cookie', cookie) : r
}
const post = (caminho: string, cookie: string, corpo: object = {}) =>
  request(app.getHttpServer())
    .post(caminho)
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send(corpo)

describe('autenticação: o padrão é protegido', () => {
  it('sem sessão: 401 em rota comum, no consolidado e na rota sem empresa; a pública segue aberta', async () => {
    for (const caminho of [
      '/v1/teste-acesso/empresa',
      '/v1/teste-acesso/sem-empresa',
      '/v1/teste-acesso/consolidado',
    ]) {
      const r = await get(caminho)
      expect(r.status, caminho).toBe(401)
      expect(erroDe(r).erro).toBe('nao_autenticado')
    }
    expect((await get('/v1/teste-acesso/publica')).status).toBe(200)
    expect((await get('/health')).status).toBe(200)
  })

  it('cookie inválido ou de sessão apagada: 401', async () => {
    const { cookie } = await novoDono(app)
    await dono`DELETE FROM auth.session`
    expect((await get('/v1/teste-acesso/empresa', cookie)).status).toBe(401)
    expect((await get('/v1/teste-acesso/empresa', 'leadtogo.session_token=lixo.lixo')).status).toBe(
      401,
    )
  })
})

describe('empresa ativa e contexto do tenant', () => {
  it('sem empresa ativa: 409 sem_empresa_ativa; as rotas @SemEmpresa passam', async () => {
    const { cookie } = await novoDono(app, { semEmpresaAtiva: true })
    const r = await get('/v1/teste-acesso/empresa', cookie)
    expect(r.status).toBe(409)
    expect(erroDe(r).erro).toBe('sem_empresa_ativa')
    expect((await get('/v1/teste-acesso/sem-empresa', cookie)).status).toBe(200)
  })

  it('com a empresa ativa: vê só os membros dela, e app.tenant_id / app.user_id valem na transação', async () => {
    const d = await novoDono(app)
    const outra = await novaEmpresa(d.contaId)
    await membroSemLogin(d.tenantId, 'Vendedora da A')
    await membroSemLogin(outra, 'Vendedor da B')
    await ativar(d.usuarioId, d.tenantId)
    const r = await get('/v1/teste-acesso/empresa', d.cookie)
    expect(r.status).toBe(200)
    const corpo = r.body as {
      tenantId: string
      membro: { papel: string }
      membros: LinhaMembro[]
      config: { tenant: string; usuario: string }
    }
    expect(corpo.tenantId).toBe(d.tenantId)
    expect(corpo.membro.papel).toBe('admin')
    expect(corpo.membros.every((m) => m.tenant_id === d.tenantId)).toBe(true)
    expect(corpo.membros.map((m) => m.nome)).toContain('Vendedora da A')
    expect(corpo.membros.map((m) => m.nome)).not.toContain('Vendedor da B')
    expect(corpo.config).toEqual({ tenant: d.tenantId, usuario: d.usuarioId })
  })

  it('trocar a empresa ativa troca o que a rota enxerga', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'admin', 'Eu na B')
    await membroSemLogin(b, 'Só da B')
    await ativar(d.usuarioId, d.tenantId)
    const naA = (await get('/v1/teste-acesso/empresa', d.cookie)).body as { membros: LinhaMembro[] }
    expect(naA.membros.map((m) => m.nome)).not.toContain('Só da B')
    await ativar(d.usuarioId, b)
    const naB = (await get('/v1/teste-acesso/empresa', d.cookie)).body as {
      tenantId: string
      membros: LinhaMembro[]
    }
    expect(naB.tenantId).toBe(b)
    expect(naB.membros.map((m) => m.nome).sort()).toEqual(['Eu na B', 'Só da B'])
  })

  it('o log da requisição leva tenant_id e user_id', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    linhasDeLog.length = 0
    await get('/v1/teste-acesso/empresa', d.cookie).expect(200)
    const concluida = linhasDeLog.find(
      (l) =>
        l['msg'] === 'request completed' &&
        (l['req'] as { url: string }).url.includes('teste-acesso'),
    )
    expect(concluida).toMatchObject({ tenant_id: d.tenantId, user_id: d.usuarioId })
  })

  it('desfaz tudo se o handler falhar depois de gravar', async () => {
    const d = await novoDono(app)
    await ativar(d.usuarioId, d.tenantId)
    const r = await post('/v1/teste-acesso/escrever-e-falhar', d.cookie, { nome: 'fantasma' })
    expect(r.status).toBe(422)
    const nomes = (await get('/v1/teste-acesso/empresa', d.cookie)).body as {
      membros: LinhaMembro[]
    }
    expect(nomes.membros.map((m) => m.nome)).not.toContain('fantasma')
  })

  it('requisições simultâneas de empresas diferentes não se misturam', async () => {
    const um = await novoDono(app)
    const dois = await novoDono(app)
    await membroSemLogin(um.tenantId, 'Marca-UM')
    await membroSemLogin(dois.tenantId, 'Marca-DOIS')
    await ativar(um.usuarioId, um.tenantId)
    await ativar(dois.usuarioId, dois.tenantId)
    const respostas = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        get('/v1/teste-acesso/empresa', i % 2 === 0 ? um.cookie : dois.cookie),
      ),
    )
    respostas.forEach((r, i) => {
      const corpo = r.body as { tenantId: string; membros: LinhaMembro[] }
      const dele = i % 2 === 0 ? um : dois
      expect(corpo.tenantId).toBe(dele.tenantId)
      expect(corpo.membros.every((m) => m.tenant_id === dele.tenantId)).toBe(true)
      expect(corpo.membros.map((m) => m.nome)).toContain(i % 2 === 0 ? 'Marca-UM' : 'Marca-DOIS')
    })
  })
})

describe('o usuário da empresa A não acessa a empresa B', () => {
  it('empresa ativa onde NÃO é membro: 403 empresa_ativa_invalida, sem abrir transação de tenant', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app) // outra conta, outra empresa
    await membroSemLogin(b.tenantId, 'Segredo da B')
    await ativar(a.usuarioId, b.tenantId) // sessão da A apontando para a empresa da B
    const r = await get('/v1/teste-acesso/empresa', a.cookie)
    expect(r.status).toBe(403)
    expect(erroDe(r).erro).toBe('empresa_ativa_invalida')
    expect(JSON.stringify(r.body)).not.toContain('Segredo da B')
  })

  it('com a A ativa, gravar na B é barrado pelo RLS (403) e nada é gravado', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app)
    await ativar(a.usuarioId, a.tenantId)
    const r = await post('/v1/teste-acesso/escrever', a.cookie, {
      tenantId: b.tenantId,
      nome: 'invasor',
    })
    expect(r.status).toBe(403)
    expect(erroDe(r).erro).toBe('acesso_negado')
    expect(JSON.stringify(r.body)).not.toMatch(/row-level|policy|membros/i) // sem detalhe do banco
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${b.tenantId}, true)`
      expect(await tx`SELECT 1 FROM membros WHERE nome = 'invasor'`).toHaveLength(0)
    })
    // gravar na própria empresa funciona
    expect(
      (
        await post('/v1/teste-acesso/escrever', a.cookie, {
          tenantId: a.tenantId,
          nome: 'legitimo',
        })
      ).status,
    ).toBe(201)
  })

  it('membro inativo, excluído ou de empresa suspensa/cancelada perde o acesso na hora', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'vendedor')
    await ativar(d.usuarioId, b)
    expect((await get('/v1/teste-acesso/empresa', d.cookie)).status).toBe(200)

    await mudarMembro(b, d.usuarioId, 'ativo = false')
    expect(erroDe(await get('/v1/teste-acesso/empresa', d.cookie)).erro).toBe(
      'empresa_ativa_invalida',
    )

    const c = await novaEmpresa(d.contaId)
    await vincular(c, d.usuarioId, 'vendedor')
    await ativar(d.usuarioId, c)
    await mudarMembro(c, d.usuarioId, 'excluido_em = now()')
    expect(erroDe(await get('/v1/teste-acesso/empresa', d.cookie)).erro).toBe(
      'empresa_ativa_invalida',
    )

    for (const situacao of ['suspenso', 'cancelado'] as const) {
      const e = await novaEmpresa(d.contaId)
      await vincular(e, d.usuarioId, 'vendedor')
      await ativar(d.usuarioId, e)
      await mudarSituacao(e, situacao)
      const r = await get('/v1/teste-acesso/empresa', d.cookie)
      expect(r.status).toBe(403)
      expect(erroDe(r).erro).toBe('empresa_indisponivel')
    }
  })
})

describe('2FA obrigatório para administradores', () => {
  it('admin sem 2FA: 403 2fa_obrigatorio nas rotas comuns e no consolidado; passa em @PermiteSem2fa', async () => {
    const d = await novoDono(app, { com2fa: false })
    await ativar(d.usuarioId, d.tenantId)
    for (const caminho of [
      '/v1/teste-acesso/empresa',
      '/v1/teste-acesso/consolidado',
      '/v1/teste-acesso/sem-empresa',
    ]) {
      const r = await get(caminho, d.cookie)
      expect(r.status, caminho).toBe(403)
      expect(erroDe(r).erro).toBe('2fa_obrigatorio')
    }
    expect((await get('/v1/teste-acesso/sem-2fa', d.cookie)).status).toBe(200)
  })

  it('o admin recém-criado ativa o 2FA e depois acessa normalmente (a sessão gira e mantém a empresa ativa)', async () => {
    const d = await novoDono(app, { com2fa: false })
    await ativar(d.usuarioId, d.tenantId)
    expect((await get('/v1/teste-acesso/empresa', d.cookie)).status).toBe(403)

    // as rotas de ativação do 2FA (Better Auth) seguem abertas para ele
    const ativacao = await post('/v1/auth/two-factor/enable', d.cookie, { password: SENHA_PADRAO })
    expect(ativacao.status).toBe(200)
    const segredo = segredoDaUri((ativacao.body as { totpURI: string }).totpURI)
    const confirmacao = await post('/v1/auth/two-factor/verify-totp', d.cookie, {
      code: codigoTotp(segredo),
    })
    expect(confirmacao.status).toBe(200)
    const cookieNovo = ((confirmacao.headers['set-cookie'] as unknown as string[]) ?? [])
      .filter((c) => /session_token=[^;]+/.test(c) && !/Max-Age=0/i.test(c))
      .map((c) => c.split(';')[0])
      .join('; ')

    // O Better Auth gira a sessão (id novo, o cookie antigo morre) e COPIA a empresa ativa para a nova:
    // o admin continua na empresa que escolheu. Este teste fixa isso (se mudar numa atualização, avisa).
    expect((await get('/v1/teste-acesso/empresa', d.cookie)).status).toBe(401)
    const ok = await get('/v1/teste-acesso/empresa', cookieNovo)
    expect(ok.status).toBe(200)
    expect((ok.body as { tenantId: string }).tenantId).toBe(d.tenantId)
  })

  it('quem não é administrador entra sem 2FA (vendedor e gestor)', async () => {
    const d = await novoDono(app)
    const vendedor = await usuarioSimples(app)
    await vincular(d.tenantId, vendedor.id, 'vendedor')
    await ativar(vendedor.id, d.tenantId)
    expect((await get('/v1/teste-acesso/empresa', vendedor.cookie)).status).toBe(200)

    const gestor = await usuarioSimples(app)
    await vincular(d.tenantId, gestor.id, 'gestor')
    await ativar(gestor.id, d.tenantId)
    expect((await get('/v1/teste-acesso/empresa', gestor.cookie)).status).toBe(200)
  })

  it('o administrador da conta (dono) sem 2FA também é barrado, mesmo sem ser admin de empresa nenhuma', async () => {
    const d = await novoDono(app, { com2fa: false })
    await dono`UPDATE membros SET papel = 'vendedor' WHERE usuario_id = ${d.usuarioId}`.catch(
      () => undefined,
    )
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`UPDATE membros SET papel = 'vendedor' WHERE usuario_id = ${d.usuarioId}`
    })
    await ativar(d.usuarioId, d.tenantId)
    expect(erroDe(await get('/v1/teste-acesso/empresa', d.cookie)).erro).toBe('2fa_obrigatorio')
    await ligar2fa(d.usuarioId)
    expect((await get('/v1/teste-acesso/empresa', d.cookie)).status).toBe(200)
  })
})

describe('consolidado (/v1/consolidado/*): só administradores da conta, só leitura', () => {
  it('o dono da conta vê TODAS as empresas dela, com app.tenant_ids e sem app.tenant_id', async () => {
    const d = await novoDono(app)
    const b = await novaEmpresa(d.contaId)
    const c = await novaEmpresa(d.contaId)
    const fora = await empresaDeOutraConta()
    await membroSemLogin(d.tenantId, 'da A')
    await membroSemLogin(b, 'da B')
    await membroSemLogin(fora.tenantId, 'de FORA')
    const r = await get('/v1/teste-acesso/consolidado', d.cookie)
    expect(r.status).toBe(200)
    const corpo = r.body as {
      tenants: string[]
      membros: LinhaMembro[]
      config: { tenant: string | null }
      tenantIds: string[]
    }
    expect([...corpo.tenants].sort()).toEqual([d.tenantId, b, c].sort())
    expect(corpo.tenantIds.sort()).toEqual([d.tenantId, b, c].sort())
    expect(corpo.config.tenant).toBeNull() // nenhuma empresa "ativa": só leitura
    const nomes = corpo.membros.map((m) => m.nome)
    expect(nomes).toEqual(expect.arrayContaining(['da A', 'da B']))
    expect(nomes).not.toContain('de FORA') // outra conta nunca entra
  })

  it('não depende da empresa ativa, e ignora empresas suspensas ou canceladas', async () => {
    const d = await novoDono(app)
    const suspensa = await novaEmpresa(d.contaId, 'suspenso')
    const r = await get('/v1/teste-acesso/consolidado', d.cookie) // sem empresa ativa
    expect(r.status).toBe(200)
    expect((r.body as { tenants: string[] }).tenants).toEqual([d.tenantId])
    expect((r.body as { tenants: string[] }).tenants).not.toContain(suspensa)
  })

  it('é somente leitura: POST dá 405 e escrever dentro de um GET é barrado pelo banco', async () => {
    const d = await novoDono(app)
    const post405 = await post('/v1/teste-acesso/consolidado-post', d.cookie)
    expect(post405.status).toBe(405)
    expect(erroDe(post405).erro).toBe('metodo_nao_permitido')
    const escrita = await get('/v1/teste-acesso/consolidado-tenta-escrever', d.cookie)
    expect(escrita.status).toBe(403)
    expect(['somente_leitura', 'acesso_negado']).toContain(erroDe(escrita).erro)
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      expect(await tx`SELECT 1 FROM membros WHERE nome = 'intruso'`).toHaveLength(0)
    })
  })

  it('admin de UMA empresa (sem ser da conta), o financeiro e o vendedor não têm consolidado', async () => {
    const d = await novoDono(app)
    const adminSo = await usuarioSimples(app)
    await vincular(d.tenantId, adminSo.id, 'admin')
    await ligar2fa(adminSo.id)
    const financeiro = await usuarioSimples(app)
    await dono`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${d.contaId}, ${financeiro.id}, 'financeiro')`
    const vendedor = await usuarioSimples(app)
    await vincular(d.tenantId, vendedor.id, 'vendedor')
    for (const u of [adminSo, financeiro, vendedor]) {
      const r = await get('/v1/teste-acesso/consolidado', u.cookie)
      expect(r.status).toBe(403)
      expect(erroDe(r).erro).toBe('consolidado_negado')
    }
  })

  it('um administrador de conta vê só a SUA conta, não a de outro dono', async () => {
    const um = await novoDono(app)
    const dois = await novoDono(app)
    const r = await get('/v1/teste-acesso/consolidado', um.cookie)
    expect((r.body as { tenants: string[] }).tenants).toEqual([um.tenantId])
    expect((r.body as { tenants: string[] }).tenants).not.toContain(dois.tenantId)
  })
})
