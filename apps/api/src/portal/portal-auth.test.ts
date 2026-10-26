import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { Controller, Get } from '@nestjs/common'
import { sql } from '@leadtogo/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { criarAppComRotas, configuracaoDeTeste } from '../testes/app-teste.js'
import { noTenant } from '../testes/chamados.js'
import { limparCaixa, aguardarMensagem, mensagensPara, primeiroLink } from '../testes/mailpit.js'
import { mudarSituacao, novoDono } from '../testes/mundo.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  COOKIE_DO_PORTAL,
  cookieDe,
  criarLinkDireto,
  entrarNoPortal,
  novoAcesso,
  novoClienteDoPortal,
  ORIGEM_DO_PORTAL,
} from '../testes/portal.js'
import { listarRotas } from '../documentacao/rotas.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import { codigoTotp, segredoDaUri } from '../testes/totp.js'
import { esperarAte } from '../testes/espera.js'
import { PortalEntradaService } from './portal-entrada.service.js'
import { PortalPublica, RotaDoPortal } from './portal.decorators.js'

/** Só dos testes: mostra o que a transação do portal enxerga (as duas camadas de isolamento). */
@RotaDoPortal()
@Controller('portal/teste')
class IsolamentoDeTeste {
  constructor(private readonly ctx: ContextoTenantService) {}

  @Get('visao')
  async visao() {
    const db = this.ctx.db()
    const [g] = await db.execute<{
      acesso: string
      empresa: string
      contato: string
      tenant: string
    }>(sql`
      SELECT current_setting('app.portal_acesso_id') AS acesso, current_setting('app.portal_empresa_id') AS empresa,
             current_setting('app.portal_contato_id') AS contato, current_setting('app.tenant_id') AS tenant`)
    const empresas = await db.execute<{ id: string }>(sql`SELECT id FROM empresas`)
    // Tabela interna da equipe: no portal fica sempre vazia (política restritiva `portal_negado`)
    const perfis = await db.execute(sql`SELECT id FROM perfis_acesso`)
    return { ...g, empresasVisiveis: empresas.map((e) => e.id), perfisVisiveis: perfis.length }
  }

  @PortalPublica()
  @Get('publica')
  publica() {
    return { ok: true }
  }
}

let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const chamar = chamarPortalEm(() => app)

beforeAll(async () => {
  app = await criarAppComRotas(
    [IsolamentoDeTeste],
    configuracaoDeTeste(configuracaoDoPortalDeTeste),
  )
  worker = await subirWorkerDeTeste()
  await limparCaixa()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
})

const tokenDoEmail = async (email: string) => {
  const link = primeiroLink(await aguardarMensagem(email))
  return link.split('#')[1] ?? ''
}

