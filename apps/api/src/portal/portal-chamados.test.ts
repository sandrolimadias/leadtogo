import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import type {
  Chamado,
  ChamadoDoPortal,
  DownloadDeAnexo,
  InicioDoPortal,
  EnvioDeAnexo,
  ListaDeChamadosDoPortal,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { type ClamdFalso, eicar, subirClamdFalso } from '../testes/clamd-falso.js'
import { esperarAte } from '../testes/espera.js'
import { aguardarMensagem, limparCaixa, primeiroLink } from '../testes/mailpit.js'
import { dono } from '../testes/mundo.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  entrarNoPortal,
  novoAcesso,
  novaEmpresaCliente,
} from '../testes/portal.js'
import { TempoRealDoSino } from '../notificacoes/tempo-real.service.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
let app: INestApplication<Server>
let clamd: ClamdFalso
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)
const erroDe = (r: { body: unknown }) => (r.body as RespostaDeErro).erro

beforeAll(async () => {
  await limparLimitesAuth(valkey)
  clamd = await subirClamdFalso()
  const antivirus = { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(clamd.porta) }
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({ ...configuracaoDoPortalDeTeste, ...antivirus }),
  )
  worker = await subirWorkerDeTeste(antivirus)
  await limparCaixa()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
  await clamd.parar()
  await valkey.quit()
  await dono.end()
})

/** Empresa da equipe com o portal ligado, a área Jurídico visível e a Financeiro oculta, e dois clientes. */
async function cenario() {
  const e = await empresaDeChamados(app)
  await configurarPortal(e.d.tenantId)
  const juridico = await e.areaPadrao('juridico')
  const financeiro = await e.areaPadrao('financeiro')
  await noTenant(
    e.d.tenantId,
    (tx) =>
      tx`UPDATE areas_atendimento SET visivel_no_portal = (id = ${juridico}) WHERE id IN (${juridico}, ${financeiro})`,
  )
  const empresaId = await novaEmpresaCliente(e.d)
  const ana = await novoAcesso(e.d, { empresaId, nome: 'Ana Cliente' })
  const bia = await novoAcesso(e.d, { empresaId, nome: 'Bia Colega' })
  const outraEmpresa = await novoAcesso(e.d, { nome: 'Carla de Outra' })
  const cookieAna = await entrarNoPortal(portal, ana)
  const cookieBia = await entrarNoPortal(portal, bia)
  const cookieCarla = await entrarNoPortal(portal, outraEmpresa)
  return {
    e,
    juridico,
    financeiro,
    empresaId,
    ana,
    bia,
    outraEmpresa,
    cookieAna,
    cookieBia,
    cookieCarla,
  }
}

type Cenario = Awaited<ReturnType<typeof cenario>>

const abrir = async (
  c: Cenario,
  corpo: object = { assunto: 'Nota fiscal com erro', descricao: 'Valor trocado' },
  cookie = c.cookieAna,
) => {
  const r = await portal('post', '/portal/chamados', { cookie, corpo })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as ChamadoDoPortal
}

const dadosNoCrm = async (c: Cenario, id: string) =>
  (await crm('get', c.e.d.cookie, `/chamados/${id}`)).body as Chamado

