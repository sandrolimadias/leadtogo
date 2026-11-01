import type { Server } from 'node:http'

import { diaNoFuso } from '@leadtogo/shared'
import type { Chamado, ChamadoDoPortal, IndicadoresDoHub, TarefaDoChamado } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant, PERMISSOES } from '../testes/chamados.js'
import { esperarAte } from '../testes/espera.js'
import { limparCaixa } from '../testes/mailpit.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  entrarNoPortal,
  novaEmpresaCliente,
  novoAcesso,
} from '../testes/portal.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'

let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)
const erroDe = (r: { body: unknown }) => (r.body as RespostaDeErro).erro

beforeAll(async () => {
  app = await criarAppComRotas([], configuracaoDeTeste(configuracaoDoPortalDeTeste))
  worker = await subirWorkerDeTeste()
  await limparCaixa()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
})

async function cenario() {
  const e = await empresaDeChamados(app)
  await configurarPortal(e.d.tenantId)
  const juridico = await e.areaPadrao('juridico')
  await noTenant(
    e.d.tenantId,
    (tx) => tx`UPDATE areas_atendimento SET visivel_no_portal = true WHERE id = ${juridico}`,
  )
  const empresaId = await novaEmpresaCliente(e.d)
  const ana = await novoAcesso(e.d, { empresaId, nome: 'Ana Cliente', papel: 'responsavel' })
  const cookieAna = await entrarNoPortal(portal, ana)
  const abrir = async (assunto = 'Chamado do cliente') =>
    (
      await portal('post', '/portal/chamados', {
        cookie: cookieAna,
        corpo: { assunto, areaId: juridico },
      })
    ).body as ChamadoDoPortal
  return { e, juridico, empresaId, ana, cookieAna, abrir }
}