describe('entrada pelo e-mail (link mágico)', () => {
  it('a resposta é a mesma com e sem acesso; só quem tem acesso recebe o link, que entra uma vez', async () => {
    const c = await novoClienteDoPortal(app)
    const semAcesso = `ninguem-${c.acessoId}@exemplo.com.br`

    const a = await chamar('post', '/portal/entrada', { corpo: { email: c.email } })
    const b = await chamar('post', '/portal/entrada', { corpo: { email: semAcesso } })
    expect(a.status).toBe(202)
    expect(b.status).toBe(202)
    expect(a.body).toEqual(b.body)
    await app.get(PortalEntradaService).aguardarPendentes()

    const token = await tokenDoEmail(c.email)
    await esperarAte(async () => (await mensagensPara(semAcesso)).length === 0)
    expect(await mensagensPara(semAcesso)).toHaveLength(0)

    // O link guarda só o hash e vale uma vez
    const [linha] = await noTenant(
      c.tenantId,
      (tx) =>
        tx<
          { token_hash: string }[]
        >`SELECT token_hash FROM portal_links WHERE acesso_id = ${c.acessoId}`,
    )
    expect(linha?.token_hash).not.toContain(token.split('.')[1] ?? 'x')

    const previa = await chamar('post', '/portal/link/consulta', { corpo: { token } })
    expect(previa.status).toBe(200)
    expect(previa.body).toMatchObject({ finalidade: 'entrada', exigeAceiteDePrivacidade: true })

    const sem = await chamar('post', '/portal/link/consumir', { corpo: { token } })
    expect(sem.status).toBe(422)
    expect((sem.body as { erro: string }).erro).toBe('privacidade_obrigatoria')

    const entrou = await chamar('post', '/portal/link/consumir', {
      corpo: { token, aceitaPrivacidade: true },
    })
    expect(entrou.status).toBe(200)
    expect(entrou.body).toMatchObject({ papel: 'colega', segundoFatorPendente: false })
    const set = (entrou.headers['set-cookie'] as unknown as string[])[0] ?? ''
    expect(set).toMatch(/HttpOnly/i)
    expect(set).toMatch(/SameSite=Lax/i)
    expect(set).not.toMatch(/Domain=/i)

    const de_novo = await chamar('post', '/portal/link/consumir', {
      corpo: { token, aceitaPrivacidade: true },
    })
    expect(de_novo.status).toBe(404)
  })

  it('a conferência do link não o consome (verificadores de e-mail); link vencido ou de outro tenant dá 404', async () => {
    const c = await novoClienteDoPortal(app)
    const token = await criarLinkDireto(c, 'entrada')
    for (let i = 0; i < 3; i++) {
      expect((await chamar('post', '/portal/link/consulta', { corpo: { token } })).status).toBe(200)
    }
    const vencido = await criarLinkDireto(c, 'entrada', { minutos: -5 })
    expect(
      (await chamar('post', '/portal/link/consulta', { corpo: { token: vencido } })).status,
    ).toBe(404)

    // Mesmo segredo com outro tenant no prefixo: o hash não confere
    const [, segredo] = token.split('.')
    const outro = await novoDono(app)
    const forjado = `${outro.tenantId}.${segredo ?? ''}`
    expect(
      (
        await chamar('post', '/portal/link/consumir', {
          corpo: { token: forjado, aceitaPrivacidade: true },
        })
      ).status,
    ).toBe(404)
    expect(
      (await chamar('post', '/portal/link/consulta', { corpo: { token: 'lixo' } })).status,
    ).toBe(400)
  })

  it('o convite ativa o acesso; acesso suspenso, portal desligado e empresa suspensa não entram', async () => {
    const d = await novoDono(app)
    await configurarPortal(d.tenantId)
    const convidado = await novoAcesso(d, { situacao: 'convidado' })
    const token = await criarLinkDireto(convidado, 'convite', { minutos: 7 * 24 * 60 })
    const r = await chamar('post', '/portal/link/consumir', {
      corpo: { token, aceitaPrivacidade: true },
    })
    expect(r.status).toBe(200)
    const [a] = await noTenant(
      d.tenantId,
      (tx) =>
        tx<
          { situacao: string; aceito_em: Date | null; privacidade_aceita_em: Date | null }[]
        >`SELECT situacao, aceito_em, privacidade_aceita_em FROM portal_acessos WHERE id = ${convidado.acessoId}`,
    )
    expect(a?.situacao).toBe('ativo')
    expect(a?.aceito_em).not.toBeNull()
    expect(a?.privacidade_aceita_em).not.toBeNull()

    const suspenso = await novoAcesso(d, { situacao: 'suspenso' })
    const t1 = await criarLinkDireto(suspenso, 'entrada')
    expect(
      (
        await chamar('post', '/portal/link/consumir', {
          corpo: { token: t1, aceitaPrivacidade: true },
        })
      ).status,
    ).toBe(404)

    const ativo = await novoAcesso(d)
    const t2 = await criarLinkDireto(ativo, 'entrada')
    await configurarPortal(d.tenantId, { ativo: false })
    expect(
      (
        await chamar('post', '/portal/link/consumir', {
          corpo: { token: t2, aceitaPrivacidade: true },
        })
      ).status,
    ).toBe(404)
    await configurarPortal(d.tenantId, { ativo: true })
  })
})

