/* eslint-disable @typescript-eslint/no-unsafe-member-access -- os corpos JSON do supertest chegam como any */
import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import { Controller, Get, Post, type INestApplication } from '@nestjs/common'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Permissao } from '../acesso/acesso.decorators.js'
import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { auditoriaDe, ligar2fa, mudarSituacao } from '../testes/mundo.js'
import { processadorDeManutencao } from '../worker/manutencao.js'
import { ApiPublica } from './chave.decorators.js'
import { hashDoTokenDaChave } from './token-chave.js'

/** Rotas de teste da API pública: quem sou eu (empresas.ver) e uma escrita auditada (empresas.editar). */
@ApiPublica()
@Controller('publica/teste-chave')
class TesteDaChaveController {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Permissao('empresas.ver')
  @Get()
  eu() {
    return {
      tenantId: this.ctx.tenantId,
      membroId: this.ctx.membro.id,
      chave: this.ctx.chaveApi,
      permissoes: this.ctx.membro.permissoes,
    }
  }

  @Permissao('empresas.editar')
  @Post()
  async escrever() {
    await this.auditoria.registrar({ entidade: 'teste', acao: 'escrita_pela_chave' })
    return { ok: true }
  }
}

let app: INestApplication<Server>
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 2 })
const crm = chamarEm(() => app)

