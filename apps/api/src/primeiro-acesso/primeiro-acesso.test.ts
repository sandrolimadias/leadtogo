import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import type { PrimeiroAcessoResultado } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { carregarConfiguracao, primeiroAcessoAberto } from '../configuracao/configuracao.js'
import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { PREFIXO_LIMITE } from '../rate-limit/limite.guard.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import {
  bancoDeTeste,
  cnpjUnico,
  emailUnico,
  entrar,
  limparLimitesAuth,
  ORIGEM_DO_FRONT,
} from '../testes/auth-teste.js'
import { aguardarMensagem, limparCaixa } from '../testes/mailpit.js'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const owner = bancoDeTeste()
const { cliente: app_ } = criarConexao(process.env['TEST_API_DATABASE_URL'] ?? '', { max: 2 })
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
// O e-mail só sai quando o worker age (relay do outbox e fila de e-mail): sobe um de verdade
const workerDeTeste = await subirWorkerDeTeste()
afterAll(async () => {
  await workerDeTeste.parar()
  await owner.end()
  await app_.end()
  await valkey.quit()
})

let app: INestApplication<Server> | undefined
async function subir(troca: Record<string, string> = {}) {
  app = await criarApp(configuracaoDeTeste(troca))
  await app.init()
  return app
}
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  const chaves = await valkey.keys(`${PREFIXO_LIMITE}*`)
  if (chaves.length > 0) await valkey.del(...chaves)
  await limparCaixa()
})
afterEach(async () => {
  await app?.close()
  app = undefined
})

let n = 0
function dadosValidos(extra: Record<string, unknown> = {}) {
  n += 1
  return {
    nome: '  Ana Souza ',
    email: emailUnico('Dono').toUpperCase(),
    senha: 'senha-forte-123',
    empresa: { razaoSocial: `Empresa Exemplo ${Date.now()}-${n} Ltda`, nomeFantasia: 'Exemplo' },
    ...extra,
  }
}
const post = (a: INestApplication<Server>, corpo: unknown) =>
  request(a.getHttpServer())
    .post('/v1/primeiro-acesso')
    .send(corpo as object)