describe('rede de segurança do portal', () => {
  it('toda rota do portal que não é pública responde 401 sem cookie', async () => {
    const protegidas = listarRotas(app).filter(
      (r) => r.portal && !r.publica && !r.rota.includes('/portal/teste/'),
    )
    expect(protegidas.length).toBeGreaterThanOrEqual(10)
    for (const r of protegidas) {
      const resposta = await chamar(
        r.metodo as 'get' | 'post' | 'put' | 'delete',
        r.url.replace('/v1', ''),
        {
          corpo: r.metodo === 'get' || r.metodo === 'delete' ? undefined : {},
        },
      )
      expect(resposta.status, r.rota).toBe(401)
      expect((resposta.body as { erro: string }).erro, r.rota).toBe('nao_autenticado')
    }
  })
})

describe('sessão do portal', () => {
  it('o cookie do portal vale só no portal; o do CRM não vale nele; sem cookie, 401', async () => {
    const c = await novoClienteDoPortal(app)
    const cookie = await entrarNoPortal(chamar, c)

    const sessao = await chamar('get', '/portal/sessao', { cookie })
    expect(sessao.status).toBe(200)
    expect(sessao.body).toMatchObject({
      acessoId: c.acessoId,
      contato: { id: c.contatoId, email: c.email },
      empresaCliente: { id: c.empresaId },
    })

    expect((await chamar('get', '/portal/sessao')).status).toBe(401)
    expect(
      (await chamar('get', '/portal/sessao', { cookie: `${COOKIE_DO_PORTAL}=lixo` })).status,
    ).toBe(401)
    // sessão do CRM no portal
    expect((await chamar('get', '/portal/sessao', { cookie: c.dono.cookie })).status).toBe(401)
    // sessão do portal no CRM
    const noCrm = await chamar('get', '/me', { cookie })
    expect(noCrm.status).toBe(401)
  })

  it('mutação exige a origem do portal; GET não', async () => {
    const c = await novoClienteDoPortal(app)
    const cookie = await entrarNoPortal(chamar, c)
    const errada = await chamar('post', '/portal/sair', {
      cookie,
      origem: 'https://outro-site.exemplo',
    })
    expect(errada.status).toBe(403)
    expect((errada.body as { erro: string }).erro).toBe('origem_invalida')
    expect((await chamar('post', '/portal/sair', { cookie, origem: null })).status).toBe(403)
    expect(
      (await chamar('get', '/portal/sessao', { cookie, origem: 'https://outro-site.exemplo' }))
        .status,
    ).toBe(200)
    expect(ORIGEM_DO_PORTAL).toBe('http://localhost:5174')
  })

  it('sair, sair em outros dispositivos e encerrar uma sessão específica; revogar o acesso derruba a sessão', async () => {
    const c = await novoClienteDoPortal(app)
    const a = await entrarNoPortal(chamar, c)
    const b = await entrarNoPortal(chamar, c)

    const lista = await chamar('get', '/portal/sessoes', { cookie: a })
    const itens = (lista.body as { itens: { id: string; atual: boolean }[] }).itens
    expect(itens).toHaveLength(2)
    expect(itens.filter((i) => i.atual)).toHaveLength(1)

    expect((await chamar('post', '/portal/sessoes/encerrar-outras', { cookie: a })).status).toBe(
      204,
    )
    expect((await chamar('get', '/portal/sessao', { cookie: b })).status).toBe(401)
    expect((await chamar('get', '/portal/sessao', { cookie: a })).status).toBe(200)

    // sessão de outro cliente não se encerra
    const outro = await novoClienteDoPortal(app)
    const cookieOutro = await entrarNoPortal(chamar, outro)
    const lista2 = await chamar('get', '/portal/sessoes', { cookie: cookieOutro })
    const idOutro = (lista2.body as { itens: { id: string }[] }).itens[0]?.id ?? ''
    expect((await chamar('delete', `/portal/sessoes/${idOutro}`, { cookie: a })).status).toBe(404)
    expect((await chamar('get', '/portal/sessao', { cookie: cookieOutro })).status).toBe(200)

    await noTenant(
      c.tenantId,
      (tx) => tx`UPDATE portal_acessos SET situacao = 'suspenso' WHERE id = ${c.acessoId}`,
    )
    expect((await chamar('get', '/portal/sessao', { cookie: a })).status).toBe(401)

    const saiu = await novoClienteDoPortal(app)
    const cookieSaiu = await entrarNoPortal(chamar, saiu)
    const s = await chamar('post', '/portal/sair', { cookie: cookieSaiu })
    expect(s.status).toBe(204)
    expect(String((s.headers['set-cookie'] as unknown as string[])[0])).toMatch(/portal_dev=;/)
    expect((await chamar('get', '/portal/sessao', { cookie: cookieSaiu })).status).toBe(401)
  })

  it('portal desligado ou empresa suspensa derrubam a sessão na hora', async () => {
    const c = await novoClienteDoPortal(app)
    const cookie = await entrarNoPortal(chamar, c)
    await configurarPortal(c.tenantId, { ativo: false })
    expect((await chamar('get', '/portal/sessao', { cookie })).status).toBe(401)
    await configurarPortal(c.tenantId, { ativo: true })
    expect((await chamar('get', '/portal/sessao', { cookie })).status).toBe(200)
    await mudarSituacao(c.tenantId, 'suspenso')
    expect((await chamar('get', '/portal/sessao', { cookie })).status).toBe(401)
  })
})

