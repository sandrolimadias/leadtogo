/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- os corpos JSON do supertest chegam como any */
import type { Server } from 'node:http'

import { criarConexao, novoId } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { esperarAte } from '../testes/espera.js'
import { aguardarMensagem, limparCaixa, mensagensPara } from '../testes/mailpit.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  entrarNoPortal,
  novaEmpresaCliente,
  novoAcesso,
} from '../testes/portal.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import { processadorDeManutencao } from '../worker/manutencao.js'
import type { EnviadorDePush, ResultadoDoPush } from './push.js'

const VAPID = {
  VAPID_PUBLIC_KEY: 'BPublicaDeTesteDoPortalDeAvisosComMaisDe20Caracteres',
  VAPID_PRIVATE_KEY: 'PrivadaDeTesteDoPortalDeAvisosComMaisDe20Caracteres',
  VAPID_SUBJECT: 'mailto:teste@exemplo.com.br',
}

interface PushFalso {
  endpoint: string
  payload: Record<string, unknown>
}
const enviados: PushFalso[] = []
let respostaDoPush: ResultadoDoPush = 'ok'
const enviadorFalso: EnviadorDePush = {
  enviar: (i, payload) => {
    enviados.push({ endpoint: i.endpoint, payload: JSON.parse(payload) as Record<string, unknown> })
    return Promise.resolve(respostaDoPush)
  },
}

let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)

beforeAll(async () => {
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({ ...configuracaoDoPortalDeTeste, ...VAPID }),
  )
  worker = await subirWorkerDeTeste(VAPID, enviadorFalso)
  await limparCaixa()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
})

const emHoras = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

interface Cliente {
  cookie: string
  email: string
  acessoId: string
  contatoId: string
}

/** Empresa da equipe com portal ligado; empresas-clientes A (2 pessoas) e B (1); gestor dos avisos e leitor. */
async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  await configurarPortal(d.tenantId)
  const empresaA = await novaEmpresaCliente(d)
  const empresaB = await novaEmpresaCliente(d)
  const gestor = await pessoa('Gestor dos avisos', { 'portal.avisos': null })
  const leitor = await pessoa('Leitor', { 'portal.ver': null })
  const semPortal = await pessoa('Sem portal', { 'chamados.ver': 'propria' })
  const clientes: Cliente[] = []
  const novo = async (empresaId: string, nome: string) => {
    const a = await novoAcesso(d, { empresaId, nome })
    const c = {
      cookie: await entrarNoPortal(portal, a),
      email: a.email,
      acessoId: a.acessoId,
      contatoId: a.contatoId,
    }
    clientes.push(c)
    return c
  }
  await novo(empresaA, 'Ana Alves')
  await novo(empresaA, 'Alex Abreu')
  await novo(empresaB, 'Bruno Barros')
  return { d, empresaA, empresaB, gestor, leitor, semPortal, clientes }
}
type Cenario = Awaited<ReturnType<typeof cenario>>

const corpo = (extra: Record<string, unknown> = {}) => ({
  mensagem: 'O expediente de sexta termina às 14h',
  alcance: 'todos',
  ...extra,
})
const enviar = (c: Cenario, extra: Record<string, unknown> = {}) =>
  crm('post', c.gestor.cookie, '/portal-avisos', corpo(extra))

const sinoDe = (c: Cenario, cliente: Cliente) =>
  noTenant(
    c.d.tenantId,
    (tx) =>
      tx<
        { id: string; titulo: string; mensagem: string | null; canal: string }[]
      >`SELECT id, titulo, mensagem, canal FROM notificacoes WHERE contato_id = ${cliente.contatoId} AND tipo = 'aviso' AND canal = 'sino' ORDER BY criado_em`,
  )

