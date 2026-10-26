import type { Server } from 'node:http'

import { type AcessoDoPortal } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { aguardarMensagem, limparCaixa, primeiroLink } from '../testes/mailpit.js'
import { novoDono } from '../testes/mundo.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  criarLinkDireto,
  entrarNoPortal,
  novaEmpresaCliente,
  novoAcesso,
  novoClienteDoPortal,
  novoContatoVinculado,
} from '../testes/portal.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'

let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)

beforeAll(async () => {
  app = await criarAppComRotas([], configuracaoDeTeste(configuracaoDoPortalDeTeste))
  worker = await subirWorkerDeTeste()
  await limparCaixa()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
})

let n = 0
const emailNovo = () => `convidado-${Date.now()}-${(n += 1)}@exemplo.com.br`
const tokenDoEmail = async (email: string) =>
  primeiroLink(await aguardarMensagem(email)).split('#')[1] ?? ''

/** Empresa da equipe com o portal ligado, uma empresa-cliente e um gestor com todas as permissões do portal. */
async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  await configurarPortal(d.tenantId)
  const empresaId = await novaEmpresaCliente(d)
  const gestor = await pessoa('Gestor do portal', {
    'portal.ver': null,
    'portal.acessos': null,
    'portal.configurar': null,
  })
  return { d, pessoa, empresaId, gestor }
}

describe('permissões', () => {
  it('sem permissão do portal nada passa; só "ver" lista mas não altera; o Administrador pode tudo', async () => {
    const { d, pessoa, empresaId } = await cenario()
    const nenhuma = await pessoa('Sem portal', { 'chamados.ver': 'propria' })
    const soVer = await pessoa('Só vê', { 'portal.ver': null })
    for (const [metodo, url] of [
      ['get', '/portal-acessos'],
      ['get', '/portal-pedidos'],
      ['get', '/portal-configuracao'],
    ] as const) {
      expect((await crm(metodo, nenhuma.cookie, url)).status, url).toBe(403)
      expect((await crm(metodo, soVer.cookie, url)).status, url).toBe(200)
    }
    const { contatoId } = await novoContatoVinculado(d.tenantId, empresaId, { email: emailNovo() })
    const corpo = { contatoId, empresaClienteId: empresaId }
    expect((await crm('post', soVer.cookie, '/portal-acessos', corpo)).status).toBe(403)
    expect((await crm('put', soVer.cookie, '/portal-configuracao', { ativo: true })).status).toBe(
      403,
    )
    expect((await crm('post', d.cookie, '/portal-acessos', corpo)).status).toBe(201)
  })

  it('o portal do cliente não aceita a sessão do CRM e o CRM não aceita a do portal', async () => {
    const c = await novoClienteDoPortal(app)
    const cookie = await entrarNoPortal(portal, c)
    expect((await crm('get', cookie, '/portal-acessos')).status).toBe(401)
  })
})