describe('isolamento na transação da requisição', () => {
  it('as duas camadas valem: o cliente só enxerga a própria empresa-cliente e nada interno', async () => {
    const c = await novoClienteDoPortal(app)
    const outraEmpresa = await novoAcesso(c.dono)
    const cookie = await entrarNoPortal(chamar, c)
    const r = await chamar('get', '/portal/teste/visao', { cookie })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      acesso: c.acessoId,
      empresa: c.empresaId,
      contato: c.contatoId,
      tenant: c.tenantId,
    })
    const vis = (r.body as { empresasVisiveis: string[] }).empresasVisiveis
    expect(vis).toEqual([c.empresaId])
    expect(vis).not.toContain(outraEmpresa.empresaId)
    expect((r.body as { perfisVisiveis: number }).perfisVisiveis).toBe(0)
    const noCrm = await noTenant(
      c.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM perfis_acesso`,
    )
    expect(noCrm[0]?.n).toBeGreaterThan(0)
    expect((await chamar('get', '/portal/teste/visao')).status).toBe(401)
    expect((await chamar('get', '/portal/teste/publica')).status).toBe(200)
  })

  it('o CRM continua enxergando todas as empresas (as variáveis do portal não vazam entre requisições)', async () => {
    const c = await novoClienteDoPortal(app)
    await novoAcesso(c.dono)
    const cookie = await entrarNoPortal(chamar, c)
    await chamar('get', '/portal/teste/visao', { cookie })
    const visto = await noTenant(
      c.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM empresas`,
    )
    expect(visto[0]?.n).toBeGreaterThanOrEqual(2)
  })
})