const inscrever = async (cliente: Cliente, endpoint = `https://push.exemplo.com/${novoId()}`) => {
  const r = await portal('post', '/portal/push/inscricoes', {
    cookie: cliente.cookie,
    corpo: { endpoint, keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' } },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return endpoint
}

async function manutencao(tarefa: string): Promise<number> {
  const banco = criarConexao(configuracaoDeTeste().DATABASE_URL, { max: 2 })
  try {
    const rodar = processadorDeManutencao(
      banco,
      pino({ level: 'silent' }),
      undefined,
      enviadorFalso,
    )
    const r = await rodar({ name: tarefa } as Parameters<
      ReturnType<typeof processadorDeManutencao>
    >[0])
    return r.resultado
  } finally {
    await banco.cliente.end({ timeout: 5 })
  }
}

describe('permissões', () => {
  it('ver lista; avisos escreve; sem permissão é 403; o cliente não usa as rotas da equipe', async () => {
    const c = await cenario()
    const criado = await enviar(c)
    expect(criado.status, JSON.stringify(criado.body)).toBe(201)
    for (const [pessoa, esperado] of [
      [c.leitor, 200],
      [c.gestor, 200],
      [c.semPortal, 403],
    ] as const) {
      expect((await crm('get', pessoa.cookie, '/portal-avisos')).status).toBe(esperado)
    }
    expect((await crm('post', c.leitor.cookie, '/portal-avisos', corpo())).status).toBe(403)
    expect(
      (await crm('post', c.leitor.cookie, `/portal-avisos/${criado.body.id}/cancelar`)).status,
    ).toBe(403)
    expect((await crm('get', c.clientes[0]?.cookie ?? '', '/portal-avisos')).status).toBe(401)
    expect((await portal('get', '/portal/preferencias')).status).toBe(401)
    expect((await portal('get', '/portal/busca?q=abc')).status).toBe(401)
  })

  it('portal desligado não envia aviso (409)', async () => {
    const c = await cenario()
    await configurarPortal(c.d.tenantId, { ativo: false })
    const r = await enviar(c)
    expect(r.status).toBe(409)
    expect(r.body.erro).toBe('portal_desligado')
  })
})

describe('enviar agora', () => {
  it('chega no sino e no e-mail de todos; conta entregues e lidos; ler a notificação marca o aviso como lido', async () => {
    const c = await cenario()
    const [ana, alex, bruno] = c.clientes as [Cliente, Cliente, Cliente]
    await limparCaixa()
    const r = await enviar(c)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body).toMatchObject({ situacao: 'agendado', urgencia: 'normal', alcance: 'todos' })
    const id = r.body.id as string

    for (const cliente of c.clientes) {
      await esperarAte(async () => (await sinoDe(c, cliente)).length === 1)
    }
    const [sino] = await sinoDe(c, ana)
    expect(sino).toMatchObject({
      titulo: 'Aviso',
      mensagem: 'O expediente de sexta termina às 14h',
    })
    expect((await aguardarMensagem(bruno.email)).Subject).toMatch(/aviso/i)

    const lista = await crm('get', c.leitor.cookie, '/portal-avisos')
    const item = lista.body.itens.find((a: { id: string }) => a.id === id)
    expect(item).toMatchObject({
      situacao: 'enviado',
      destinatarios: 3,
      entregues: 3,
      lidos: 0,
      emailsEnfileirados: 3,
    })
    expect(item.enviadoEm).not.toBeNull()

    // O cliente lê a notificação: o aviso conta como lido (só dele)
    const lida = await portal('post', `/portal/notificacoes/${sino?.id}/lida`, {
      cookie: ana.cookie,
    })
    expect(lida.status, JSON.stringify(lida.body)).toBeLessThan(300)
    expect((await crm('get', c.leitor.cookie, '/portal-avisos')).body.itens[0].lidos).toBe(1)
    const todas = await portal('post', '/portal/notificacoes/lidas', { cookie: alex.cookie })
    expect(todas.status).toBeLessThan(300)
    expect((await crm('get', c.leitor.cookie, '/portal-avisos')).body.itens[0].lidos).toBe(2)
  })

  it('o aviso de um segmento chega só às empresas escolhidas; empresa inexistente é 422', async () => {
    const c = await cenario()
    const [ana, , bruno] = c.clientes as [Cliente, Cliente, Cliente]
    const r = await enviar(c, { alcance: 'empresas', empresaIds: [c.empresaB] })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.empresas).toHaveLength(1)
    await esperarAte(async () => (await sinoDe(c, bruno)).length === 1)
    expect(await sinoDe(c, ana)).toHaveLength(0)
    const lista = await crm('get', c.leitor.cookie, '/portal-avisos')
    expect(lista.body.itens[0]).toMatchObject({ destinatarios: 1, entregues: 1 })

    const ruim = await enviar(c, { alcance: 'empresas', empresaIds: [novoId()] })
    expect(ruim.status).toBe(422)
  })

  it('valida a mensagem (140), o link e o alcance', async () => {
    const c = await cenario()
    expect((await enviar(c, { mensagem: 'x'.repeat(141) })).status).toBe(400)
    expect((await enviar(c, { mensagem: '   ' })).status).toBe(400)
    expect((await enviar(c, { link: 'javascript:alert(1)' })).status).toBe(400)
    expect((await enviar(c, { link: '//evil.com' })).status).toBe(400)
    expect((await enviar(c, { alcance: 'empresas', empresaIds: [] })).status).toBe(400)
    const ok = await enviar(c, { link: '/agenda' })
    expect(ok.status).toBe(201)
    expect(ok.body.link).toBe('/agenda')
  })
})

describe('limite semanal', () => {
  it('3 avisos normais por empresa por semana; o urgente não conta; outra semana e outra empresa têm o seu limite', async () => {
    const c = await cenario()
    for (let i = 0; i < 3; i++) {
      expect((await enviar(c, { mensagem: `Aviso ${i}` })).status).toBe(201)
    }
    const quarto = await enviar(c, { mensagem: 'Aviso 4' })
    expect(quarto.status).toBe(409)
    expect(quarto.body.erro).toBe('limite_semanal')
    // o urgente passa, e não consome o limite
    expect((await enviar(c, { urgencia: 'urgente', mensagem: 'Urgente' })).status).toBe(201)
    // na semana seguinte (agendado) o limite é novo
    expect(
      (await enviar(c, { enviarEm: emHoras(24 * 8), mensagem: 'Semana que vem' })).status,
    ).toBe(201)
    const lista = await crm('get', c.leitor.cookie, '/portal-avisos')
    expect(lista.body.semana).toEqual({ usados: 3, limite: 3 })
  })

  it('o limite é por empresa: o segmento de B não é barrado pelos avisos só de A, mas os "todos" contam para as duas', async () => {
    const c = await cenario()
    for (let i = 0; i < 3; i++) {
      expect((await enviar(c, { alcance: 'empresas', empresaIds: [c.empresaA] })).status).toBe(201)
    }
    expect((await enviar(c, { alcance: 'empresas', empresaIds: [c.empresaA] })).status).toBe(409)
    expect((await enviar(c, { alcance: 'empresas', empresaIds: [c.empresaB] })).status).toBe(201)
    // "todos" alcança A, que já está no limite
    expect((await enviar(c)).status).toBe(409)
  })

  it('o limite é configurável (1 a 20) em /portal-configuracao', async () => {
    const c = await cenario()
    const admin = c.d.cookie
    const antes = await crm('get', admin, '/portal-configuracao')
    expect(antes.body.avisosLimiteSemanal).toBe(3)
    expect(
      (await crm('put', admin, '/portal-configuracao', { avisosLimiteSemanal: 0 })).status,
    ).toBe(400)
    expect(
      (await crm('put', admin, '/portal-configuracao', { avisosLimiteSemanal: 21 })).status,
    ).toBe(400)
    const depois = await crm('put', admin, '/portal-configuracao', { avisosLimiteSemanal: 1 })
    expect(depois.status, JSON.stringify(depois.body)).toBe(200)
    expect(depois.body.avisosLimiteSemanal).toBe(1)
    expect((await enviar(c)).status).toBe(201)
    expect((await enviar(c)).status).toBe(409)
  })
})

describe('agendar e cancelar', () => {
  it('o agendado não sai antes da hora; cancelar impede o envio; horário no passado é 422', async () => {
    const c = await cenario()
    const [ana] = c.clientes as [Cliente]
    const r = await enviar(c, { enviarEm: emHoras(2) })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.situacao).toBe('agendado')
    await manutencao('enviar-avisos')
    expect(await sinoDe(c, ana)).toHaveLength(0)

    const cancelado = await crm('post', c.gestor.cookie, `/portal-avisos/${r.body.id}/cancelar`)
    expect(cancelado.status).toBe(200)
    expect(cancelado.body.situacao).toBe('cancelado')
    expect(
      (await crm('post', c.gestor.cookie, `/portal-avisos/${r.body.id}/cancelar`)).status,
    ).toBe(409)

    // mesmo vencido, o cancelado não é enviado
    await noTenant(
      c.d.tenantId,
      (tx) => tx`UPDATE avisos SET enviar_em = now() - interval '1 minute' WHERE id = ${r.body.id}`,
    )
    await manutencao('enviar-avisos')
    expect(await sinoDe(c, ana)).toHaveLength(0)

    expect((await enviar(c, { enviarEm: emHoras(-1) })).status).toBe(422)
    expect((await crm('post', c.gestor.cookie, `/portal-avisos/${novoId()}/cancelar`)).status).toBe(
      404,
    )
  })

  it('a varredura de cada minuto entrega o agendado que venceu, uma vez só; o enviado não se cancela', async () => {
    const c = await cenario()
    const [ana, , bruno] = c.clientes as [Cliente, Cliente, Cliente]
    const r = await enviar(c, { enviarEm: emHoras(1) })
    await noTenant(
      c.d.tenantId,
      (tx) => tx`UPDATE avisos SET enviar_em = now() - interval '1 minute' WHERE id = ${r.body.id}`,
    )
    expect(await manutencao('enviar-avisos')).toBeGreaterThanOrEqual(1)
    await esperarAte(async () => (await sinoDe(c, bruno)).length === 1)
    expect(await sinoDe(c, ana)).toHaveLength(1)
    // a segunda rodada não repete
    expect(await manutencao('enviar-avisos')).toBe(0)
    expect(await sinoDe(c, ana)).toHaveLength(1)
    const tarde = await crm('post', c.gestor.cookie, `/portal-avisos/${r.body.id}/cancelar`)
    expect(tarde.status).toBe(409)
    expect(tarde.body.erro).toBe('aviso_ja_enviado')
  })
})