describe('configuração', () => {
  it('liga, desliga e muda o nome; desligar derruba as sessões; tudo auditado', async () => {
    const { d, gestor } = await cenario()
    await configurarPortal(d.tenantId, { ativo: false, nome: null })
    expect((await crm('get', gestor.cookie, '/portal-configuracao')).body).toMatchObject({
      ativo: false,
      nome: null,
      exigeDoisFatoresDoResponsavel: false,
      comentariosAtivos: true,
    })
    const r = await crm('put', gestor.cookie, '/portal-configuracao', {
      ativo: true,
      nome: 'Portal Acme',
      exigeDoisFatoresDoResponsavel: true,
      comentariosAtivos: false,
    })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      ativo: true,
      nome: 'Portal Acme',
      exigeDoisFatoresDoResponsavel: true,
      comentariosAtivos: false,
    })
    expect((await crm('put', gestor.cookie, '/portal-configuracao', { nome: 'x' })).status).toBe(
      400,
    )

    const cliente = await novoAcesso(d)
    const cookie = await entrarNoPortal(portal, cliente)
    expect((await portal('get', '/portal/sessao', { cookie })).body).toMatchObject({
      nomeDoPortal: 'Portal Acme',
    })
    await crm('put', gestor.cookie, '/portal-configuracao', { ativo: false })
    expect((await portal('get', '/portal/sessao', { cookie })).status).toBe(401)

    const logs = await noTenant(
      d.tenantId,
      (tx) =>
        tx<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM auditoria WHERE entidade = 'portal_configuracao'`,
    )
    expect(logs[0]?.n).toBe(2)
  })
})

describe('dar acesso', () => {
  it('exige o portal ligado, o contato ativo na empresa e um e-mail; o convite chega e ativa o acesso', async () => {
    const { d, empresaId, gestor } = await cenario()
    const email = emailNovo()
    const { contatoId } = await novoContatoVinculado(d.tenantId, empresaId, {
      email: email.toUpperCase(),
    })
    const corpo = { contatoId, empresaClienteId: empresaId, papel: 'responsavel' }

    await configurarPortal(d.tenantId, { ativo: false })
    const desligado = await crm('post', gestor.cookie, '/portal-acessos', corpo)
    expect(desligado.status).toBe(409)
    expect((desligado.body as { erro: string }).erro).toBe('portal_desligado')
    await configurarPortal(d.tenantId)

    const fora = await novoContatoVinculado(d.tenantId, empresaId, {
      vincular: false,
      email: emailNovo(),
    })
    expect(
      (await crm('post', gestor.cookie, '/portal-acessos', { ...corpo, contatoId: fora.contatoId }))
        .status,
    ).toBe(422)
    const semEmail = await novoContatoVinculado(d.tenantId, empresaId)
    const r0 = await crm('post', gestor.cookie, '/portal-acessos', {
      ...corpo,
      contatoId: semEmail.contatoId,
    })
    expect(r0.status).toBe(422)
    expect((r0.body as { erro: string }).erro).toBe('email_obrigatorio')

    const r = await crm('post', gestor.cookie, '/portal-acessos', corpo)
    expect(r.status).toBe(201)
    const acesso = r.body as AcessoDoPortal
    expect(acesso).toMatchObject({
      situacao: 'convidado',
      papel: 'responsavel',
      email: email.toLowerCase(),
      conviteVencido: false,
    })
    expect(acesso.empresaCliente.id).toBe(empresaId)

    // o convite chega por e-mail e leva ao portal; confirmar ativa o acesso
    const token = await tokenDoEmail(email.toLowerCase())
    const previa = await portal('post', '/portal/link/consulta', { corpo: { token } })
    expect(previa.body).toMatchObject({ finalidade: 'convite', exigeAceiteDePrivacidade: true })
    expect(
      (await portal('post', '/portal/link/consumir', { corpo: { token, aceitaPrivacidade: true } }))
        .status,
    ).toBe(200)
    const lista = await crm('get', gestor.cookie, `/portal-acessos?contatoId=${contatoId}`)
    expect((lista.body as { itens: AcessoDoPortal[] }).itens[0]).toMatchObject({
      situacao: 'ativo',
    })

    // duplicado: mesmo contato, e mesmo e-mail em outro contato
    const dup = await crm('post', gestor.cookie, '/portal-acessos', corpo)
    expect(dup.status).toBe(409)
    expect((dup.body as { erro: string }).erro).toBe('acesso_ja_existe')
    const outro = await novoContatoVinculado(d.tenantId, empresaId)
    const emUso = await crm('post', gestor.cookie, '/portal-acessos', {
      contatoId: outro.contatoId,
      empresaClienteId: empresaId,
      email,
    })
    expect(emUso.status).toBe(409)
    expect((emUso.body as { erro: string }).erro).toBe('email_em_uso')
  })

  it('reenviar troca o convite; depois de aceito não reenvia', async () => {
    const { d, empresaId, gestor } = await cenario()
    const email = emailNovo()
    const { contatoId } = await novoContatoVinculado(d.tenantId, empresaId, { email })
    const criado = (
      await crm('post', gestor.cookie, '/portal-acessos', {
        contatoId,
        empresaClienteId: empresaId,
      })
    ).body as AcessoDoPortal
    const primeiro = await tokenDoEmail(email)
    await limparCaixa()
    const re = await crm('post', gestor.cookie, `/portal-acessos/${criado.id}/reenviar`)
    expect(re.status).toBe(201)
    const segundo = await tokenDoEmail(email)
    expect(segundo).not.toBe(primeiro)
    expect(
      (await portal('post', '/portal/link/consulta', { corpo: { token: primeiro } })).status,
    ).toBe(404)
    expect(
      (
        await portal('post', '/portal/link/consumir', {
          corpo: { token: segundo, aceitaPrivacidade: true },
        })
      ).status,
    ).toBe(200)
    expect((await crm('post', gestor.cookie, `/portal-acessos/${criado.id}/reenviar`)).status).toBe(
      409,
    )
  })

  it('convite vencido aparece como vencido na lista', async () => {
    const { d, empresaId, gestor } = await cenario()
    const c = await novoAcesso(d, { empresaId, situacao: 'convidado' })
    await criarLinkDireto(c, 'convite', { minutos: -10 })
    const lista = await crm('get', gestor.cookie, `/portal-acessos?contatoId=${c.contatoId}`)
    expect((lista.body as { itens: AcessoDoPortal[] }).itens[0]?.conviteVencido).toBe(true)
  })
})

describe('suspender, reativar, alterar e revogar', () => {
  it('suspender derruba a sessão; reativar devolve; papel muda; transições inválidas dão 409', async () => {
    const { d, empresaId, gestor } = await cenario()
    const c = await novoAcesso(d, { empresaId })
    const cookie = await entrarNoPortal(portal, c)

    expect(
      (await crm('patch', gestor.cookie, `/portal-acessos/${c.acessoId}`, { situacao: 'ativo' }))
        .status,
    ).toBe(409)
    expect((await crm('patch', gestor.cookie, `/portal-acessos/${c.acessoId}`, {})).status).toBe(
      400,
    )
    const s = await crm('patch', gestor.cookie, `/portal-acessos/${c.acessoId}`, {
      situacao: 'suspenso',
      papel: 'responsavel',
    })
    expect(s.status).toBe(200)
    expect(s.body).toMatchObject({ situacao: 'suspenso', papel: 'responsavel' })
    expect((await portal('get', '/portal/sessao', { cookie })).status).toBe(401)
    expect(
      (await crm('patch', gestor.cookie, `/portal-acessos/${c.acessoId}`, { situacao: 'suspenso' }))
        .status,
    ).toBe(409)

    expect(
      (await crm('patch', gestor.cookie, `/portal-acessos/${c.acessoId}`, { situacao: 'ativo' }))
        .status,
    ).toBe(200)
    const novo = await entrarNoPortal(portal, c)
    expect((await portal('get', '/portal/sessao', { cookie: novo })).body).toMatchObject({
      papel: 'responsavel',
    })
  })

  it('revogar derruba sessões, invalida links e libera um novo convite ao mesmo contato', async () => {
    const { d, empresaId, gestor } = await cenario()
    const c = await novoAcesso(d, { empresaId })
    const cookie = await entrarNoPortal(portal, c)
    const link = await criarLinkDireto(c, 'entrada')

    expect((await crm('delete', gestor.cookie, `/portal-acessos/${c.acessoId}`)).status).toBe(204)
    expect((await portal('get', '/portal/sessao', { cookie })).status).toBe(401)
    expect(
      (
        await portal('post', '/portal/link/consumir', {
          corpo: { token: link, aceitaPrivacidade: true },
        })
      ).status,
    ).toBe(404)
    const padrao = await crm('get', gestor.cookie, `/portal-acessos?contatoId=${c.contatoId}`)
    expect((padrao.body as { total: number }).total).toBe(0)
    const revogados = await crm(
      'get',
      gestor.cookie,
      `/portal-acessos?contatoId=${c.contatoId}&situacao=revogado`,
    )
    expect((revogados.body as { total: number }).total).toBe(1)

    const email = emailNovo()
    const r = await crm('post', gestor.cookie, '/portal-acessos', {
      contatoId: c.contatoId,
      empresaClienteId: empresaId,
      email,
    })
    expect(r.status).toBe(201)
  })

  it('o acesso de outra empresa da equipe é um 404', async () => {
    const { gestor } = await cenario()
    const outro = await novoDono(app)
    await configurarPortal(outro.tenantId)
    const alheio = await novoAcesso(outro)
    for (const [metodo, url, corpo] of [
      ['patch', `/portal-acessos/${alheio.acessoId}`, { situacao: 'suspenso' }],
      ['delete', `/portal-acessos/${alheio.acessoId}`, undefined],
      ['post', `/portal-acessos/${alheio.acessoId}/reenviar`, undefined],
    ] as const) {
      expect((await crm(metodo, gestor.cookie, url, corpo)).status, url).toBe(404)
    }
    const lista = await crm(
      'get',
      gestor.cookie,
      `/portal-acessos?empresaClienteId=${alheio.empresaId}`,
    )
    expect((lista.body as { total: number }).total).toBe(0)
  })
})

describe('pedidos de acesso para colegas', () => {
  it('só o Responsável pede; a equipe recusa com motivo ou aprova (cria contato, vínculo e convite)', async () => {
    const { d, gestor } = await cenario()
    const resp = await novoAcesso(d, { papel: 'responsavel' })
    const colega = await novoAcesso(d, { empresaId: resp.empresaId, papel: 'colega' })
    const cookieResp = await entrarNoPortal(portal, resp)
    const cookieColega = await entrarNoPortal(portal, colega)

    const email = emailNovo()
    const pedido = { nome: 'Joana Souza', email, cargo: 'Financeiro' }
    expect(
      (await portal('post', '/portal/pedidos-de-acesso', { cookie: cookieColega, corpo: pedido }))
        .status,
    ).toBe(403)
    expect(
      (await portal('get', '/portal/pedidos-de-acesso', { cookie: cookieColega })).status,
    ).toBe(403)
    // a empresa vem da sessão: o corpo não aceita empresa
    expect(
      (
        await portal('post', '/portal/pedidos-de-acesso', {
          cookie: cookieResp,
          corpo: { ...pedido, empresaClienteId: crypto.randomUUID() },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await portal('post', '/portal/pedidos-de-acesso', {
          cookie: cookieResp,
          corpo: { ...pedido, email: colega.email },
        })
      ).status,
    ).toBe(409)
    expect(
      (await portal('post', '/portal/pedidos-de-acesso', { cookie: cookieResp, corpo: pedido }))
        .status,
    ).toBe(204)
    expect(
      (await portal('post', '/portal/pedidos-de-acesso', { cookie: cookieResp, corpo: pedido }))
        .status,
    ).toBe(409)

    const lista = await crm('get', gestor.cookie, '/portal-pedidos')
    const itens = (
      lista.body as { itens: { id: string; email: string; empresaCliente: { id: string } }[] }
    ).itens
    const meu = itens.find((i) => i.email === email)
    expect(meu?.empresaCliente.id).toBe(resp.empresaId)

    const recusa = await crm('post', gestor.cookie, `/portal-pedidos/${meu?.id}/tratar`, {
      decisao: 'recusar',
      motivo: 'Fora do contrato',
    })
    expect(recusa.status).toBe(204)
    expect(
      (
        await crm('post', gestor.cookie, `/portal-pedidos/${meu?.id}/tratar`, {
          decisao: 'aprovar',
        })
      ).status,
    ).toBe(409)
    const vistos = await portal('get', '/portal/pedidos-de-acesso', { cookie: cookieResp })
    expect(
      (vistos.body as { itens: { situacao: string; motivo: string | null }[] }).itens[0],
    ).toMatchObject({ situacao: 'recusado', motivo: 'Fora do contrato' })

    // novo pedido, agora aprovado
    const email2 = emailNovo()
    await portal('post', '/portal/pedidos-de-acesso', {
      cookie: cookieResp,
      corpo: { nome: 'Pedro Lima', email: email2, cargo: 'Compras' },
    })
    const pend = (await crm('get', gestor.cookie, '/portal-pedidos')).body as {
      itens: { id: string; email: string }[]
    }
    const id2 = pend.itens.find((i) => i.email === email2)?.id
    expect(
      (await crm('post', gestor.cookie, `/portal-pedidos/${id2}/tratar`, { decisao: 'aprovar' }))
        .status,
    ).toBe(204)
    const acessos = await crm(
      'get',
      gestor.cookie,
      `/portal-acessos?empresaClienteId=${resp.empresaId}&busca=Pedro`,
    )
    expect((acessos.body as { itens: AcessoDoPortal[] }).itens[0]).toMatchObject({
      contato: { nome: 'Pedro Lima' },
      situacao: 'convidado',
      papel: 'colega',
      email: email2,
    })
    const vinculo = await noTenant(
      d.tenantId,
      (tx) =>
        tx<
          { cargo: string }[]
        >`SELECT ec.cargo FROM empresa_contatos ec JOIN contatos c ON c.id = ec.contato_id WHERE c.nome = 'Pedro Lima' AND ec.empresa_id = ${resp.empresaId}`,
    )
    expect(vinculo[0]?.cargo).toBe('Compras')
    const token = await tokenDoEmail(email2)
    expect(
      (await portal('post', '/portal/link/consumir', { corpo: { token, aceitaPrivacidade: true } }))
        .status,
    ).toBe(200)
  })

  it('um Responsável não vê nem pede em outra empresa-cliente', async () => {
    const { d } = await cenario()
    const a = await novoAcesso(d, { papel: 'responsavel' })
    const b = await novoAcesso(d, { papel: 'responsavel' })
    const ca = await entrarNoPortal(portal, a)
    const cb = await entrarNoPortal(portal, b)
    await portal('post', '/portal/pedidos-de-acesso', {
      cookie: ca,
      corpo: { nome: 'Fulano', email: emailNovo() },
    })
    expect(
      (
        (await portal('get', '/portal/pedidos-de-acesso', { cookie: ca })).body as {
          itens: unknown[]
        }
      ).itens,
    ).toHaveLength(1)
    expect(
      (
        (await portal('get', '/portal/pedidos-de-acesso', { cookie: cb })).body as {
          itens: unknown[]
        }
      ).itens,
    ).toHaveLength(0)
  })
})