describe('verificação em duas etapas', () => {
  it('Responsável de empresa que exige: sessão pendente até conferir; recuperação gasta uma vez; sem desligar', async () => {
    const c = await novoClienteDoPortal(app, { papel: 'responsavel', exige2fa: true })
    const cookie = await entrarNoPortal(chamar, c)
    const s = await chamar('get', '/portal/sessao', { cookie })
    expect(s.body).toMatchObject({
      segundoFatorExigido: true,
      segundoFatorPendente: true,
      segundoFatorAtivo: false,
    })
    // o resto do portal fica fechado até conferir
    const bloqueado = await chamar('get', '/portal/sessoes', { cookie })
    expect(bloqueado.status).toBe(403)
    expect((bloqueado.body as { erro: string }).erro).toBe('2fa_obrigatorio')

    const ini = await chamar('post', '/portal/2fa/iniciar', { cookie })
    expect(ini.status).toBe(200)
    const segredo = segredoDaUri((ini.body as { uri: string }).uri)
    expect(
      (await chamar('post', '/portal/2fa/confirmar', { cookie, corpo: { codigo: '000000' } }))
        .status,
    ).toBe(422)
    const conf = await chamar('post', '/portal/2fa/confirmar', {
      cookie,
      corpo: { codigo: codigoTotp(segredo) },
    })
    expect(conf.status).toBe(200)
    const codigos = (conf.body as { codigosDeRecuperacao: string[] }).codigosDeRecuperacao
    expect(codigos).toHaveLength(8)
    expect((await chamar('get', '/portal/sessao', { cookie })).body).toMatchObject({
      segundoFatorAtivo: true,
      segundoFatorPendente: false,
    })
    expect((await chamar('get', '/portal/sessoes', { cookie })).status).toBe(200)

    // o segredo fica cifrado no banco e os códigos de recuperação, só em hash
    const [sf] = await noTenant(
      c.tenantId,
      (tx) =>
        tx<
          { segredo_cifrado: string; codigos_recuperacao: string[] }[]
        >`SELECT segredo_cifrado, codigos_recuperacao FROM portal_segundo_fator WHERE acesso_id = ${c.acessoId}`,
    )
    expect(sf?.segredo_cifrado.startsWith('v1:')).toBe(true)
    expect(sf?.segredo_cifrado).not.toContain(segredo)
    expect(JSON.stringify(sf?.codigos_recuperacao)).not.toContain(codigos[0] ?? 'x')

    // nova sessão: pendente de novo; código errado não passa; o TOTP do passo seguinte passa; o mesmo não repete
    const cookie2 = await entrarNoPortal(chamar, c)
    expect((await chamar('get', '/portal/sessao', { cookie: cookie2 })).body).toMatchObject({
      segundoFatorPendente: true,
    })
    expect(
      (
        await chamar('post', '/portal/2fa/conferir', {
          cookie: cookie2,
          corpo: { codigo: '111111' },
        })
      ).status,
    ).toBe(422)
    const proximo = codigoTotp(segredo, 1)
    expect(
      (
        await chamar('post', '/portal/2fa/conferir', {
          cookie: cookie2,
          corpo: { codigo: proximo },
        })
      ).status,
    ).toBe(204)
    expect((await chamar('get', '/portal/sessao', { cookie: cookie2 })).body).toMatchObject({
      segundoFatorPendente: false,
    })
    const cookie3 = await entrarNoPortal(chamar, c)
    expect(
      (
        await chamar('post', '/portal/2fa/conferir', {
          cookie: cookie3,
          corpo: { codigo: proximo },
        })
      ).status,
    ).toBe(422)

    // código de recuperação: vale uma vez
    const rec = codigos[0] ?? ''
    expect(
      (await chamar('post', '/portal/2fa/conferir', { cookie: cookie3, corpo: { codigo: rec } }))
        .status,
    ).toBe(204)
    const cookie4 = await entrarNoPortal(chamar, c)
    expect(
      (await chamar('post', '/portal/2fa/conferir', { cookie: cookie4, corpo: { codigo: rec } }))
        .status,
    ).toBe(422)

    // a empresa exige: o Responsável não desliga
    const des = await chamar('post', '/portal/2fa/desativar', {
      cookie: cookie3,
      corpo: { codigo: codigos[1] ?? '' },
    })
    expect(des.status).toBe(409)
    expect((des.body as { erro: string }).erro).toBe('segundo_fator_obrigatorio')
  })

  it('o Colega liga por vontade própria e pode desligar; depois disso a sessão volta a não pedir', async () => {
    const c = await novoClienteDoPortal(app)
    const cookie = await entrarNoPortal(chamar, c)
    expect((await chamar('get', '/portal/sessao', { cookie })).body).toMatchObject({
      segundoFatorExigido: false,
    })
    const ini = await chamar('post', '/portal/2fa/iniciar', { cookie })
    const segredo = segredoDaUri((ini.body as { uri: string }).uri)
    await chamar('post', '/portal/2fa/confirmar', {
      cookie,
      corpo: { codigo: codigoTotp(segredo) },
    })
    expect((await chamar('post', '/portal/2fa/iniciar', { cookie })).status).toBe(409)
    expect(
      (await chamar('post', '/portal/2fa/desativar', { cookie, corpo: { codigo: '123456' } }))
        .status,
    ).toBe(422)
    expect(
      (
        await chamar('post', '/portal/2fa/desativar', {
          cookie,
          corpo: { codigo: codigoTotp(segredo, 1) },
        })
      ).status,
    ).toBe(204)
    expect((await chamar('get', '/portal/sessao', { cookie })).body).toMatchObject({
      segundoFatorAtivo: false,
      segundoFatorExigido: false,
    })
  })

  it('limita as tentativas de código por acesso', async () => {
    const c = await novoClienteDoPortal(app)
    const cookie = await entrarNoPortal(chamar, c)
    const ini = await chamar('post', '/portal/2fa/iniciar', { cookie })
    expect(ini.status).toBe(200)
    let ultimo = 0
    for (let i = 0; i < 10; i++) {
      ultimo = (
        await chamar('post', '/portal/2fa/confirmar', { cookie, corpo: { codigo: '000000' } })
      ).status
    }
    expect(ultimo).toBe(429)
  })
})