describe('abrir', () => {
  it('só as áreas visíveis; sem área vai para a triagem; com área vai para pendente; empresa e solicitante vêm da sessão', async () => {
    const c = await cenario()
    const areas = await portal('get', '/portal/areas', { cookie: c.cookieAna })
    expect((areas.body as { itens: { id: string }[] }).itens.map((a) => a.id)).toEqual([c.juridico])

    const semArea = await abrir(c)
    expect(semArea.estado).toBe('aberto')
    expect(semArea.codigo).toMatch(/^CH-\d{4}$/)
    const noCrm = await dadosNoCrm(c, semArea.id)
    expect(noCrm).toMatchObject({
      status: 'aguardando_triagem',
      origem: 'portal',
      prioridade: 'normal',
      empresaCliente: { id: c.empresaId },
      solicitante: { tipo: 'contato', nome: 'Ana Cliente' },
    })

    const comArea = await abrir(c, { assunto: 'Contrato', areaId: c.juridico })
    // a triagem começa desligada: com área conhecida o chamado já vai para a fila da área
    expect((await dadosNoCrm(c, comArea.id)).status).toBe('pendente')
  })

  it('a área oculta, o corpo com empresa/solicitante/prioridade e o assunto curto são recusados', async () => {
    const c = await cenario()
    const oculta = await portal('post', '/portal/chamados', {
      cookie: c.cookieAna,
      corpo: { assunto: 'Algo importante', areaId: c.financeiro },
    })
    expect(oculta.status).toBe(400)
    expect(erroDe(oculta)).toBe('area_invalida')
    for (const extra of [
      { empresaClienteId: crypto.randomUUID() },
      { contatoId: crypto.randomUUID() },
      { prioridade: 'urgente' },
      { anexoIds: [] },
    ]) {
      const r = await portal('post', '/portal/chamados', {
        cookie: c.cookieAna,
        corpo: { assunto: 'Assunto válido', ...extra },
      })
      expect(r.status, JSON.stringify(extra)).toBe(400)
    }
    expect(
      (await portal('post', '/portal/chamados', { cookie: c.cookieAna, corpo: { assunto: 'ab' } }))
        .status,
    ).toBe(400)
  })

  it('a numeração continua a da equipe, sem repetir entre o CRM e o portal', async () => {
    const c = await cenario()
    const interno = (await crm('post', c.e.d.cookie, '/chamados', { assunto: 'Interno da equipe' }))
      .body as Chamado
    const doPortal = await abrir(c)
    const outro = (await crm('post', c.e.d.cookie, '/chamados', { assunto: 'Outro interno' }))
      .body as Chamado
    expect([interno.numero, Number(doPortal.codigo.slice(3)), outro.numero]).toEqual([
      interno.numero,
      interno.numero + 1,
      interno.numero + 2,
    ])
  })

  it('a triagem ligada põe o chamado com área em "aguardando triagem"; área que pula a triagem vai direto', async () => {
    const c = await cenario()
    const ligada = await crm('put', c.e.d.cookie, '/chamados/triagem', {
      ativa: true,
      perfilId: null,
      membroIds: [c.e.adminId],
    })
    expect(ligada.status, JSON.stringify(ligada.body)).toBe(200)
    const r = await abrir(c, { assunto: 'Com área e triagem', areaId: c.juridico })
    expect((await dadosNoCrm(c, r.id)).status).toBe('aguardando_triagem')
    await noTenant(
      c.e.d.tenantId,
      (tx) => tx`UPDATE areas_atendimento SET pula_triagem = true WHERE id = ${c.juridico}`,
    )
    const direto = await abrir(c, { assunto: 'Direto ao Jurídico', areaId: c.juridico })
    expect((await dadosNoCrm(c, direto.id)).status).toBe('pendente')
  })
})