describe('indicadores do hub', () => {
  it('exigem portal.ver; contam só os chamados do portal e calculam prazo, nota, acessos e pedidos', async () => {
    const c = await cenario()
    const semPermissao = await c.e.pessoa('Sem portal', PERMISSOES.solicitante)
    expect((await crm('get', semPermissao.cookie, '/portal-hub/indicadores')).status).toBe(403)

    await noTenant(
      c.e.d.tenantId,
      (tx) => tx`UPDATE areas_atendimento SET meta_resposta_min = 120 WHERE id = ${c.juridico}`,
    )
    const respondido = await c.abrir('Respondido a tempo')
    const atrasado = await c.abrir('Sem resposta e atrasado')
    const resolvido = await c.abrir('Resolvido e avaliado')
    await c.abrir('Recente, ainda no prazo')
    // um interno que cita o cliente não entra
    await crm('post', c.e.d.cookie, '/chamados', {
      assunto: 'Interno que cita o cliente',
      areaId: c.juridico,
      empresaClienteId: c.empresaId,
    })

    await crm('post', c.e.d.cookie, `/chamados/${respondido.id}/mensagens`, { corpo: 'Olá!' })
    await crm('post', c.e.d.cookie, `/chamados/${resolvido.id}/mensagens`, { corpo: 'Resolvendo.' })
    await crm('post', c.e.d.cookie, `/chamados/${resolvido.id}/status`, { status: 'resolvido' })
    await portal('post', `/portal/chamados/${resolvido.id}/avaliacao`, {
      cookie: c.cookieAna,
      corpo: { nota: 4 },
    })
    // o atrasado foi aberto há 10 dias, sem resposta: passou muito da meta de 120 min úteis
    await noTenant(
      c.e.d.tenantId,
      (tx) =>
        tx`UPDATE chamados SET criado_em = now() - interval '10 days' WHERE id = ${atrasado.id}`,
    )
    // a linha do tempo é a base do prazo: envelhece junto
    await noTenant(
      c.e.d.tenantId,
      (tx) =>
        tx`UPDATE chamado_eventos SET em = now() - interval '10 days' WHERE chamado_id = ${atrasado.id}`,
    )
    // um pedido de acesso pendente
    await portal('post', '/portal/pedidos-de-acesso', {
      cookie: c.cookieAna,
      corpo: { nome: 'Colega Novo', email: `novo-${Date.now()}@exemplo.com.br` },
    })

    const r = await crm('get', c.e.d.cookie, '/portal-hub/indicadores')
    expect(r.status).toBe(200)
    const i = r.body as IndicadoresDoHub
    expect(i).toMatchObject({
      periodoDias: 30,
      emAberto: 3,
      prazoEstourando: 1,
      notaMedia: 4,
      avaliacoes: 1,
      acessosAtivos: 1,
      pedidosPendentes: 1,
    })
    // dos que têm meta: respondido a tempo (sim) e o atrasado (não) -> 50%; o resolvido foi respondido a tempo (sim)
    expect(i.primeiraRespostaNoPrazo).toBeGreaterThanOrEqual(50)
    expect((await crm('get', c.e.d.cookie, '/portal-hub/indicadores?dias=3')).status).toBe(400)
    expect(
      ((await crm('get', c.e.d.cookie, '/portal-hub/indicadores?dias=90')).body as IndicadoresDoHub)
        .periodoDias,
    ).toBe(90)

    // com de e ate (o Dashboard): a janela é a desses dias; Em aberto continua sendo do momento
    const hoje = diaNoFuso(new Date())
    const doDia = (await crm('get', c.e.d.cookie, `/portal-hub/indicadores?de=${hoje}&ate=${hoje}`))
      .body as IndicadoresDoHub
    expect(doDia).toMatchObject({ periodoDias: 1, emAberto: 3, notaMedia: 4, avaliacoes: 1 })
    const antiga = (
      await crm('get', c.e.d.cookie, '/portal-hub/indicadores?de=2020-01-01&ate=2020-01-31')
    ).body as IndicadoresDoHub
    expect(antiga).toMatchObject({
      periodoDias: 31,
      emAberto: 3,
      notaMedia: null,
      avaliacoes: 0,
      primeiraRespostaNoPrazo: null,
    })
    expect((await crm('get', c.e.d.cookie, '/portal-hub/indicadores?de=2026-01-01')).status).toBe(
      400,
    )
    expect(
      (await crm('get', c.e.d.cookie, '/portal-hub/indicadores?de=2026-02-01&ate=2026-01-01'))
        .status,
    ).toBe(400)
  })

  it('a lista de chamados filtra por origem', async () => {
    const c = await cenario()
    const doPortal = await c.abrir('Veio do portal')
    const interno = (
      await crm('post', c.e.d.cookie, '/chamados', { assunto: 'Interno', areaId: c.juridico })
    ).body as Chamado
    const so = (await crm('get', c.e.d.cookie, '/chamados?origem=portal')).body as {
      itens: { id: string }[]
    }
    expect(so.itens.map((i) => i.id)).toEqual([doPortal.id])
    const internos = (await crm('get', c.e.d.cookie, '/chamados?origem=interna')).body as {
      itens: { id: string }[]
    }
    expect(internos.itens.map((i) => i.id)).toEqual([interno.id])
  })
})