describe('preferências', () => {
  it('padrão, salvar, validar e isolamento entre pessoas', async () => {
    const c = await cenario()
    const [ana, alex] = c.clientes as [Cliente, Cliente]
    const padrao = await portal('get', '/portal/preferencias', { cookie: ana.cookie })
    expect(padrao.body).toEqual({
      silencioInicio: null,
      silencioFim: null,
      emailChamados: true,
      emailEventos: true,
      emailAvisos: true,
      tema: 'sistema',
    })
    const salva = await portal('put', '/portal/preferencias', {
      cookie: ana.cookie,
      corpo: {
        silencioInicio: '22:00',
        silencioFim: '07:00',
        emailChamados: true,
        emailEventos: false,
        emailAvisos: false,
      },
    })
    expect(salva.status, JSON.stringify(salva.body)).toBe(200)
    expect(salva.body).toMatchObject({
      silencioInicio: '22:00',
      silencioFim: '07:00',
      emailEventos: false,
    })
    // atualizar de novo (upsert)
    const outra = await portal('put', '/portal/preferencias', {
      cookie: ana.cookie,
      corpo: { ...salva.body, emailAvisos: true, silencioInicio: null, silencioFim: null },
    })
    expect(outra.body).toMatchObject({ emailAvisos: true, silencioInicio: null })
    // a colega não vê a de Ana
    expect(
      (await portal('get', '/portal/preferencias', { cookie: alex.cookie })).body.emailEventos,
    ).toBe(true)
    // validações
    for (const ruim of [
      { silencioInicio: '22:00', silencioFim: null },
      { silencioInicio: '22:00', silencioFim: '22:00' },
      { silencioInicio: '25:00', silencioFim: '07:00' },
    ]) {
      const r = await portal('put', '/portal/preferencias', {
        cookie: ana.cookie,
        corpo: { emailChamados: true, emailEventos: true, emailAvisos: true, ...ruim },
      })
      expect(r.status).toBe(400)
    }
  })

  it('quem desligou o e-mail dos avisos recebe só o sino', async () => {
    const c = await cenario()
    const [ana, alex] = c.clientes as [Cliente, Cliente]
    await portal('put', '/portal/preferencias', {
      cookie: ana.cookie,
      corpo: {
        silencioInicio: null,
        silencioFim: null,
        emailChamados: true,
        emailEventos: true,
        emailAvisos: false,
      },
    })
    await limparCaixa()
    expect((await enviar(c)).status).toBe(201)
    await esperarAte(async () => (await sinoDe(c, ana)).length === 1)
    expect((await aguardarMensagem(alex.email)).Subject).toMatch(/aviso/i)
    expect(await mensagensPara(ana.email)).toHaveLength(0)
  })
})