beforeAll(async () => {
  app = await criarAppComRotas([TesteDaChaveController], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterAll(async () => {
  await app.close()
  await banco.cliente.end({ timeout: 5 })
})

let ip = 0
const comChave = (
  metodo: 'get' | 'post',
  token: string | null,
  url = '/v1/publica/teste-chave',
) => {
  ip += 1
  const r = request(app.getHttpServer())
    [metodo](url)
    .set('X-Forwarded-For', `10.77.${Math.floor(ip / 250)}.${ip % 250}`)
  return token === null ? r : r.set('Authorization', `Bearer ${token}`)
}

async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  const novaChave = async (corpo: Record<string, unknown> = {}) => {
    const r = await crm('post', d.cookie, '/integracoes/chaves', {
      nome: 'n8n — Omie',
      permissoes: ['empresas.ver', 'empresas.editar'],
      ...corpo,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    return r.body as { chave: { id: string; prefixo: string; situacao: string }; token: string }
  }
  return { d, pessoa, novaChave }
}

describe('chaves de API: gestão', () => {
  it('cria a chave: o token aparece uma vez, no banco só o hash, e nasce o membro de integração', async () => {
    const { d, novaChave } = await cenario()
    const { chave, token } = await novaChave()
    expect(token).toMatch(/^ltg_test_[0-9A-Za-z]{43}$/)
    expect(chave.prefixo).toBe(`ltg_test_${token.slice(9, 17)}`)
    expect(chave.situacao).toBe('ativa')

    const [linha] = await noTenant(
      d.tenantId,
      (tx) => tx<{ hash: string; membro_id: string }[]>`
      SELECT hash, membro_id FROM api_chaves WHERE id = ${chave.id}`,
    )
    expect(linha?.hash).toBe(hashDoTokenDaChave(token))
    const [membro] = await noTenant(
      d.tenantId,
      (tx) => tx<{ nome: string; tipo: string; ativo: boolean; usuario_id: string | null }[]>`
      SELECT nome, tipo, ativo, usuario_id FROM membros WHERE id = ${linha?.membro_id ?? ''}`,
    )
    expect(membro).toEqual({
      nome: 'Integração: n8n — Omie',
      tipo: 'integracao',
      ativo: false,
      usuario_id: null,
    })

    const lista = await crm('get', d.cookie, '/integracoes/chaves')
    expect(lista.status).toBe(200)
    expect(JSON.stringify(lista.body)).not.toContain(token)
    expect(lista.body.itens[0].id).toBe(chave.id)

    // O membro de integração não aparece na equipe, nem com os inativos
    const equipe = await crm('get', d.cookie, '/membros?incluirInativos=true')
    expect(equipe.status).toBe(200)
    expect(JSON.stringify(equipe.body)).not.toContain('Integração: n8n')

    const auditoria = await auditoriaDe(d.tenantId)
    const criada = auditoria.find((a) => a.entidade === 'api_chave' && a.acao === 'criada')
    expect(criada?.origem).toBe('app')
    expect(JSON.stringify(auditoria)).not.toContain(token)
  })

  it('exige integracoes.gerir e o 2FA de quem cria; recusa permissão não liberada', async () => {
    const { d, pessoa } = await cenario()
    const semPermissao = await pessoa('Sem integrações', { 'empresas.ver': 'todas' })
    expect((await crm('get', semPermissao.cookie, '/integracoes/chaves')).status).toBe(403)

    const gestor = await pessoa('Gestor de integrações', { 'integracoes.gerir': null })
    const sem2fa = await crm('post', gestor.cookie, '/integracoes/chaves', {
      nome: 'x',
      permissoes: ['empresas.ver'],
    })
    expect(sem2fa.status).toBe(403)
    expect(sem2fa.body.erro).toBe('2fa_obrigatorio')
    await ligar2fa(gestor.usuarioId)
    const ok = await crm('post', gestor.cookie, '/integracoes/chaves', {
      nome: 'x',
      permissoes: ['empresas.ver'],
    })
    expect(ok.status).toBe(201)

    const proibida = await crm('post', d.cookie, '/integracoes/chaves', {
      nome: 'x',
      permissoes: ['perfis.gerir'],
    })
    expect(proibida.status).toBe(400)
    const ipRuim = await crm('post', d.cookie, '/integracoes/chaves', {
      nome: 'x',
      permissoes: ['empresas.ver'],
      ipsPermitidos: ['999.1.1.1'],
    })
    expect(ipRuim.status).toBe(400)
  })
})

describe('chaves de API: autenticação na API pública', () => {
  it('a chave entra com as permissões dela (alcance todas) e o membro de integração', async () => {
    const { d, novaChave } = await cenario()
    const { chave, token } = await novaChave()
    const r = await comChave('get', token)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.tenantId).toBe(d.tenantId)
    expect(r.body.chave).toEqual({ id: chave.id, nome: 'n8n — Omie', responsavelPadraoId: null })
    expect(r.body.permissoes).toEqual({ 'empresas.ver': 'todas', 'empresas.editar': 'todas' })
    expect(r.headers['x-ratelimit-limit']).toBe('120')

    // A escrita pela chave sai na auditoria como integração, assinada pelo membro de integração
    expect((await comChave('post', token)).status).toBe(201)
    const registro = (await auditoriaDe(d.tenantId)).find((a) => a.acao === 'escrita_pela_chave')
    expect(registro?.origem).toBe('integracao')
    expect(registro?.membro_id).toBe(r.body.membroId)

    // O último uso foi gravado
    const [uso] = await noTenant(
      d.tenantId,
      (tx) => tx<{ ultimo_uso_em: Date | null }[]>`
      SELECT ultimo_uso_em FROM api_chaves WHERE id = ${chave.id}`,
    )
    expect(uso?.ultimo_uso_em).not.toBeNull()
  })

  it('sem chave, mal formada, inexistente ou de outro ambiente: 401 com a mesma mensagem', async () => {
    const respostas = await Promise.all([
      comChave('get', null),
      comChave('get', 'abc'),
      comChave('get', `ltg_test_${'A'.repeat(43)}`),
      comChave('get', `ltg_live_${'A'.repeat(43)}`),
    ])
    for (const r of respostas) {
      expect(r.status).toBe(401)
      expect(r.body.erro).toBe('chave_invalida')
    }
    expect(new Set(respostas.map((r) => (r.body as { mensagem: string }).mensagem)).size).toBe(1)
  })

  it('escopo faltando: 403 escopo_insuficiente com a permissão exigida', async () => {
    const { novaChave } = await cenario()
    const { token } = await novaChave({ permissoes: ['empresas.ver'] })
    const r = await comChave('post', token)
    expect(r.status).toBe(403)
    expect(r.body.erro).toBe('escopo_insuficiente')
    expect(r.body.dados).toEqual({ permissoes: ['empresas.editar'] })
  })

  it('revogada, vencida ou de IP fora da lista: 401; empresa suspensa: 403', async () => {
    const { d, novaChave } = await cenario()
    const a = await novaChave()
    expect((await crm('post', d.cookie, `/integracoes/chaves/${a.chave.id}/revogar`)).status).toBe(
      200,
    )
    expect((await comChave('get', a.token)).status).toBe(401)
    // Revogada não muda mais
    expect(
      (await crm('patch', d.cookie, `/integracoes/chaves/${a.chave.id}`, { nome: 'y' })).status,
    ).toBe(409)

    const b = await novaChave()
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE api_chaves SET expira_em = now() - interval '1 minute' WHERE id = ${b.chave.id}`,
    )
    expect((await comChave('get', b.token)).status).toBe(401)

    const c = await novaChave({ ipsPermitidos: ['200.200.200.0/24'] })
    expect((await comChave('get', c.token)).status).toBe(401)
    const r = await crm('patch', d.cookie, `/integracoes/chaves/${c.chave.id}`, {
      ipsPermitidos: ['10.77.0.0/16'],
    })
    expect(r.status).toBe(200)
    expect((await comChave('get', c.token)).status).toBe(200)

    await mudarSituacao(d.tenantId, 'suspenso')
    const suspensa = await comChave('get', c.token)
    expect(suspensa.status).toBe(403)
    expect(suspensa.body.erro).toBe('empresa_indisponivel')
    await mudarSituacao(d.tenantId, 'ativo')
  })

  it('isolamento: a chave só vê a própria empresa; a sessão do app não entra na API pública', async () => {
    const um = await cenario()
    const outro = await cenario()
    const { token } = await um.novaChave()
    const r = await comChave('get', token)
    expect(r.body.tenantId).toBe(um.d.tenantId)
    // A outra empresa não enxerga a chave
    const lista = await crm('get', outro.d.cookie, '/integracoes/chaves')
    expect(lista.body.itens).toEqual([])
    // A chave não alcança a chave de outra empresa nem por id
    const [linha] = await noTenant(
      um.d.tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM api_chaves LIMIT 1`,
    )
    expect(
      (await crm('post', outro.d.cookie, `/integracoes/chaves/${linha?.id ?? ''}/revogar`)).status,
    ).toBe(404)
    // A sessão (cookie) não vale na rota pública, e a chave não vale na rota interna
    const sessao = await request(app.getHttpServer())
      .get('/v1/publica/teste-chave')
      .set('Cookie', um.d.cookie)
    expect(sessao.status).toBe(401)
    const interna = await request(app.getHttpServer())
      .get('/v1/integracoes/chaves')
      .set('Authorization', `Bearer ${token}`)
    expect(interna.status).toBe(401)
  })

  it('rotação: a nova vale na hora; a antiga vale até o prazo (0 = revogada agora)', async () => {
    const { d, novaChave } = await cenario()
    const a = await novaChave()
    const r = await crm('post', d.cookie, `/integracoes/chaves/${a.chave.id}/rotacionar`, {
      prazoDias: 2,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const nova = r.body as { chave: { id: string }; token: string }
    expect(nova.token).not.toBe(a.token)
    expect((await comChave('get', nova.token)).status).toBe(200)
    expect((await comChave('get', a.token)).status).toBe(200)
    const lista = (await crm('get', d.cookie, '/integracoes/chaves')).body as {
      itens: { id: string; situacao: string; substituidaPor: string | null }[]
    }
    const antiga = lista.itens.find((c) => c.id === a.chave.id)
    expect(antiga?.situacao).toBe('substituida')
    expect(antiga?.substituidaPor).toBe(nova.chave.id)
    // A mesma chave não rotaciona duas vezes
    expect(
      (
        await crm('post', d.cookie, `/integracoes/chaves/${a.chave.id}/rotacionar`, {
          prazoDias: 1,
        })
      ).status,
    ).toBe(409)

    // As duas assinam pelo mesmo membro de integração
    const ids = await noTenant(
      d.tenantId,
      (tx) => tx<{ membro_id: string }[]>`
      SELECT DISTINCT membro_id FROM api_chaves WHERE id IN (${a.chave.id}, ${nova.chave.id})`,
    )
    expect(ids).toHaveLength(1)

    const b = await novaChave()
    const r0 = await crm('post', d.cookie, `/integracoes/chaves/${b.chave.id}/rotacionar`, {
      prazoDias: 0,
    })
    expect(r0.status).toBe(201)
    expect((await comChave('get', b.token)).status).toBe(401)
  })
})

describe('chaves de API: aviso de vencimento', () => {
  it('avisa quem tem integracoes.gerir 15 dias antes e no último dia, uma vez cada', async () => {
    const { d, novaChave } = await cenario()
    const { chave } = await novaChave({
      expiraEm: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    })
    const rodar = () =>
      processadorDeManutencao(
        banco,
        pino({ level: 'silent' }),
      )({
        name: 'avisar-chaves',
      } as Parameters<ReturnType<typeof processadorDeManutencao>>[0])
    const contar = async () => {
      const [n] = await noTenant(
        d.tenantId,
        (tx) => tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notificacoes WHERE tipo = 'integracao.chave_vencendo'`,
      )
      return n?.n ?? 0
    }
    await rodar()
    expect(await contar()).toBe(1)
    await rodar()
    expect(await contar()).toBe(1)
    // Último dia (o primeiro aviso foi há 14 dias): avisa de novo, uma vez
    await noTenant(
      d.tenantId,
      (tx) => tx`
      UPDATE api_chaves SET expira_em = now() + interval '12 hours', aviso_vencimento_em = now() - interval '14 days'
      WHERE id = ${chave.id}`,
    )
    await rodar()
    await rodar()
    expect(await contar()).toBe(2)
  })
})