describe('aguardar resposta do cliente', () => {
  it('escreve e muda o estado numa ação só; o cliente recebe um único aviso, com a mensagem', async () => {
    const c = await cenario()
    const ch = await c.abrir('Preciso de um documento')
    const r = await crm('post', c.e.d.cookie, `/chamados/${ch.id}/aguardar-cliente`, {
      corpo: 'Envie o contrato social, por favor.',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const noCrm = r.body as Chamado
    expect(noCrm.status).toBe('aguardando_cliente')
    expect(noCrm.mensagens.at(-1)?.corpo).toBe('Envie o contrato social, por favor.')
    expect(noCrm.primeiraRespostaEm).not.toBeNull()

    const doCliente = () =>
      noTenant(
        c.e.d.tenantId,
        (tx) =>
          tx<
            { tipo: string; canal: string }[]
          >`SELECT tipo, canal FROM notificacoes WHERE chamado_id = ${ch.id} AND destinatario_tipo = 'contato'`,
      )
    await esperarAte(async () => (await doCliente()).length >= 1)
    await new Promise((r) => setTimeout(r, 500))
    const avisos = (await doCliente()).filter((n) => n.canal === 'sino')
    expect(avisos.map((n) => n.tipo)).toEqual(['chamado.aguardando_cliente'])

    const visto = (await portal('get', `/portal/chamados/${ch.id}`, { cookie: c.cookieAna }))
      .body as ChamadoDoPortal
    expect(visto.estado).toBe('aguardando_voce')
    expect(visto.mensagens.at(-1)?.corpo).toBe('Envie o contrato social, por favor.')
  })

  it('só para chamado do portal, com permissão de atender e mensagem preenchida', async () => {
    const c = await cenario()
    const interno = (
      await crm('post', c.e.d.cookie, '/chamados', { assunto: 'Interno', areaId: c.juridico })
    ).body as Chamado
    const sem = await crm('post', c.e.d.cookie, `/chamados/${interno.id}/aguardar-cliente`, {
      corpo: 'Oi',
    })
    expect(sem.status).toBe(409)
    expect(erroDe(sem)).toBe('chamado_sem_cliente')

    const ch = await c.abrir()
    const leitor = await c.e.pessoa('Leitor', { 'chamados.ver': 'todas' })
    expect(
      (await crm('post', leitor.cookie, `/chamados/${ch.id}/aguardar-cliente`, { corpo: 'x' }))
        .status,
    ).toBe(403)
    expect(
      (await crm('post', c.e.d.cookie, `/chamados/${ch.id}/aguardar-cliente`, { corpo: ' ' }))
        .status,
    ).toBe(400)
    expect(
      (await crm('post', c.e.d.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' }))
        .status,
    ).toBe(200)
    expect(
      (await crm('post', c.e.d.cookie, `/chamados/${ch.id}/aguardar-cliente`, { corpo: 'Ainda?' }))
        .status,
    ).toBe(409)
  })
})

describe('criar tarefa a partir do chamado', () => {
  it('cria a Atividade pendente do tipo Tarefa, ligada ao chamado e à empresa-cliente', async () => {
    const c = await cenario()
    const ch = await c.abrir('Pede contrato')
    const prazo = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const r = await crm('post', c.e.d.cookie, `/chamados/${ch.id}/tarefas`, {
      titulo: 'Enviar o contrato revisado',
      prazo,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const itens = (r.body as { itens: TarefaDoChamado[] }).itens
    expect(itens).toHaveLength(1)
    expect(itens[0]).toMatchObject({ titulo: 'Enviar o contrato revisado', situacao: 'pendente' })
    expect(new Date(itens[0]?.dataInicio ?? '').toISOString()).toBe(prazo)

    const depois = await crm('get', c.e.d.cookie, `/chamados/${ch.id}/tarefas`)
    expect((depois.body as { itens: unknown[] }).itens).toHaveLength(1)
    const [a] = await noTenant(
      c.e.d.tenantId,
      (tx) =>
        tx<
          { empresa_id: string | null; observacoes: string | null }[]
        >`SELECT empresa_id, observacoes FROM atividades WHERE id = ${itens[0]?.id ?? ''}`,
    )
    expect(a?.empresa_id).toBe(c.empresaId)
    expect(a?.observacoes).toContain('Pede contrato')
  })

  it('exige atender e registrar atividades; o chamado precisa ser visível; título obrigatório', async () => {
    const c = await cenario()
    const ch = await c.abrir()
    const soAtende = await c.e.pessoa('Só atende', PERMISSOES.tudo)
    const r = await crm('post', soAtende.cookie, `/chamados/${ch.id}/tarefas`, {
      titulo: 'Algo a fazer',
    })
    expect(r.status).toBe(403)
    expect(erroDe(r)).toBe('acesso_negado')
    expect(
      (await crm('post', c.e.d.cookie, `/chamados/${ch.id}/tarefas`, { titulo: '' })).status,
    ).toBe(400)
    expect(
      (
        await crm('post', c.e.d.cookie, `/chamados/${crypto.randomUUID()}/tarefas`, {
          titulo: 'Fantasma',
        })
      ).status,
    ).toBe(404)
    expect(
      (await crm('get', c.e.d.cookie, `/chamados/${crypto.randomUUID()}/tarefas`)).status,
    ).toBe(404)
  })
})