describe('push', () => {
  it('a configuração traz a chave pública; inscrever é idempotente e remover revoga', async () => {
    const c = await cenario()
    const [ana, alex] = c.clientes as [Cliente, Cliente]
    const antes = await portal('get', '/portal/push/configuracao', { cookie: ana.cookie })
    expect(antes.body).toEqual({
      disponivel: true,
      chavePublica: VAPID.VAPID_PUBLIC_KEY,
      inscricoes: 0,
    })
    const endpoint = await inscrever(ana)
    expect((await inscrever(ana, endpoint).then(() => 'ok')) satisfies string).toBe('ok')
    expect(
      (await portal('get', '/portal/push/configuracao', { cookie: ana.cookie })).body.inscricoes,
    ).toBe(1)
    // outra conta no mesmo aparelho: recusado
    const emUso = await portal('post', '/portal/push/inscricoes', {
      cookie: alex.cookie,
      corpo: { endpoint, keys: { p256dh: 'x', auth: 'y' } },
    })
    expect(emUso.status).toBe(409)
    expect(emUso.body.erro).toBe('aparelho_em_uso')
    // validação
    expect(
      (
        await portal('post', '/portal/push/inscricoes', {
          cookie: ana.cookie,
          corpo: { endpoint: 'nao-e-url', keys: {} },
        })
      ).status,
    ).toBe(400)
    const removida = await portal('delete', '/portal/push/inscricoes', {
      cookie: ana.cookie,
      corpo: { endpoint },
    })
    expect(removida.status).toBe(200)
    expect(removida.body.inscricoes).toBe(0)
  })

  it('o urgente sai na hora, mesmo no silêncio; o normal em silêncio espera o fim dele', async () => {
    const c = await cenario()
    const [ana] = c.clientes as [Cliente]
    const endpoint = await inscrever(ana)
    // silêncio que cobre o momento atual (de 1 h atrás a 1 h à frente, em Brasília)
    const hhmm = (deslocamentoHoras: number) => {
      const d = new Date(Date.now() + deslocamentoHoras * 3_600_000)
      const partes = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'America/Sao_Paulo',
      }).format(d)
      return partes
    }
    const salva = await portal('put', '/portal/preferencias', {
      cookie: ana.cookie,
      corpo: {
        silencioInicio: hhmm(-1),
        silencioFim: hhmm(1),
        emailChamados: true,
        emailEventos: true,
        emailAvisos: false,
      },
    })
    expect(salva.status, JSON.stringify(salva.body)).toBe(200)

    // urgente: chega agora
    expect((await enviar(c, { urgencia: 'urgente', mensagem: 'Servidor fora do ar' })).status).toBe(
      201,
    )
    await esperarAte(() => Promise.resolve(enviados.some((e) => e.endpoint === endpoint)))
    const urgente = enviados.find((e) => e.endpoint === endpoint)
    expect(urgente?.payload).toMatchObject({ corpo: 'Servidor fora do ar', urgente: true })

    // normal: fica agendado para o fim do silêncio
    expect((await enviar(c, { mensagem: 'Sexta termina às 14h' })).status).toBe(201)
    await esperarAte(async () => (await sinoDe(c, ana)).length === 2)
    const [normal] = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ push_enviar_em: Date; push_enviado_em: Date | null }[]>`
          SELECT e.push_enviar_em, e.push_enviado_em FROM aviso_entregas e JOIN avisos a ON a.id = e.aviso_id
          WHERE a.urgencia = 'normal' AND e.acesso_id = ${ana.acessoId}`,
    )
    expect(normal?.push_enviado_em).toBeNull()
    expect(new Date(normal?.push_enviar_em ?? 0).getTime()).toBeGreaterThan(
      Date.now() + 30 * 60_000,
    )
    await manutencao('enviar-pushes')
    expect(enviados.filter((e) => e.endpoint === endpoint)).toHaveLength(1)

    // passou o silêncio: a varredura envia, uma vez só
    await noTenant(
      c.d.tenantId,
      (tx) =>
        tx`UPDATE aviso_entregas SET push_enviar_em = now() - interval '1 minute' WHERE push_enviado_em IS NULL AND acesso_id = ${ana.acessoId}`,
    )
    expect(await manutencao('enviar-pushes')).toBe(1)
    expect(enviados.filter((e) => e.endpoint === endpoint)).toHaveLength(2)
    expect(await manutencao('enviar-pushes')).toBe(0)
    expect(enviados.filter((e) => e.endpoint === endpoint)).toHaveLength(2)
    const lista = await crm('get', c.leitor.cookie, '/portal-avisos')
    expect(
      lista.body.itens.reduce((n: number, a: { pushEnviados: number }) => n + a.pushEnviados, 0),
    ).toBe(2)
  })

  it('quando o serviço de push diz que o aparelho não existe mais (410), a inscrição é revogada', async () => {
    const c = await cenario()
    const [ana] = c.clientes as [Cliente]
    const endpoint = await inscrever(ana)
    respostaDoPush = 'expirada'
    try {
      expect((await enviar(c, { urgencia: 'urgente' })).status).toBe(201)
      await esperarAte(() => Promise.resolve(enviados.some((e) => e.endpoint === endpoint)))
      await esperarAte(
        async () =>
          (await portal('get', '/portal/push/configuracao', { cookie: ana.cookie })).body
            .inscricoes === 0,
      )
    } finally {
      respostaDoPush = 'ok'
    }
  })

  it('sem inscrição não há push; o aviso segue pelo sino', async () => {
    const c = await cenario()
    const [ana] = c.clientes as [Cliente]
    expect((await enviar(c, { urgencia: 'urgente' })).status).toBe(201)
    await esperarAte(async () => (await sinoDe(c, ana)).length === 1)
    const [e] = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<
          { push_enviar_em: Date | null }[]
        >`SELECT push_enviar_em FROM aviso_entregas WHERE acesso_id = ${ana.acessoId}`,
    )
    expect(e?.push_enviar_em).toBeNull()
  })
})