const erroDe = (r: request.Response) => r.body as RespostaDeErro
const contar = async (tabela: string) =>
  (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM ${owner(tabela)}`)[0]?.n ?? 0

describe('POST /v1/primeiro-acesso', () => {
  it('a empresa do primeiro acesso já nasce com os cadastros padrão', async () => {
    const a = await subir()
    const r = await post(a, dadosValidos())
    expect(r.status).toBe(201)
    const { tenantId } = r.body as PrimeiroAcessoResultado
    const lido = await app_.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return {
        status: await tx`SELECT nome FROM tags WHERE chave_sistema = 'cliente'`,
        tipos: await tx`SELECT 1 FROM tipos_atividade`,
        funis: await tx<{ nome: string }[]>`SELECT nome FROM funis WHERE padrao`,
      }
    })
    expect(lido.status).toHaveLength(1)
    expect(lido.tipos).toHaveLength(6)
    expect(lido.funis.map((f) => f.nome)).toEqual(['Vendas'])
  })

  it('cria usuário, conta dona, vínculo dono, empresa, configurações e membro admin', async () => {
    const a = await subir()
    const cnpj = cnpjUnico()
    const dados = dadosValidos({
      empresa: {
        razaoSocial: 'Empresa Teste Ltda',
        nomeFantasia: 'Teste',
        cnpj: cnpj.toLowerCase(),
      },
    })
    const r = await post(a, dados)
    expect(r.status).toBe(201)
    const res = r.body as PrimeiroAcessoResultado
    for (const id of [res.usuarioId, res.contaId, res.tenantId, res.membroId])
      expect(id).toMatch(UUID_V7)
    expect(res.verificacaoEmailPendente).toBe(false)

    const email = dados.email.toLowerCase()
    const [u] = await owner<{ name: string; email: string; email_verified: boolean }[]>`
      SELECT name, email, email_verified FROM auth."user" WHERE id = ${res.usuarioId}`
    expect(u).toEqual({ name: 'Ana Souza', email, email_verified: true })
    const [conta] = await owner<
      { password: string }[]
    >`SELECT password FROM auth.account WHERE user_id = ${res.usuarioId} AND provider_id = 'credential'`
    expect(conta?.password).not.toContain('senha-forte-123')

    const [c] = await owner`SELECT nome FROM contas WHERE id = ${res.contaId}`
    expect(c?.['nome']).toBe('Empresa Teste Ltda') // sem contaNome, usa a razão social
    const [vinculo] =
      await owner`SELECT papel FROM conta_administradores WHERE conta_id = ${res.contaId} AND usuario_id = ${res.usuarioId}`
    expect(vinculo?.['papel']).toBe('dono')

    // tenants, configurações e membros têm RLS: leitura com o tenant ativo, como o app faz
    const lido = await app_.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${res.tenantId}, true)`
      return {
        tenant: (
          await tx`SELECT razao_social, nome_fantasia, cnpj, conta_id, situacao FROM tenants`
        )[0],
        config: (
          await tx`SELECT dias_sem_contato_alerta, vendedor_ve_todas_empresas FROM tenant_configuracoes`
        )[0],
        membros: await tx`SELECT id, nome, email, papel, usuario_id FROM membros`,
      }
    })
    expect(lido.tenant).toMatchObject({
      razao_social: 'Empresa Teste Ltda',
      nome_fantasia: 'Teste',
      cnpj,
      conta_id: res.contaId,
    })
    expect(lido.config).toEqual({ dias_sem_contato_alerta: 60, vendedor_ve_todas_empresas: false })
    expect(lido.membros).toEqual([
      { id: res.membroId, nome: 'Ana Souza', email, papel: 'admin', usuario_id: res.usuarioId },
    ])
  })

  it('o administrador entra com o e-mail e a senha informados (sessão sem empresa ativa ainda)', async () => {
    const a = await subir()
    const dados = dadosValidos()
    const r = await post(a, dados)
    expect(r.status).toBe(201)
    const login = await entrar(a, dados.email.toLowerCase(), dados.senha)
    expect(login.status).toBe(200)
    const sessao = await request(a.getHttpServer())
      .get('/v1/auth/get-session')
      .set('Cookie', login.cookie)
    expect(sessao.body).toMatchObject({
      user: { id: (r.body as PrimeiroAcessoResultado).usuarioId },
    })
  })

  it('e-mail repetido: 409 e nada novo é criado', async () => {
    const a = await subir()
    const dados = dadosValidos()
    await post(a, dados).expect(201)
    const antes = [await contar('contas'), await contar('conta_administradores')]
    const r = await post(a, { ...dados, empresa: { razaoSocial: 'Outra Empresa' } })
    expect(r.status).toBe(409)
    expect(erroDe(r).erro).toBe('email_ja_cadastrado')
    expect([await contar('contas'), await contar('conta_administradores')]).toEqual(antes)
  })

  it('CNPJ já usado por outra conta: o cadastro segue normal (não revela que a outra conta existe)', async () => {
    const a = await subir()
    const cnpj = cnpjUnico()
    const outroTenant = '01a11111-1111-7111-8111-111111111111'
    const outraConta = '01a11111-1111-7111-8111-111111111112'
    await owner`INSERT INTO contas (id, nome) VALUES (${outraConta}, 'Outra conta') ON CONFLICT DO NOTHING`
    await owner.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${outroTenant}, true)`
      await tx`INSERT INTO tenants (id, razao_social, conta_id, cnpj) VALUES (${outroTenant}, 'Dona do CNPJ', ${outraConta}, ${cnpj}) ON CONFLICT DO NOTHING`
    })
    const dados = dadosValidos({ empresa: { razaoSocial: 'Empresa Cópia', cnpj } })
    const r = await post(a, dados)
    expect(r.status).toBe(201)
    const doNovo = (r.body as { tenantId: string }).tenantId
    const linhas = await owner.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_ids', ${`{${doNovo},${outroTenant}}`}, true)`
      return tx`SELECT id FROM tenants WHERE cnpj = ${cnpj}`
    })
    expect(linhas).toHaveLength(2) // as duas empresas coexistem, cada uma na sua conta
  })

  it('valida a entrada: 400 com os campos, e recusa campos que o cliente não pode mandar', async () => {
    const a = await subir()
    const r = await post(a, {
      nome: 'A',
      email: 'xxx',
      senha: 'curta',
      empresa: { razaoSocial: '', cnpj: '11222333000182' },
    })
    expect(r.status).toBe(400)
    expect(erroDe(r).erro).toBe('validacao_invalida')
    expect((erroDe(r).detalhes ?? []).map((d) => d.campo).sort()).toEqual([
      'email',
      'empresa.cnpj',
      'empresa.razaoSocial',
      'nome',
      'senha',
    ])
    expect(JSON.stringify(r.body)).not.toContain('curta') // a senha digitada não volta na resposta

    for (const extra of [
      { papel: 'admin' },
      { tenantId: '01a11111-1111-7111-8111-111111111111' },
      { contaId: 'x' },
    ]) {
      expect((await post(a, dadosValidos(extra))).status).toBe(400)
    }
  })

  it('fechado (PRIMEIRO_ACESSO=fechado): 403 e nada é criado', async () => {
    const a = await subir({ PRIMEIRO_ACESSO: 'fechado' })
    const antes = await contar('contas')
    const r = await post(a, dadosValidos())
    expect(r.status).toBe(403)
    expect(erroDe(r).erro).toBe('primeiro_acesso_fechado')
    expect(await contar('contas')).toBe(antes)
  })

  it('o padrão é aberto fora de produção e FECHADO em produção; a flag manda', () => {
    const base = {
      APP_URL: 'http://localhost:5173',
      API_URL: 'http://localhost:3000',
      DATABASE_URL: 'postgres://leadtogo_app:senha@localhost:5432/leadtogo',
      REDIS_URL: 'redis://localhost:6379',
      BETTER_AUTH_SECRET: 'um-segredo-de-teste-com-mais-de-32-caracteres',
      S3_ENDPOINT: 'http://localhost:3900',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY: 'a',
      S3_SECRET_KEY: 's',
      VERIFICACAO_EMAIL: 'false',
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    }
    const producao = {
      ...base,
      NODE_ENV: 'production',
      APP_URL: 'https://crm.aledias.com.br',
      API_URL: 'https://api.crm.aledias.com.br',
    }
    expect(primeiroAcessoAberto(carregarConfiguracao(base))).toBe(true)
    expect(primeiroAcessoAberto(carregarConfiguracao(producao))).toBe(false)
    expect(
      primeiroAcessoAberto(carregarConfiguracao({ ...producao, PRIMEIRO_ACESSO: 'aberto' })),
    ).toBe(true)
    expect(
      primeiroAcessoAberto(carregarConfiguracao({ ...base, PRIMEIRO_ACESSO: 'fechado' })),
    ).toBe(false)
  })

  it('com a verificação de e-mail ligada: o e-mail de confirmação sai e o login só vale depois', async () => {
    const a = await subir({ VERIFICACAO_EMAIL: 'true' })
    const dados = dadosValidos()
    const r = await post(a, dados)
    expect(r.status).toBe(201)
    expect((r.body as PrimeiroAcessoResultado).verificacaoEmailPendente).toBe(true)
    const email = dados.email.toLowerCase()
    const mensagem = await aguardarMensagem(email)
    expect(mensagem.Subject).toBe('Confirme seu e-mail no Leadtogo')
    expect((await entrar(a, email, dados.senha)).status).toBe(403)
    const link = new URL(/https?:\/\/[^\s"<>]+/.exec(mensagem.Text)?.[0] ?? '')
    const clique = await request(a.getHttpServer())
      .get(`${link.pathname}${link.search}`)
      .redirects(0)
    // o link leva à tela do front que mostra "E-mail confirmado"
    expect(clique.headers['location']).toBe(`${ORIGEM_DO_FRONT}/verificar-email?confirmado=1`)
    expect((await entrar(a, email, dados.senha)).status).toBe(200)
  })

  it('limita por IP (5 por hora): a 6ª tentativa recebe 429', async () => {
    const a = await subir({ TRUST_PROXY: '0' })
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await post(a, { invalido: true })).status)
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400])
    expect(statuses[5]).toBe(429)
  })

  it('sem o Valkey, recusa (503) em vez de ficar sem limite', async () => {
    const a = await subir({ REDIS_URL: 'redis://localhost:1' })
    const r = await post(a, dadosValidos())
    expect(r.status).toBe(503)
    expect(erroDe(r).erro).toBe('servico_indisponivel')
  }, 15_000)

  it('só aceita o cadastro do front ou de cliente sem Origin; escrita de outro site cai no CORS do navegador', async () => {
    const a = await subir()
    const r = await request(a.getHttpServer())
      .options('/v1/primeiro-acesso')
      .set('Origin', 'https://malicioso.example')
      .set('Access-Control-Request-Method', 'POST')
    expect(r.headers['access-control-allow-origin']).toBeUndefined()
    const ok = await request(a.getHttpServer())
      .options('/v1/primeiro-acesso')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Access-Control-Request-Method', 'POST')
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGEM_DO_FRONT)
  })
})