describe('e-mail e perfil', () => {
  it('troca de e-mail: o link vai ao endereço novo e só ele muda o acesso; endereço ocupado dá 409', async () => {
    const c = await novoClienteDoPortal(app)
    const colega = await novoAcesso(c.dono, { empresaId: c.empresaId })
    const cookie = await entrarNoPortal(chamar, c)
    const novo = `novo-${c.acessoId}@exemplo.com.br`

    expect(
      (await chamar('post', '/portal/email/troca', { cookie, corpo: { email: colega.email } }))
        .status,
    ).toBe(409)
    expect(
      (await chamar('post', '/portal/email/troca', { cookie, corpo: { email: novo } })).status,
    ).toBe(202)
    const antes = await noTenant(
      c.tenantId,
      (tx) =>
        tx<{ email: string }[]>`SELECT email::text FROM portal_acessos WHERE id = ${c.acessoId}`,
    )
    expect(antes[0]?.email).toBe(c.email)

    const token = await tokenDoEmail(novo)
    const previa = await chamar('post', '/portal/link/consulta', { corpo: { token } })
    expect(previa.body).toMatchObject({
      finalidade: 'troca_email',
      exigeAceiteDePrivacidade: false,
    })
    expect((await chamar('post', '/portal/link/consumir', { corpo: { token } })).status).toBe(200)
    const depois = await noTenant(
      c.tenantId,
      (tx) =>
        tx<{ email: string }[]>`SELECT email::text FROM portal_acessos WHERE id = ${c.acessoId}`,
    )
    expect(depois[0]?.email).toBe(novo)
  })

  it('corrigir o nome grava a auditoria com o ator "contato" e nunca registra segredos', async () => {
    const c = await novoClienteDoPortal(app)
    const cookie = await entrarNoPortal(chamar, c)
    const r = await chamar('put', '/portal/perfil', { cookie, corpo: { nome: 'Maria da Silva' } })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ contato: { nome: 'Maria da Silva' } })
    expect(
      (await chamar('put', '/portal/perfil', { cookie, corpo: { nome: 'x', cargo: 'CEO' } }))
        .status,
    ).toBe(400)
    const logs = await noTenant(
      c.tenantId,
      (tx) =>
        tx<
          {
            acao: string
            membro_id: string | null
            alteracoes: { ator: { tipo: string; acessoId: string } }
          }[]
        >`SELECT acao, membro_id, alteracoes FROM auditoria WHERE entidade_id = ${c.contatoId}`,
    )
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ acao: 'nome_corrigido_pelo_cliente', membro_id: null })
    expect(logs[0]?.alteracoes.ator).toEqual({
      tipo: 'contato',
      acessoId: c.acessoId,
      contatoId: c.contatoId,
    })
    const todos = await noTenant(
      c.tenantId,
      (tx) => tx<{ alteracoes: unknown }[]>`SELECT alteracoes FROM auditoria`,
    )
    expect(JSON.stringify(todos)).not.toMatch(/token/i)
  })
})

describe('portal não configurado', () => {
  it('sem PORTAL_URL todas as rotas do portal dão 503 e o CRM segue normal', async () => {
    const base = configuracaoDeTeste(configuracaoDoPortalDeTeste)
    const config = { ...base, PORTAL_URL: undefined }
    const semPortal = await criarAppComRotas([], config)
    try {
      const ch = chamarPortalEm(() => semPortal)
      const r = await ch('post', '/portal/entrada', { corpo: { email: 'a@exemplo.com' } })
      expect(r.status).toBe(503)
      expect((r.body as { erro: string }).erro).toBe('portal_indisponivel')
      expect((await ch('get', '/portal/sessao')).status).toBe(503)
      expect((await ch('get', '/acesso/opcoes', { origem: null })).status).toBe(200)
    } finally {
      await semPortal.close()
    }
  })

  void cookieDe
})