describe('busca global', () => {
  it('acha chamados da própria empresa, documentos, eventos e publicações, sem acento; não vaza o que é de outro cliente', async () => {
    const c = await cenario()
    const [ana, alex, bruno] = c.clientes as [Cliente, Cliente, Cliente]
    // chamado de Ana (empresa A)
    const chamado = await portal('post', '/portal/chamados', {
      cookie: ana.cookie,
      corpo: { assunto: 'Nota fiscal duplicada em janeiro', descricao: 'Segue o número' },
    })
    expect(chamado.status, JSON.stringify(chamado.body)).toBe(201)
    // publicação, evento e documento visíveis a todos
    const pub = await crm('post', c.d.cookie, '/portal-publicacoes', {
      titulo: 'Novidades da versão',
      corpo: 'Chegou a **conciliação automática** de notas',
      alcance: 'todos',
      situacao: 'publicada',
    })
    expect(pub.status, JSON.stringify(pub.body)).toBe(201)
    const ev = await crm('post', c.d.cookie, '/portal-eventos', {
      titulo: 'Treinamento de conciliação',
      descricao: null,
      local: 'Auditório',
      linkOnline: null,
      inicioEm: emHoras(24 * 9),
      fimEm: emHoras(24 * 9 + 2),
      vagasTotais: null,
      vagasPorEmpresa: null,
      prazoConfirmacao: null,
      alcance: 'todos',
      empresaIds: [],
    })
    expect(ev.status, JSON.stringify(ev.body)).toBe(201)
    expect((await crm('post', c.d.cookie, `/portal-eventos/${ev.body.id}/publicar`)).status).toBe(
      200,
    )
    const rascunho = await crm('post', c.d.cookie, '/portal-eventos', {
      titulo: 'Rascunho de conciliação secreta',
      descricao: null,
      local: null,
      linkOnline: null,
      inicioEm: emHoras(24 * 9),
      fimEm: emHoras(24 * 9 + 2),
      vagasTotais: null,
      vagasPorEmpresa: null,
      prazoConfirmacao: null,
      alcance: 'todos',
      empresaIds: [],
    })
    expect(rascunho.status).toBe(201)
    await noTenant(c.d.tenantId, async (tx) => {
      await tx`INSERT INTO documentos (id, tenant_id, titulo, descricao, chave_arquivo, nome, mime, tamanho, estado, enviado_em)
        VALUES (${novoId()}, ${c.d.tenantId}, 'Manual de conciliação', NULL, ${`t/${novoId()}`}, 'manual.pdf', 'application/pdf', 1000, 'limpo', now())`
      await tx`INSERT INTO documentos (id, tenant_id, titulo, descricao, chave_arquivo, nome, mime, tamanho, estado, enviado_em)
        VALUES (${novoId()}, ${c.d.tenantId}, 'Conciliação ainda sem varredura', NULL, ${`t/${novoId()}`}, 'x.pdf', 'application/pdf', 1000, 'pendente_varredura', now())`
    })

    const busca = async (cliente: Cliente, q: string) => {
      const r = await portal('get', `/portal/busca?q=${encodeURIComponent(q)}`, {
        cookie: cliente.cookie,
      })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      return r.body.itens as { tipo: string; titulo: string; destino: string }[]
    }

    // "conciliacao" sem acento acha publicação, evento (publicado) e documento (limpo): nunca o rascunho nem o não varrido
    const itens = await busca(bruno, 'CONCILIACAO')
    expect(itens.map((i) => `${i.tipo}:${i.titulo}`).sort()).toEqual([
      'documento:Manual de conciliação',
      'evento:Treinamento de conciliação',
      'publicacao:Novidades da versão',
    ])
    expect(itens.find((i) => i.tipo === 'evento')?.destino).toBe('/agenda')

    // o chamado só aparece para a empresa dele (Ana e Alex, empresa A); Bruno, da B, não vê
    expect((await busca(ana, 'nota fiscal')).map((i) => i.tipo)).toContain('chamado')
    expect((await busca(alex, 'duplicada')).map((i) => i.tipo)).toContain('chamado')
    expect((await busca(bruno, 'nota fiscal')).map((i) => i.tipo)).not.toContain('chamado')
    // pelo número também
    const numero = Number(String(chamado.body.codigo).replace(/\D/g, ''))
    expect(
      (await busca(ana, String(numero).padStart(4, '0'))).some((i) => i.tipo === 'chamado'),
    ).toBe(true)
    expect((await busca(ana, String(chamado.body.codigo))).some((i) => i.tipo === 'chamado')).toBe(
      true,
    )

    // % e _ valem como texto; termo curto é 400
    expect(await busca(ana, '100%')).toEqual([])
    expect((await portal('get', '/portal/busca?q=a', { cookie: ana.cookie })).status).toBe(400)
  })
})