describe('o que o cliente vê', () => {
  it('nunca vê nota interna, linha do tempo, prioridade, responsável, prazos nem e-mail do atendente', async () => {
    const c = await cenario()
    const ch = await abrir(c, { assunto: 'Preciso de ajuda', areaId: c.juridico })
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/assumir`)
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/notas`, { corpo: 'SEGREDO-INTERNO-123' })
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/mensagens`, {
      corpo: 'Já estamos verificando.',
    })

    const d = await portal('get', `/portal/chamados/${ch.id}`, { cookie: c.cookieAna })
    expect(d.status).toBe(200)
    const corpo = JSON.stringify(d.body)
    expect(corpo).not.toContain('SEGREDO-INTERNO-123')
    for (const proibido of [
      'notasInternas',
      'eventos',
      'prioridade',
      'responsavel',
      'prazoResposta',
      'prazoResolucao',
      'email@',
      '@exemplo',
    ]) {
      expect(corpo, proibido).not.toContain(proibido)
    }
    const dto = d.body as ChamadoDoPortal
    expect(dto.estado).toBe('em_atendimento')
    expect(dto.mensagens).toHaveLength(1)
    expect(dto.mensagens[0]).toMatchObject({
      corpo: 'Já estamos verificando.',
      autor: { daEquipe: true, voce: false },
    })
    expect(dto.marcos.map((m) => m.tipo)).toEqual(['aberto', 'em_atendimento'])
    expect(dto.acoes).toEqual({ responder: true, reabrir: false, avaliar: false })
  })

  it('o estado do cliente: triagem e pendente = Aberto; aguardando cliente = Aguardando sua resposta', async () => {
    const c = await cenario()
    const ch = await abrir(c, { assunto: 'Estados do chamado', areaId: c.juridico })
    expect(ch.estado).toBe('aberto')
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/assumir`)
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'aguardando_cliente' })
    const lista = (await portal('get', '/portal/chamados', { cookie: c.cookieAna }))
      .body as ListaDeChamadosDoPortal
    expect(lista.itens[0]).toMatchObject({
      id: ch.id,
      estado: 'aguardando_voce',
      abertoPor: 'Ana Cliente',
    })
    const inicio = (await portal('get', '/portal/inicio', { cookie: c.cookieAna }))
      .body as InicioDoPortal
    expect(inicio).toMatchObject({
      chamadosAbertos: 1,
      aguardandoVoce: 1,
      resolvidosParaAvaliar: 0,
    })
  })
})

describe('isolamento entre empresas-clientes', () => {
  it('a colega da mesma empresa vê e responde; a de outra empresa recebe 404 em tudo; o chamado interno não aparece', async () => {
    const c = await cenario()
    const ch = await abrir(c)
    const interno = (
      await crm('post', c.e.d.cookie, '/chamados', {
        assunto: 'Interno que cita o cliente',
        empresaClienteId: c.empresaId,
      })
    ).body as Chamado

    const dela = (await portal('get', '/portal/chamados', { cookie: c.cookieBia }))
      .body as ListaDeChamadosDoPortal
    expect(dela.itens.map((i) => i.id)).toEqual([ch.id])
    const r = await portal('post', `/portal/chamados/${ch.id}/mensagens`, {
      cookie: c.cookieBia,
      corpo: { corpo: 'Também estou com esse problema' },
    })
    expect(r.status).toBe(201)
    expect((r.body as ChamadoDoPortal).mensagens[0]?.autor).toMatchObject({
      nome: 'Bia Colega',
      voce: true,
    })
    const vistaPelaAna = (await portal('get', `/portal/chamados/${ch.id}`, { cookie: c.cookieAna }))
      .body as ChamadoDoPortal
    expect(vistaPelaAna.mensagens[0]?.autor).toMatchObject({ nome: 'Bia Colega', voce: false })

    expect(
      (await portal('get', `/portal/chamados/${interno.id}`, { cookie: c.cookieAna })).status,
    ).toBe(404)
    const outros = (await portal('get', '/portal/chamados', { cookie: c.cookieCarla }))
      .body as ListaDeChamadosDoPortal
    expect(outros.total).toBe(0)
    for (const [metodo, url, corpo] of [
      ['get', `/portal/chamados/${ch.id}`, undefined],
      ['post', `/portal/chamados/${ch.id}/mensagens`, { corpo: 'Intrusa' }],
      ['post', `/portal/chamados/${ch.id}/reabrir`, undefined],
      ['post', `/portal/chamados/${ch.id}/avaliacao`, { nota: 5 }],
      [
        'post',
        `/portal/chamados/${ch.id}/anexos`,
        { nome: 'a.pdf', mime: 'application/pdf', tamanho: 10 },
      ],
    ] as const) {
      const resp = await portal(metodo, url, { cookie: c.cookieCarla, corpo })
      expect(resp.status, url).toBe(404)
    }
  })

  it('o contato de outro tenant também não alcança', async () => {
    const c = await cenario()
    const ch = await abrir(c)
    const outra = await cenario()
    expect(
      (await portal('get', `/portal/chamados/${ch.id}`, { cookie: outra.cookieAna })).status,
    ).toBe(404)
  })
})

