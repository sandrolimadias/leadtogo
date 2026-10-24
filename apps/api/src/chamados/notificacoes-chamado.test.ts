import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { criarConexao, novoId, sql } from '@leadtogo/db'
import type { Chamado, ListaDeNotificacoes } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TempoRealDoSino } from '../notificacoes/tempo-real.service.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { esperarAte } from '../testes/espera.js'
import { aguardarMensagem, limparCaixa, mensagensPara } from '../testes/mailpit.js'
import { dono } from '../testes/mundo.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import {
  chamarEm,
  empresaDeChamados,
  noTenant,
  PERMISSOES,
  type Pessoa,
} from '../testes/chamados.js'
import {
  EVENTO_NOTIFICAR_CHAMADO,
  idDeterministico,
  manipuladorDeNotificacaoDeChamado,
} from './notificar-chamado.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const chamar = chamarEm(() => app)

beforeAll(async () => {
  await limparLimitesAuth(valkey)
  await limparCaixa()
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
  worker = await subirWorkerDeTeste()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
  await valkey.quit()
  await dono.end()
})

const emailUnico = () => `p-${novoId().slice(-12)}@exemplo.com`

/** Empresa com solicitante, atendente da área Jurídico (com e-mail) e um admin; triagem desligada. */
async function cenario() {
  const e = await empresaDeChamados(app)
  const juridico = await e.areaPadrao('juridico')
  const solicitante = await e.pessoa('Solicitante', PERMISSOES.solicitante)
  const atendente = await e.pessoa('Atendente', PERMISSOES.atendente)
  const outra = await e.pessoa('Outra atendente', PERMISSOES.atendente)
  const emails = { solicitante: emailUnico(), atendente: emailUnico(), outra: emailUnico() }
  await noTenant(e.d.tenantId, async (tx) => {
    await tx`UPDATE membros SET email = ${emails.solicitante} WHERE id = ${solicitante.membroId}`
    await tx`UPDATE membros SET email = ${emails.atendente} WHERE id = ${atendente.membroId}`
    await tx`UPDATE membros SET email = ${emails.outra} WHERE id = ${outra.membroId}`
  })
  await chamar('put', e.d.cookie, `/chamados/areas/${juridico}/membros`, {
    membros: [{ membroId: atendente.membroId }, { membroId: outra.membroId }],
    perfilIds: [],
  })
  const abrir = async () =>
    (
      await chamar('post', solicitante.cookie, '/chamados', {
        assunto: 'Contrato do cliente X',
        areaId: juridico,
      })
    ).body as Chamado
  const sino = async (p: Pessoa | string, qs = '') =>
    (await chamar('get', typeof p === 'string' ? p : p.cookie, `/notificacoes${qs}`))
      .body as ListaDeNotificacoes
  return { e, juridico, solicitante, atendente, outra, emails, abrir, sino }
}

const titulos = (l: ListaDeNotificacoes) => l.itens.map((i) => i.tipo).sort()