describe('o ciclo do chamado', () => {
  it('equipe responde → pede resposta → cliente responde → equipe resolve → cliente reabre, resolve de novo e avalia', async () => {
    const c = await cenario()
    const ch = await abrir(c, { assunto: 'Ciclo completo', areaId: c.juridico })
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/assumir`)
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'aguardando_cliente' })

    // responder em "Aguardando sua resposta" volta ao atendimento
    const volta = await portal('post', `/portal/chamados/${ch.id}/mensagens`, {
      cookie: c.cookieAna,
      corpo: { corpo: 'Segue o documento.' },
    })
    expect(volta.status).toBe(201)
    expect((volta.body as ChamadoDoPortal).estado).toBe('em_atendimento')
    const noCrm = await dadosNoCrm(c, ch.id)
    expect(noCrm.status).toBe('em_atendimento')
    expect(noCrm.primeiraRespostaEm).toBeNull() // resposta do cliente não conta como da equipe
    expect(noCrm.mensagens.at(-1)).toMatchObject({
      autor: { tipo: 'contato' },
      corpo: 'Segue o documento.',
    })
    expect(noCrm.eventos.at(-1)).toMatchObject({
      tipo: 'status_alterado',
      ator: { tipo: 'contato' },
    })

    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' })
    const resolvido = (await portal('get', `/portal/chamados/${ch.id}`, { cookie: c.cookieAna }))
      .body as ChamadoDoPortal
    expect(resolvido.estado).toBe('resolvido')
    expect(resolvido.acoes).toEqual({ responder: false, reabrir: true, avaliar: true })
    const nao = await portal('post', `/portal/chamados/${ch.id}/mensagens`, {
      cookie: c.cookieAna,
      corpo: { corpo: 'Ainda?' },
    })
    expect(nao.status).toBe(409)
    expect(erroDe(nao)).toBe('chamado_resolvido')

    const reaberto = await portal('post', `/portal/chamados/${ch.id}/reabrir`, {
      cookie: c.cookieAna,
    })
    expect(reaberto.status).toBe(201)
    expect((reaberto.body as ChamadoDoPortal).estado).toBe('em_atendimento')
    expect((await dadosNoCrm(c, ch.id)).reaberturas).toBe(1)
    expect(
      (await portal('post', `/portal/chamados/${ch.id}/reabrir`, { cookie: c.cookieAna })).status,
    ).toBe(409)

    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' })
    const nota0 = await portal('post', `/portal/chamados/${ch.id}/avaliacao`, {
      cookie: c.cookieAna,
      corpo: { nota: 6 },
    })
    expect(nota0.status).toBe(400)
    const av = await portal('post', `/portal/chamados/${ch.id}/avaliacao`, {
      cookie: c.cookieAna,
      corpo: { nota: 4, comentario: 'Bom atendimento' },
    })
    expect(av.status).toBe(201)
    expect((av.body as ChamadoDoPortal).avaliacao).toMatchObject({
      nota: 4,
      comentario: 'Bom atendimento',
    })
    expect((av.body as ChamadoDoPortal).acoes.avaliar).toBe(false)
    const outra = await portal('post', `/portal/chamados/${ch.id}/avaliacao`, {
      cookie: c.cookieBia,
      corpo: { nota: 1 },
    })
    expect(outra.status).toBe(409)
    expect(erroDe(outra)).toBe('ja_avaliado')
  })

  it('não reabre depois de 7 dias; não avalia chamado em andamento', async () => {
    const c = await cenario()
    const ch = await abrir(c, { assunto: 'Prazo de reabertura', areaId: c.juridico })
    expect(
      (
        await portal('post', `/portal/chamados/${ch.id}/avaliacao`, {
          cookie: c.cookieAna,
          corpo: { nota: 5 },
        })
      ).status,
    ).toBe(409)
    expect(
      (await portal('post', `/portal/chamados/${ch.id}/reabrir`, { cookie: c.cookieAna })).status,
    ).toBe(409)
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/assumir`)
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' })
    await noTenant(
      c.e.d.tenantId,
      (tx) => tx`UPDATE chamados SET resolvido_em = now() - interval '8 days' WHERE id = ${ch.id}`,
    )
    const r = await portal('post', `/portal/chamados/${ch.id}/reabrir`, { cookie: c.cookieAna })
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('prazo_de_reabertura_vencido')
    const d = (await portal('get', `/portal/chamados/${ch.id}`, { cookie: c.cookieAna }))
      .body as ChamadoDoPortal
    expect(d.acoes.reabrir).toBe(false)
  })

  it('a ação do cliente fica auditada com o ator "contato"', async () => {
    const c = await cenario()
    const ch = await abrir(c)
    const logs = await noTenant(
      c.e.d.tenantId,
      (tx) =>
        tx<
          {
            acao: string
            membro_id: string | null
            alteracoes: { ator: { tipo: string; contatoId: string } }
          }[]
        >`SELECT acao, membro_id, alteracoes FROM auditoria WHERE entidade_id = ${ch.id}`,
    )
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ acao: 'abrir_pelo_portal', membro_id: null })
    expect(logs[0]?.alteracoes.ator).toMatchObject({ tipo: 'contato', contatoId: c.ana.contatoId })
  })
})