describe('quem é avisado (sino)', () => {
  it('chamado novo na área: avisa os membros da área, nunca quem abriu', async () => {
    const c = await cenario()
    const ch = await c.abrir()
    await esperarAte(async () => (await c.sino(c.atendente)).naoLidas === 1)
    const a = await c.sino(c.atendente)
    expect(a.itens[0]).toMatchObject({
      tipo: 'chamado.aberto',
      titulo: 'CH-0001 · Novo chamado',
      mensagem: 'Contrato do cliente X',
      link: `/chamados/${ch.id}`,
      chamadoId: ch.id,
      lida: false,
    })
    await esperarAte(async () => (await c.sino(c.outra)).naoLidas === 1)
    expect((await c.sino(c.solicitante)).total).toBe(0)
    expect((await c.sino(c.e.d.cookie)).total).toBe(0)
    // chamado novo para a área não manda e-mail (aviso de grupo: só o sino)
    expect(await mensagensPara(c.emails.atendente)).toEqual([])
  })

  it('triagem: avisa só quem tria; ao triar com responsável, avisa o responsável (sino e e-mail)', async () => {
    const c = await cenario()
    const triador = await c.e.pessoa('Triador', PERMISSOES.triador)
    await chamar('put', c.e.d.cookie, '/chamados/triagem', {
      ativa: true,
      perfilId: null,
      membroIds: [triador.membroId],
    })
    const ch = await c.abrir()
    await esperarAte(async () => (await c.sino(triador)).naoLidas === 1)
    expect((await c.sino(triador)).itens[0]?.titulo).toBe('CH-0001 · Novo chamado')
    expect((await c.sino(c.atendente)).total).toBe(0)

    await chamar('post', triador.cookie, `/chamados/${ch.id}/triar`, {
      areaId: c.juridico,
      responsavelId: c.atendente.membroId,
    })
    await esperarAte(async () => titulos(await c.sino(c.atendente)).includes('chamado.triado'))
    const email = await aguardarMensagem(c.emails.atendente)
    expect(email.Subject).toBe('CH-0001 · Chamado triado para a sua área')
    expect(email.Text).toContain('Contrato do cliente X')
    expect(email.Text).toContain(`/chamados/${ch.id}`)
    // quem tria não é avisado do que ele mesmo fez
    expect((await c.sino(triador)).total).toBe(1)
  })

  it('conversa: a resposta da equipe avisa o solicitante (sino e e-mail, com prévia); a do solicitante avisa o responsável', async () => {
    const c = await cenario()
    const ch = await c.abrir()
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/assumir`)
    await esperarAte(async () => titulos(await c.sino(c.solicitante)).includes('chamado.assumido'))
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/mensagens`, {
      corpo: 'Preciso do contrato social.',
    })
    await esperarAte(async () => titulos(await c.sino(c.solicitante)).includes('chamado.mensagem'))
    const doSolicitante = (await c.sino(c.solicitante)).itens.find(
      (i) => i.tipo === 'chamado.mensagem',
    )
    expect(doSolicitante?.mensagem).toBe(
      'Contrato do cliente X — Atendente: Preciso do contrato social.',
    )
    const email = await aguardarMensagem(c.emails.solicitante)
    expect(email.Text).toContain('Preciso do contrato social.')

    await chamar('post', c.solicitante.cookie, `/chamados/${ch.id}/mensagens`, {
      corpo: 'Segue em anexo.',
    })
    await esperarAte(async () => titulos(await c.sino(c.atendente)).includes('chamado.mensagem'))
    // a outra atendente da área não recebe: há responsável, o aviso é dele
    expect(titulos(await c.sino(c.outra))).not.toContain('chamado.mensagem')
  })

  it('aguardando cliente, resolvido e reaberto avisam as pessoas certas; nota interna não avisa ninguém', async () => {
    const c = await cenario()
    const ch = await c.abrir()
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/assumir`)
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/status`, {
      status: 'aguardando_cliente',
    })
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/notas`, {
      corpo: 'Segredo da equipe',
    })
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/status`, {
      status: 'em_atendimento',
    })
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' })
    await esperarAte(async () => titulos(await c.sino(c.solicitante)).includes('chamado.resolvido'))
    expect(titulos(await c.sino(c.solicitante))).toEqual([
      'chamado.aguardando_cliente',
      'chamado.assumido',
      'chamado.resolvido',
    ])
    await chamar('post', c.solicitante.cookie, `/chamados/${ch.id}/reabrir`)
    await esperarAte(async () => titulos(await c.sino(c.atendente)).includes('chamado.reaberto'))
    const todas =
      JSON.stringify(await c.sino(c.solicitante)) + JSON.stringify(await c.sino(c.atendente))
    expect(todas).not.toContain('Segredo da equipe')
  })

  it('atribuir avisa o novo responsável', async () => {
    const c = await cenario()
    const ch = await c.abrir()
    await chamar('post', c.e.d.cookie, `/chamados/${ch.id}/atribuir`, {
      responsavelId: c.outra.membroId,
    })
    await esperarAte(async () => titulos(await c.sino(c.outra)).includes('chamado.atribuido'))
    const email = await aguardarMensagem(c.emails.outra)
    expect(email.Subject).toBe('CH-0001 · Chamado atribuído a você')
  })
})

describe('o sino', () => {
  it('lista só as minhas, conta as não lidas, marca uma ou todas; a de outra pessoa dá 404', async () => {
    const c = await cenario()
    await c.abrir()
    await c.abrir()
    await esperarAte(async () => (await c.sino(c.atendente)).naoLidas === 2)
    const lista = await c.sino(c.atendente, '?porPagina=1')
    expect(lista).toMatchObject({ total: 2, naoLidas: 2 })
    expect(lista.itens).toHaveLength(1)
    const id = lista.itens[0]?.id ?? ''
    const outraPessoa = await chamar('post', c.outra.cookie, `/notificacoes/${id}/lida`)
    expect(outraPessoa.status).toBe(404)
    expect((await c.sino(c.atendente)).naoLidas).toBe(2)

    const uma = await chamar('post', c.atendente.cookie, `/notificacoes/${id}/lida`)
    expect(uma.body).toEqual({ marcadas: 1, naoLidas: 1 })
    expect((await chamar('post', c.atendente.cookie, `/notificacoes/${id}/lida`)).body).toEqual({
      marcadas: 0,
      naoLidas: 1,
    })
    expect((await c.sino(c.atendente, '?somenteNaoLidas=true')).itens).toHaveLength(1)
    expect((await chamar('post', c.atendente.cookie, '/notificacoes/lidas')).body).toEqual({
      marcadas: 1,
      naoLidas: 0,
    })
    // a outra atendente continua com as dela
    expect((await c.sino(c.outra)).naoLidas).toBe(2)
    // o registro do e-mail não aparece no sino
    expect((await c.sino(c.solicitante)).total).toBe(0)
  })
})