describe('avisos', () => {
  it('a equipe é avisada quando o cliente abre e responde; o cliente, quando a equipe responde, pede resposta ou resolve', async () => {
    const c = await cenario()
    const ch = await abrir(c, { assunto: 'Avisos do chamado', areaId: c.juridico })
    const doMembro = (tipo: string) =>
      noTenant(
        c.e.d.tenantId,
        (tx) =>
          tx<
            { id: string }[]
          >`SELECT n.id FROM notificacoes n WHERE n.chamado_id = ${ch.id} AND n.destinatario_tipo = 'membro' AND n.tipo = ${tipo}`,
      )
    await esperarAte(async () => (await doMembro('chamado.aberto')).length > 0)

    await portal('post', `/portal/chamados/${ch.id}/mensagens`, {
      cookie: c.cookieAna,
      corpo: { corpo: 'Alguma novidade?' },
    })
    await esperarAte(async () => (await doMembro('chamado.mensagem')).length > 0)

    // o cliente: nada ao abrir nem ao responder (o ato é dele); sino e e-mail quando a equipe age
    const doCliente = () =>
      noTenant(
        c.e.d.tenantId,
        (tx) =>
          tx<
            { tipo: string; canal: string }[]
          >`SELECT tipo, canal FROM notificacoes WHERE chamado_id = ${ch.id} AND destinatario_tipo = 'contato' ORDER BY criado_em`,
      )
    expect(await doCliente()).toHaveLength(0)

    await limparCaixa()
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/mensagens`, {
      corpo: 'Estamos analisando o seu caso.',
    })
    await esperarAte(async () =>
      (await doCliente()).some((n) => n.tipo === 'chamado.mensagem' && n.canal === 'sino'),
    )
    const email = await aguardarMensagem(c.ana.email)
    expect(email.Subject).toMatch(/Nova resposta da equipe/)
    expect(primeiroLink(email)).toBe(`http://localhost:5174/chamados/${ch.id}`)

    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'aguardando_cliente' })
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'em_atendimento' })
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' })
    await esperarAte(async () => {
      const t = (await doCliente()).filter((n) => n.canal === 'sino').map((n) => n.tipo)
      return t.includes('chamado.aguardando_cliente') && t.includes('chamado.resolvido')
    })

    // o sino do portal: lista, marca como lida; a outra pessoa da empresa não lê as da Ana
    const lista = await portal('get', '/portal/notificacoes', { cookie: c.cookieAna })
    const itens = (
      lista.body as { itens: { id: string; lida: boolean; destino: string }[]; naoLidas: number }
    ).itens
    expect(itens.length).toBeGreaterThanOrEqual(3)
    expect(itens[0]?.destino).toBe(`/chamados/${ch.id}`)
    expect((lista.body as { naoLidas: number }).naoLidas).toBe(itens.length)
    expect(
      (
        (await portal('get', '/portal/notificacoes', { cookie: c.cookieBia })).body as {
          itens: unknown[]
        }
      ).itens,
    ).toHaveLength(0)
    expect(
      (await portal('post', `/portal/notificacoes/${itens[0]?.id}/lida`, { cookie: c.cookieBia }))
        .status,
    ).toBe(404)
    const lida = await portal('post', `/portal/notificacoes/${itens[0]?.id}/lida`, {
      cookie: c.cookieAna,
    })
    expect(lida.body).toEqual({ naoLidas: itens.length - 1 })
    expect(
      (await portal('post', '/portal/notificacoes/lidas', { cookie: c.cookieAna })).body,
    ).toEqual({ naoLidas: 0 })
  })
})