describe('tempo real (SSE)', () => {
  it('só quem é o destinatário recebe o evento "nova", na hora; ao desconectar a assinatura some', async () => {
    const c = await cenario()
    await app.listen(0, '127.0.0.1')
    const porta = (app.getHttpServer().address() as AddressInfo).port
    const abrirFluxo = async (cookie: string) => {
      const controle = new AbortController()
      const r = await fetch(`http://127.0.0.1:${porta}/v1/notificacoes/fluxo`, {
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
    const atendente = await abrirFluxo(c.atendente.cookie)
    const solicitante = await abrirFluxo(c.solicitante.cookie)
    await esperarAte(() =>
      Promise.resolve(
        atendente.dados.texto.includes('event: sinal') &&
          solicitante.dados.texto.includes('event: sinal'),
      ),
    )
    // espera as duas assinaturas existirem no Valkey antes de provocar o evento
    await esperarAte(async () => {
      const [, n] = (await valkey.call(
        'PUBSUB',
        'NUMSUB',
        `leadtogo:fila:notif:${c.e.d.tenantId}:${c.atendente.membroId}`,
      )) as [string, number]
      return n >= 1
    })

    const ch = await c.abrir()
    await esperarAte(() => Promise.resolve(atendente.dados.texto.includes('event: nova')))
    expect(atendente.dados.texto).toContain('"tipo":"chamado.aberto"')
    expect(atendente.dados.texto).toContain('CH-0001 · Novo chamado')
    expect(solicitante.dados.texto).not.toContain('event: nova')
    expect(ch.id).toBeTruthy()

    const tempoReal = app.get(TempoRealDoSino)
    expect(tempoReal.conexoes).toBe(2)
    atendente.fechar()
    solicitante.fechar()
    await esperarAte(() => Promise.resolve(tempoReal.conexoes === 0))
    const sem = await fetch(`http://127.0.0.1:${porta}/v1/notificacoes/fluxo`)
    expect(sem.status).toBe(401)
    await sem.body?.cancel()
  })
})

describe('entrega idempotente', () => {
  it('o mesmo evento entregue duas vezes não duplica o sino nem o e-mail', async () => {
    const c = await cenario()
    const ch = await c.abrir()
    const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 2 })
    try {
      const config = configuracaoDeTeste()
      const manipulador = manipuladorDeNotificacaoDeChamado(config, () => Promise.resolve())
      const adicionados: string[] = []
      const filas = {
        fila: () => ({
          add: (_n: string, _d: unknown, o: { jobId: string }) => adicionados.push(o.jobId),
        }),
      }
      const evento = {
        id: novoId(),
        tenantId: c.e.d.tenantId,
        tipo: EVENTO_NOTIFICAR_CHAMADO,
        tentativas: 1,
        payload: { chamadoId: ch.id, tipo: 'atribuido', atorId: c.e.adminId },
      }
      await noTenant(
        c.e.d.tenantId,
        (tx) =>
          tx`UPDATE chamados SET responsavel_id = ${c.atendente.membroId} WHERE id = ${ch.id}`,
      )
      for (let i = 0; i < 2; i += 1) {
        await banco.db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${c.e.d.tenantId}, true)`)
          await manipulador(evento, { tx, filas: filas as never })
        })
      }
      const linhas = await noTenant(
        c.e.d.tenantId,
        (tx) =>
          tx<
            { canal: string }[]
          >`SELECT canal FROM notificacoes WHERE membro_id = ${c.atendente.membroId} AND tipo = 'chamado.atribuido'`,
      )
      expect(linhas.map((l) => l.canal).sort()).toEqual(['email', 'sino'])
      expect(adicionados).toHaveLength(1)
      expect(idDeterministico('a', 'b', 'sino')).toBe(idDeterministico('a', 'b', 'sino'))
      expect(idDeterministico('a', 'b', 'sino')).not.toBe(idDeterministico('a', 'b', 'email'))
    } finally {
      await banco.cliente.end({ timeout: 5 })
    }
  })
})