describe('anexos', () => {
  const enviar = async (cookie: string, chamadoId: string, nome: string, bytes: Buffer) => {
    const pedido = await portal('post', `/portal/chamados/${chamadoId}/anexos`, {
      cookie,
      corpo: { nome, mime: 'application/pdf', tamanho: bytes.length },
    })
    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)
    const envio = pedido.body as EnvioDeAnexo
    expect((await fetch(envio.url, { method: 'PUT', body: new Uint8Array(bytes) })).ok).toBe(true)
    const conf = await portal(
      'post',
      `/portal/chamados/${chamadoId}/anexos/${envio.anexoId}/confirmar`,
      { cookie },
    )
    expect(conf.status, JSON.stringify(conf.body)).toBe(200)
    return envio.anexoId
  }
  const estado = async (tenantId: string, id: string) =>
    (
      await noTenant(
        tenantId,
        (tx) => tx<{ estado: string }[]>`SELECT estado FROM chamado_anexos WHERE id = ${id}`,
      )
    )[0]?.estado

  it('envia, o antivírus varre, vai na mensagem e o download é uma URL de 60 segundos; o infectado não baixa', async () => {
    const c = await cenario()
    const ch = await abrir(c)
    const limpo = await enviar(
      c.cookieAna,
      ch.id,
      'contrato.pdf',
      Buffer.from('conteudo inofensivo'),
    )
    const sujo = await enviar(c.cookieAna, ch.id, 'virus.pdf', eicar())
    await esperarAte(
      async () =>
        (await estado(c.e.d.tenantId, limpo)) === 'limpo' &&
        (await estado(c.e.d.tenantId, sujo)) === 'infectado',
    )

    // anexo solto não baixa; a colega não usa o anexo da Ana
    expect(
      (
        await portal('get', `/portal/chamados/${ch.id}/anexos/${limpo}/download`, {
          cookie: c.cookieAna,
        })
      ).status,
    ).toBe(404)
    const alheio = await portal('post', `/portal/chamados/${ch.id}/mensagens`, {
      cookie: c.cookieBia,
      corpo: { corpo: 'Com o anexo da Ana', anexoIds: [limpo] },
    })
    expect(alheio.status).toBe(400)
    expect(erroDe(alheio)).toBe('anexo_invalido')

    const msg = await portal('post', `/portal/chamados/${ch.id}/mensagens`, {
      cookie: c.cookieAna,
      corpo: { corpo: 'Seguem os arquivos', anexoIds: [limpo, sujo] },
    })
    expect(msg.status).toBe(201)
    const anexos = (msg.body as ChamadoDoPortal).mensagens[0]?.anexos ?? []
    expect(anexos.map((a) => [a.nome, a.estado]).sort()).toEqual([
      ['contrato.pdf', 'limpo'],
      ['virus.pdf', 'infectado'],
    ])

    const baixa = await portal('get', `/portal/chamados/${ch.id}/anexos/${limpo}/download`, {
      cookie: c.cookieBia,
    })
    expect(baixa.status).toBe(200)
    const url = (baixa.body as DownloadDeAnexo).url
    expect(url).toMatch(/X-Amz-Expires=60(&|$)/)
    expect(await (await fetch(url)).text()).toBe('conteudo inofensivo')
    const bloqueado = await portal('get', `/portal/chamados/${ch.id}/anexos/${sujo}/download`, {
      cookie: c.cookieAna,
    })
    expect(bloqueado.status).toBe(409)
    expect(erroDe(bloqueado)).toBe('anexo_bloqueado')

    // a equipe vê os anexos do cliente pelo CRM
    const vistoNoCrm = await dadosNoCrm(c, ch.id)
    expect(vistoNoCrm.mensagens[0]?.anexos).toHaveLength(2)
  })

  it('chamado de outra empresa não recebe nem entrega anexo; resolvido não recebe', async () => {
    const c = await cenario()
    const ch = await abrir(c, { assunto: 'Anexo e encerramento', areaId: c.juridico })
    const id = await enviar(c.cookieAna, ch.id, 'a.pdf', Buffer.from('x'))
    await portal('post', `/portal/chamados/${ch.id}/mensagens`, {
      cookie: c.cookieAna,
      corpo: { corpo: 'Com anexo', anexoIds: [id] },
    })
    await esperarAte(async () => (await estado(c.e.d.tenantId, id)) === 'limpo')
    expect(
      (
        await portal('get', `/portal/chamados/${ch.id}/anexos/${id}/download`, {
          cookie: c.cookieCarla,
        })
      ).status,
    ).toBe(404)
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/assumir`)
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' })
    const r = await portal('post', `/portal/chamados/${ch.id}/anexos`, {
      cookie: c.cookieAna,
      corpo: { nome: 'b.pdf', mime: 'application/pdf', tamanho: 5 },
    })
    expect(r.status).toBe(409)
  })
})

describe('tempo real do sino (SSE)', () => {
  it('só o contato destinatário recebe o evento "nova", na hora; sem sessão, 401', async () => {
    const c = await cenario()
    const ch = await abrir(c, { assunto: 'Tempo real', areaId: c.juridico })
    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/assumir`)
    await app.listen(0, '127.0.0.1')
    const porta = (app.getHttpServer().address() as AddressInfo).port
    const abrirFluxo = async (cookie: string) => {
      const controle = new AbortController()
      const r = await fetch(`http://127.0.0.1:${porta}/v1/portal/notificacoes/fluxo`, {
        headers: { Cookie: cookie, Accept: 'text/event-stream' },
        signal: controle.signal,
      })
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type')).toContain('text/event-stream')
      const leitor = r.body?.getReader()
      const decoder = new TextDecoder()
      const dados = { texto: '' }
      void (async () => {
        try {
          for (;;) {
            const lido = await leitor?.read()
            if (!lido || lido.done) return
            dados.texto += decoder.decode(lido.value as Uint8Array)
          }
        } catch {
          /* conexão encerrada */
        }
      })()
      return { dados, fechar: () => controle.abort() }
    }
    const ana = await abrirFluxo(c.cookieAna)
    const carla = await abrirFluxo(c.cookieCarla)
    await esperarAte(() =>
      Promise.resolve(
        ana.dados.texto.includes('event: sinal') && carla.dados.texto.includes('event: sinal'),
      ),
    )
    await esperarAte(async () => {
      const [, n] = (await valkey.call(
        'PUBSUB',
        'NUMSUB',
        `leadtogo:fila:notif:${c.e.d.tenantId}:${c.ana.contatoId}`,
      )) as [string, number]
      return n >= 1
    })

    await crm('post', c.e.d.cookie, `/chamados/${ch.id}/mensagens`, { corpo: 'Olá, Ana.' })
    await esperarAte(() => Promise.resolve(ana.dados.texto.includes('event: nova')))
    expect(ana.dados.texto).toContain('"tipo":"chamado.mensagem"')
    expect(ana.dados.texto).toContain('Nova resposta da equipe')
    expect(carla.dados.texto).not.toContain('event: nova')

    const tempoReal = app.get(TempoRealDoSino)
    ana.fechar()
    carla.fechar()
    await esperarAte(() => Promise.resolve(tempoReal.conexoes === 0))
    const sem = await fetch(`http://127.0.0.1:${porta}/v1/portal/notificacoes/fluxo`)
    expect(sem.status).toBe(401)
    await sem.body?.cancel()
  })
})
