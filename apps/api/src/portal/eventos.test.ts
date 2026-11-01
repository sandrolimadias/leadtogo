/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- os corpos JSON do supertest chegam como any */
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { esperarAte } from '../testes/espera.js'
import { aguardarMensagem, limparCaixa, primeiroLink } from '../testes/mailpit.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  entrarNoPortal,
  novaEmpresaCliente,
  novoAcesso,
  aplicarTagNoContato,
  novaTagDeContato,
} from '../testes/portal.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import { processadorDeManutencao } from '../worker/manutencao.js'
import { criarConexao } from '@leadtogo/db'
import { pino } from 'pino'

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

const emDias = (dias: number, horas = 0) =>
  new Date(Date.now() + dias * 86_400_000 + horas * 3_600_000).toISOString()

interface Cliente {
  cookie: string
  email: string
  acessoId: string
  contatoId: string
}

/** Empresa da equipe com portal ligado; duas empresas-clientes (A com 3 pessoas, B com 2); gestor da agenda e leitor. */
async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  await configurarPortal(d.tenantId)
  const empresaA = await novaEmpresaCliente(d)
  const empresaB = await novaEmpresaCliente(d)
  const gestor = await pessoa('Gestor da agenda', { 'portal.agenda': null })
  const leitor = await pessoa('Leitor', { 'portal.ver': null })
  const semPortal = await pessoa('Sem portal', { 'chamados.ver': 'propria' })
  const clientes: Cliente[] = []
  const novo = async (empresaId: string, nome: string) => {
    const a = await novoAcesso(d, { empresaId, nome })
    clientes.push({
      cookie: await entrarNoPortal(portal, a),
      email: a.email,
      acessoId: a.acessoId,
      contatoId: a.contatoId,
    })
  }
  await novo(empresaA, 'Ana Alves')
  await novo(empresaA, 'Alex Abreu')
  await novo(empresaA, 'Alice Araújo')
  await novo(empresaB, 'Bruno Barros')
  await novo(empresaB, 'Bia Borges')
  return { d, empresaA, empresaB, gestor, leitor, semPortal, clientes }
}
type Cenario = Awaited<ReturnType<typeof cenario>>

const corpoDoEvento = (extra: Record<string, unknown> = {}) => ({
  titulo: 'Encontro anual de clientes',
  descricao: 'Inscrições abertas. **Vagas limitadas.**',
  local: 'Auditório, 2º andar',
  linkOnline: null,
  inicioEm: emDias(10),
  fimEm: emDias(10, 3),
  vagasTotais: null,
  vagasPorEmpresa: null,
  prazoConfirmacao: null,
  alcance: 'todos',
  empresaIds: [],
  ...extra,
})

/** Cria e publica um evento pela equipe. */
async function publicar(c: Cenario, extra: Record<string, unknown> = {}) {
  const r = await crm('post', c.gestor.cookie, '/portal-eventos', corpoDoEvento(extra))
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const p = await crm('post', c.gestor.cookie, `/portal-eventos/${r.body.id}/publicar`)
  expect(p.status, JSON.stringify(p.body)).toBe(200)
  return p.body.id as string
}

const confirmar = (cliente: Cliente, id: string) =>
  portal('post', `/portal/eventos/${id}/confirmacao`, { cookie: cliente.cookie })
const cancelar = (cliente: Cliente, id: string) =>
  portal('delete', `/portal/eventos/${id}/confirmacao`, { cookie: cliente.cookie })
const doCliente = async (cliente: Cliente, id: string): Promise<Record<string, unknown>> =>
  (await portal('get', `/portal/eventos/${id}`, { cookie: cliente.cookie })).body as Record<
    string,
    unknown
  >

const sinoDoCliente = (c: Cenario, cliente: Cliente) =>
  noTenant(
    c.d.tenantId,
    (tx) =>
      tx<
        { tipo: string; titulo: string; mensagem: string | null; canal: string }[]
      >`SELECT tipo, titulo, mensagem, canal FROM notificacoes WHERE contato_id = ${cliente.contatoId} AND tipo LIKE 'evento.%' ORDER BY criado_em`,
  )

describe('permissões da equipe', () => {
  it('ver lista; agenda escreve; sem permissão do portal é 403; o cliente não usa as rotas da equipe', async () => {
    const c = await cenario()
    const id = await publicar(c)
    for (const [pessoa, esperado] of [
      [c.leitor, 200],
      [c.gestor, 200],
      [c.semPortal, 403],
    ] as const) {
      expect((await crm('get', pessoa.cookie, '/portal-eventos')).status).toBe(esperado)
      expect((await crm('get', pessoa.cookie, `/portal-eventos/${id}/participantes`)).status).toBe(
        esperado,
      )
    }
    expect((await crm('post', c.leitor.cookie, '/portal-eventos', corpoDoEvento())).status).toBe(
      403,
    )
    expect(
      (await crm('patch', c.leitor.cookie, `/portal-eventos/${id}`, corpoDoEvento())).status,
    ).toBe(403)
    expect((await crm('post', c.leitor.cookie, `/portal-eventos/${id}/publicar`)).status).toBe(403)
    expect(
      (await crm('post', c.leitor.cookie, `/portal-eventos/${id}/cancelar`, { motivo: 'x' }))
        .status,
    ).toBe(403)
    expect((await crm('delete', c.leitor.cookie, `/portal-eventos/${id}`)).status).toBe(403)
    expect((await crm('get', c.clientes[0]?.cookie ?? '', '/portal-eventos')).status).toBe(401)
    expect((await portal('get', '/portal/eventos', { cookie: c.d.cookie })).status).toBe(401)
    expect((await portal('get', '/portal/eventos')).status).toBe(401)
  })
})

describe('criar, editar, publicar, cancelar e excluir', () => {
  it('rascunho não aparece ao cliente; publicar faz aparecer; início no passado não publica', async () => {
    const c = await cenario()
    const cliente = c.clientes[0] as Cliente
    const r = await crm('post', c.gestor.cookie, '/portal-eventos', corpoDoEvento())
    expect(r.body).toMatchObject({
      situacao: 'rascunho',
      titulo: 'Encontro anual de clientes',
      confirmados: 0,
    })
    const lista = async (): Promise<{ total: number }> =>
      (await portal('get', '/portal/eventos', { cookie: cliente.cookie })).body as { total: number }
    expect((await lista()).total).toBe(0)
    expect(
      (await portal('get', `/portal/eventos/${r.body.id}`, { cookie: cliente.cookie })).status,
    ).toBe(404)
    expect((await crm('get', c.gestor.cookie, '/portal-eventos?aba=rascunhos')).body.total).toBe(1)
    const publicado = await crm('post', c.gestor.cookie, `/portal-eventos/${r.body.id}/publicar`)
    expect(publicado.body.situacao).toBe('publicado')
    expect(publicado.body.publicadoEm).not.toBeNull()
    expect((await lista()).total).toBe(1)
    const de_novo = await crm('post', c.gestor.cookie, `/portal-eventos/${r.body.id}/publicar`)
    expect(de_novo.status).toBe(409)
    expect(de_novo.body.erro).toBe('evento_ja_publicado')

    const passado = await crm(
      'post',
      c.gestor.cookie,
      '/portal-eventos',
      corpoDoEvento({ inicioEm: emDias(-1), fimEm: emDias(-1, 2) }),
    )
    const recusa = await crm('post', c.gestor.cookie, `/portal-eventos/${passado.body.id}/publicar`)
    expect(recusa.status).toBe(422)
    expect(recusa.body.erro).toBe('inicio_no_passado')
  })

  it('valida as datas, as vagas, o link e o alcance', async () => {
    const c = await cenario()
    const tenta = (extra: Record<string, unknown>) =>
      crm('post', c.gestor.cookie, '/portal-eventos', corpoDoEvento(extra))
    expect((await tenta({ fimEm: emDias(10) })).status).toBe(400)
    expect((await tenta({ prazoConfirmacao: emDias(11) })).status).toBe(400)
    expect((await tenta({ vagasTotais: 0 })).status).toBe(400)
    expect((await tenta({ linkOnline: 'ftp://x.com' })).status).toBe(400)
    expect((await tenta({ alcance: 'empresas' })).status).toBe(400)
    const inexistente = await tenta({
      alcance: 'empresas',
      empresaIds: ['0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b'],
    })
    expect(inexistente.status).toBe(422)
    expect(inexistente.body.erro).toBe('empresa_invalida')
    expect(
      (
        await tenta({
          linkOnline: 'https://meet.exemplo.com/abc',
          vagasTotais: 80,
          vagasPorEmpresa: 2,
        })
      ).status,
    ).toBe(201)
  })

  it('editar muda os dados; evento cancelado não se edita; excluir só rascunho ou cancelado', async () => {
    const c = await cenario()
    const id = await publicar(c)
    const editado = await crm(
      'patch',
      c.gestor.cookie,
      `/portal-eventos/${id}`,
      corpoDoEvento({ titulo: 'Encontro 2026 (novo título)', local: null }),
    )
    expect(editado.body).toMatchObject({
      titulo: 'Encontro 2026 (novo título)',
      local: null,
      situacao: 'publicado',
    })
    const excl = await crm('delete', c.gestor.cookie, `/portal-eventos/${id}`)
    expect(excl.status).toBe(409)
    expect(excl.body.erro).toBe('cancele_antes_de_excluir')
    expect(
      (await crm('post', c.gestor.cookie, `/portal-eventos/${id}/cancelar`, { motivo: '  ' }))
        .status,
    ).toBe(400)
    const cancelado = await crm('post', c.gestor.cookie, `/portal-eventos/${id}/cancelar`, {
      motivo: 'Chuva forte',
    })
    expect(cancelado.body).toMatchObject({ situacao: 'cancelado', canceladoMotivo: 'Chuva forte' })
    expect(
      (await crm('patch', c.gestor.cookie, `/portal-eventos/${id}`, corpoDoEvento())).status,
    ).toBe(409)
    expect(
      (
        await crm('post', c.gestor.cookie, `/portal-eventos/${id}/cancelar`, {
          motivo: 'Outra vez',
        })
      ).status,
    ).toBe(409)
    expect((await crm('delete', c.gestor.cookie, `/portal-eventos/${id}`)).status).toBe(204)
    expect((await crm('get', c.gestor.cookie, `/portal-eventos/${id}`)).status).toBe(404)
  })

  it('alcance por empresas: só elas veem e confirmam', async () => {
    const c = await cenario()
    const [a1, , , b1] = c.clientes as [Cliente, Cliente, Cliente, Cliente]
    const id = await publicar(c, { alcance: 'empresas', empresaIds: [c.empresaA] })
    expect((await portal('get', '/portal/eventos', { cookie: a1.cookie })).body.total).toBe(1)
    expect((await portal('get', '/portal/eventos', { cookie: b1.cookie })).body.total).toBe(0)
    expect((await confirmar(b1, id)).status).toBe(404)
    expect((await confirmar(a1, id)).status).toBe(200)
    expect((await portal('get', `/portal/eventos/${id}/ics`, { cookie: b1.cookie })).status).toBe(
      404,
    )
  })
})

describe('o cliente: confirmar, lista de espera e cancelar', () => {
  it('confirma, vê as vagas e a situação; confirmar de novo é inofensivo; cancelar volta ao zero', async () => {
    const c = await cenario()
    const [a1, a2] = c.clientes as [Cliente, Cliente]
    const id = await publicar(c, { vagasTotais: 10, vagasPorEmpresa: 4 })
    const antes = await doCliente(a1, id)
    expect(antes).toMatchObject({
      titulo: 'Encontro anual de clientes',
      vagasRestantes: 10,
      lotado: false,
      vagasDaEmpresa: { limite: 4, confirmados: 0 },
      minhaSituacao: 'nenhuma',
      podeConfirmar: true,
      podeCancelar: false,
      motivoDoBloqueio: null,
    })
    const r = await confirmar(a1, id)
    expect(r.body).toMatchObject({
      minhaSituacao: 'confirmado',
      vagasRestantes: 9,
      podeConfirmar: false,
      podeCancelar: true,
    })
    expect((await confirmar(a1, id)).body.vagasRestantes).toBe(9)
    // o colega da mesma empresa vê a empresa com 1 vaga usada, mas não sabe quem
    const doColega = await doCliente(a2, id)
    expect(doColega).toMatchObject({
      vagasDaEmpresa: { limite: 4, confirmados: 1 },
      minhaSituacao: 'nenhuma',
      vagasRestantes: 9,
    })
    const volta = await cancelar(a1, id)
    // F-2: os dados ficam e a situação é "presença cancelada"; o botão de inscrição volta a valer
    expect(volta.body).toMatchObject({
      minhaSituacao: 'cancelado',
      vagasRestantes: 10,
      podeConfirmar: true,
    })
    const semPresenca = await cancelar(a1, id)
    expect(semPresenca.status).toBe(409)
    expect(semPresenca.body.erro).toBe('sem_presenca')
  })

  it('lotado vai para a lista de espera, e o cancelamento promove o primeiro e o avisa (sino e e-mail)', async () => {
    const c = await cenario()
    const [a1, a2, a3] = c.clientes as [Cliente, Cliente, Cliente]
    const id = await publicar(c, { vagasTotais: 2 })
    await limparCaixa()
    expect((await confirmar(a1, id)).body.minhaSituacao).toBe('confirmado')
    expect((await confirmar(a2, id)).body.minhaSituacao).toBe('confirmado')
    const espera = await confirmar(a3, id)
    expect(espera.body).toMatchObject({
      minhaSituacao: 'lista_espera',
      lotado: true,
      vagasRestantes: 0,
      podeConfirmar: false,
      podeCancelar: true,
    })
    const lista = await crm('get', c.gestor.cookie, `/portal-eventos/${id}/participantes`)
    expect(lista.body.confirmados.map((p: { pessoa: string }) => p.pessoa).sort()).toEqual([
      'Alex Abreu',
      'Ana Alves',
    ])
    expect(lista.body.listaDeEspera).toMatchObject([{ pessoa: 'Alice Araújo', posicaoNaFila: 1 }])

    expect((await cancelar(a1, id)).body.minhaSituacao).toBe('cancelado')
    expect((await doCliente(a3, id))['minhaSituacao']).toBe('confirmado')
    await esperarAte(async () =>
      (await sinoDoCliente(c, a3)).some((n) => n.tipo === 'evento.vaga' && n.canal === 'sino'),
    )
    const email = await aguardarMensagem(a3.email)
    expect(email.Subject).toMatch(/Vaga confirmada/)
    expect(primeiroLink(email)).toBe('http://localhost:5174/agenda')
    // quem cancelou e quem já estava confirmado não recebem aviso de vaga
    expect((await sinoDoCliente(c, a1)).filter((n) => n.tipo === 'evento.vaga')).toHaveLength(0)
  })

  it('o limite por empresa manda para a fila e a promoção pula a empresa que está no limite', async () => {
    const c = await cenario()
    const [a1, a2, a3, b1] = c.clientes as [Cliente, Cliente, Cliente, Cliente]
    const id = await publicar(c, { vagasTotais: 3, vagasPorEmpresa: 2 })
    await confirmar(a1, id)
    await confirmar(a2, id)
    const a3r = await confirmar(a3, id)
    expect(a3r.body.minhaSituacao).toBe('lista_espera')
    expect(a3r.body.vagasRestantes).toBe(1)
    expect((await confirmar(b1, id)).body.minhaSituacao).toBe('confirmado')
    // b1 cancela: abre vaga, mas a3 é da empresa A, que já está com 2: ninguém é promovido
    await cancelar(b1, id)
    expect((await doCliente(a3, id))['minhaSituacao']).toBe('lista_espera')
    // a1 cancela: agora a empresa A tem 1 e a3 entra
    await cancelar(a1, id)
    expect((await doCliente(a3, id))['minhaSituacao']).toBe('confirmado')
  })

  it('CONCORRÊNCIA: 5 clientes confirmando ao mesmo tempo para 3 vagas: exatamente 3 confirmados', async () => {
    const c = await cenario()
    const id = await publicar(c, { vagasTotais: 3 })
    const rs = await Promise.all(c.clientes.map((cliente) => confirmar(cliente, id)))
    expect(rs.every((r) => r.status === 200)).toBe(true)
    const situacoes = rs.map((r) => r.body.minhaSituacao as string)
    expect(situacoes.filter((s) => s === 'confirmado')).toHaveLength(3)
    expect(situacoes.filter((s) => s === 'lista_espera')).toHaveLength(2)
    const evento = await crm('get', c.gestor.cookie, `/portal-eventos/${id}`)
    expect(evento.body).toMatchObject({ confirmados: 3, listaDeEspera: 2 })
  })

  it('CONCORRÊNCIA: cancelamentos simultâneos promovem a fila sem passar do limite', async () => {
    const c = await cenario()
    const id = await publicar(c, { vagasTotais: 2 })
    const [a1, a2, a3, b1, b2] = c.clientes as [Cliente, Cliente, Cliente, Cliente, Cliente]
    for (const cliente of [a1, a2, a3, b1, b2]) await confirmar(cliente, id)
    await Promise.all([cancelar(a1, id), cancelar(a2, id)])
    const evento = await crm('get', c.gestor.cookie, `/portal-eventos/${id}`)
    expect(evento.body).toMatchObject({ confirmados: 2, listaDeEspera: 1 })
    expect((await doCliente(a3, id))['minhaSituacao']).toBe('confirmado')
    expect((await doCliente(b1, id))['minhaSituacao']).toBe('confirmado')
    expect((await doCliente(b2, id))['minhaSituacao']).toBe('lista_espera')
  })

  it('prazo de confirmação vencido, evento cancelado e evento que já começou recusam; cancelar vale até o início', async () => {
    const c = await cenario()
    const [a1, a2] = c.clientes as [Cliente, Cliente]
    // o prazo vence em instantes: cria com prazo futuro e envelhece no banco
    const comPrazo = await publicar(c, { prazoConfirmacao: emDias(1) })
    await confirmar(a1, comPrazo)
    await noTenant(
      c.d.tenantId,
      (tx) =>
        tx`UPDATE eventos SET prazo_confirmacao = now() - interval '1 minute' WHERE id = ${comPrazo}`,
    )
    const tarde = await confirmar(a2, comPrazo)
    expect(tarde.status).toBe(409)
    expect(tarde.body.erro).toBe('prazo_encerrado')
    expect(await doCliente(a2, comPrazo)).toMatchObject({
      podeConfirmar: false,
      motivoDoBloqueio: 'prazo_encerrado',
    })
    // quem já tinha presença ainda pode cancelar depois do prazo
    expect((await cancelar(a1, comPrazo)).status).toBe(200)

    const comecou = await publicar(c)
    await confirmar(a1, comecou)
    await noTenant(
      c.d.tenantId,
      (tx) =>
        tx`UPDATE eventos SET inicio_em = now() - interval '1 hour', fim_em = now() + interval '1 hour' WHERE id = ${comecou}`,
    )
    const r = await confirmar(a2, comecou)
    expect(r.status).toBe(409)
    expect(r.body.erro).toBe('evento_encerrado')
    expect((await cancelar(a1, comecou)).body.erro).toBe('evento_encerrado')
    expect(await doCliente(a1, comecou)).toMatchObject({
      podeCancelar: false,
      motivoDoBloqueio: 'evento_encerrado',
    })

    const cancelado = await publicar(c)
    await crm('post', c.gestor.cookie, `/portal-eventos/${cancelado}/cancelar`, {
      motivo: 'Sem público',
    })
    expect((await confirmar(a1, cancelado)).body.erro).toBe('evento_cancelado')
    expect(await doCliente(a1, cancelado)).toMatchObject({
      cancelado: true,
      motivoDoBloqueio: 'evento_cancelado',
    })
  })

  it('o cliente vê só o que é dele: nenhum nome de outro participante em lugar nenhum', async () => {
    const c = await cenario()
    const [a1, a2, , b1] = c.clientes as [Cliente, Cliente, Cliente, Cliente]
    const id = await publicar(c, { vagasTotais: 10 })
    await confirmar(a1, id)
    await confirmar(b1, id)
    const r = await portal('get', `/portal/eventos/${id}`, { cookie: a2.cookie })
    const texto =
      JSON.stringify(r.body) +
      JSON.stringify((await portal('get', '/portal/eventos', { cookie: a2.cookie })).body)
    for (const nome of ['Ana Alves', 'Bruno Barros', 'Alex Abreu'])
      expect(texto).not.toContain(nome)
    expect(Object.keys(r.body).sort()).toEqual(
      [
        'avaliar',
        'cancelado',
        'descricao',
        'fimEm',
        'formularioInscricaoId',
        'id',
        'inicioEm',
        'linkOnline',
        'local',
        'lotado',
        'minhaSituacao',
        'motivoDoBloqueio',
        'podeCancelar',
        'podeConfirmar',
        'prazoConfirmacao',
        'presente',
        'publico',
        'titulo',
        'vagasDaEmpresa',
        'vagasRestantes',
      ].sort(),
    )
  })
})

describe('a equipe: participantes, vagas e cancelamento do evento', () => {
  it('remover um participante promove a fila; aumentar as vagas promove quem passou a caber', async () => {
    const c = await cenario()
    const [a1, a2, a3] = c.clientes as [Cliente, Cliente, Cliente]
    const id = await publicar(c, { vagasTotais: 1 })
    await confirmar(a1, id)
    await confirmar(a2, id)
    await confirmar(a3, id)
    const lista = await crm('get', c.gestor.cookie, `/portal-eventos/${id}/participantes`)
    const confirmacaoA1 = lista.body.confirmados[0].id
    const removida = await crm(
      'delete',
      c.gestor.cookie,
      `/portal-eventos/${id}/participantes/${confirmacaoA1}`,
    )
    expect(removida.status).toBe(200)
    expect(removida.body.confirmados.map((p: { pessoa: string }) => p.pessoa)).toEqual([
      'Alex Abreu',
    ])
    expect((await doCliente(a1, id))['minhaSituacao']).toBe('cancelado')
    expect(
      (await crm('delete', c.gestor.cookie, `/portal-eventos/${id}/participantes/${confirmacaoA1}`))
        .status,
    ).toBe(404)
    const mais = await crm(
      'patch',
      c.gestor.cookie,
      `/portal-eventos/${id}`,
      corpoDoEvento({ vagasTotais: 2 }),
    )
    expect(mais.body).toMatchObject({ confirmados: 2, listaDeEspera: 0 })
    expect((await doCliente(a3, id))['minhaSituacao']).toBe('confirmado')
    await esperarAte(async () => (await sinoDoCliente(c, a3)).some((n) => n.tipo === 'evento.vaga'))
  })

  it('cancelar o evento avisa confirmados e lista de espera, com o motivo; o cliente o vê como cancelado', async () => {
    const c = await cenario()
    const [a1, a2, a3] = c.clientes as [Cliente, Cliente, Cliente]
    const id = await publicar(c, { vagasTotais: 1 })
    await confirmar(a1, id)
    await confirmar(a2, id)
    await limparCaixa()
    await crm('post', c.gestor.cookie, `/portal-eventos/${id}/cancelar`, { motivo: 'Chuva forte' })
    for (const cliente of [a1, a2]) {
      await esperarAte(async () =>
        (await sinoDoCliente(c, cliente)).some((n) => n.tipo === 'evento.cancelado'),
      )
    }
    const aviso = (await sinoDoCliente(c, a2)).find((n) => n.tipo === 'evento.cancelado')
    expect(aviso?.titulo).toBe('Evento cancelado: Encontro anual de clientes')
    expect(aviso?.mensagem).toContain('Motivo: Chuva forte')
    expect((await aguardarMensagem(a1.email)).Subject).toMatch(/Evento cancelado/)
    expect((await sinoDoCliente(c, a3)).filter((n) => n.tipo === 'evento.cancelado')).toHaveLength(
      0,
    )
    const lista = await portal('get', '/portal/eventos', { cookie: a1.cookie })
    expect(lista.body.itens[0]).toMatchObject({ cancelado: true })
    expect(
      (await portal('get', '/portal/eventos/proximos', { cookie: a1.cookie })).body.itens,
    ).toHaveLength(0)
  })
})

describe('lembrete de 24 horas', () => {
  it('o worker lembra uma vez só os confirmados dos eventos que começam em até 24 horas', async () => {
    const c = await cenario()
    const [a1, a2, a3] = c.clientes as [Cliente, Cliente, Cliente]
    const id = await publicar(c, { vagasTotais: 2 })
    const longe = await publicar(c)
    await confirmar(a1, id)
    await confirmar(a2, id)
    await confirmar(a3, id) // lista de espera: não recebe lembrete
    await confirmar(a1, longe)
    await noTenant(
      c.d.tenantId,
      (tx) =>
        tx`UPDATE eventos SET inicio_em = now() + interval '5 hours', fim_em = now() + interval '8 hours' WHERE id = ${id}`,
    )
    await limparCaixa()
    const banco = criarConexao(configuracaoDeTeste().DATABASE_URL, { max: 2 })
    try {
      const rodar = processadorDeManutencao(banco, pino({ level: 'silent' }))
      const r = await rodar({ name: 'lembrar-eventos' } as Parameters<
        ReturnType<typeof processadorDeManutencao>
      >[0])
      expect(r.resultado).toBeGreaterThanOrEqual(1)
      // a segunda rodada não repete
      const depois = await rodar({ name: 'lembrar-eventos' } as Parameters<
        ReturnType<typeof processadorDeManutencao>
      >[0])
      expect(depois.resultado).toBe(0)
    } finally {
      await banco.cliente.end({ timeout: 5 })
    }
    for (const cliente of [a1, a2]) {
      await esperarAte(async () =>
        (await sinoDoCliente(c, cliente)).some((n) => n.tipo === 'evento.lembrete'),
      )
    }
    expect((await aguardarMensagem(a1.email)).Subject).toMatch(/Lembrete/)
    expect(
      (await sinoDoCliente(c, a1)).filter(
        (n) => n.tipo === 'evento.lembrete' && n.canal === 'sino',
      ),
    ).toHaveLength(1)
    expect((await sinoDoCliente(c, a3)).filter((n) => n.tipo === 'evento.lembrete')).toHaveLength(0)
  })
})

describe('.ics e próximos eventos', () => {
  it('baixa o .ics com o evento, como arquivo; evento fora do alcance dá 404', async () => {
    const c = await cenario()
    const [a1] = c.clientes as [Cliente]
    const id = await publicar(c, { linkOnline: 'https://meet.exemplo.com/abc' })
    const r = await portal('get', `/portal/eventos/${id}/ics`, { cookie: a1.cookie })
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toContain('text/calendar')
    expect(r.headers['content-disposition']).toContain(`evento-${id}.ics`)
    const texto = r.text
    expect(texto).toContain('BEGIN:VEVENT')
    expect(texto).toContain('SUMMARY:Encontro anual de clientes')
    expect(texto).toContain('LOCATION:Auditório\\, 2º andar')
    expect(texto).toContain('URL:https://meet.exemplo.com/abc')
    expect(texto).toContain('\r\n')
    expect((await portal('get', `/portal/eventos/${id}/ics`)).status).toBe(401)
  })

  it('o Início mostra até 3 próximos em ordem; os passados vão para a outra aba', async () => {
    const c = await cenario()
    const [a1] = c.clientes as [Cliente]
    const quatro = await publicar(c, {
      titulo: 'Quarto evento',
      inicioEm: emDias(40),
      fimEm: emDias(40, 2),
    })
    await publicar(c, { titulo: 'Primeiro evento', inicioEm: emDias(2), fimEm: emDias(2, 2) })
    await publicar(c, { titulo: 'Segundo evento', inicioEm: emDias(5), fimEm: emDias(5, 2) })
    await publicar(c, { titulo: 'Terceiro evento', inicioEm: emDias(9), fimEm: emDias(9, 2) })
    const passado = await publicar(c, { titulo: 'Já foi' })
    await noTenant(
      c.d.tenantId,
      (tx) =>
        tx`UPDATE eventos SET inicio_em = now() - interval '3 days', fim_em = now() - interval '2 days' WHERE id = ${passado}`,
    )
    const proximos = await portal('get', '/portal/eventos/proximos', { cookie: a1.cookie })
    expect(proximos.body.itens.map((e: { titulo: string }) => e.titulo)).toEqual([
      'Primeiro evento',
      'Segundo evento',
      'Terceiro evento',
    ])
    const abaProximos = await portal('get', '/portal/eventos', { cookie: a1.cookie })
    expect(abaProximos.body.itens.map((e: { id: string }) => e.id)).toContain(quatro)
    expect(abaProximos.body.itens.map((e: { titulo: string }) => e.titulo)).not.toContain('Já foi')
    const abaPassados = await portal('get', '/portal/eventos?aba=passados', { cookie: a1.cookie })
    expect(abaPassados.body.itens.map((e: { titulo: string }) => e.titulo)).toEqual(['Já foi'])
    const equipe = await crm('get', c.gestor.cookie, '/portal-eventos')
    expect(equipe.body.abas).toMatchObject({ proximos: 4, passados: 1, rascunhos: 0 })
  })
})

describe('isolamento entre empresas da equipe', () => {
  it('o cliente e a equipe de outra empresa não veem nem mexem nos eventos', async () => {
    const x = await cenario()
    const y = await cenario()
    const doY = await publicar(y)
    const clienteX = x.clientes[0] as Cliente
    expect((await portal('get', '/portal/eventos', { cookie: clienteX.cookie })).body.total).toBe(0)
    expect(
      (await portal('get', `/portal/eventos/${doY}`, { cookie: clienteX.cookie })).status,
    ).toBe(404)
    expect((await confirmar(clienteX, doY)).status).toBe(404)
    expect((await crm('get', x.gestor.cookie, `/portal-eventos/${doY}`)).status).toBe(404)
    expect(
      (await crm('patch', x.gestor.cookie, `/portal-eventos/${doY}`, corpoDoEvento())).status,
    ).toBe(404)
    expect(
      (await crm('post', x.gestor.cookie, `/portal-eventos/${doY}/cancelar`, { motivo: 'x' }))
        .status,
    ).toBe(404)
    expect((await crm('get', x.gestor.cookie, `/portal-eventos/${doY}/participantes`)).status).toBe(
      404,
    )
  })
})

describe('alcance por tags de contato (Fase 4C)', () => {
  it('o evento com tags aparece só para quem tem a tag, e só ele confirma', async () => {
    const c = await cenario()
    const tag = await novaTagDeContato(c.d.tenantId, 'Associado premium')
    const [ana, alex] = c.clientes as [Cliente, Cliente]
    await aplicarTagNoContato(c.d.tenantId, ana.contatoId, tag)
    const id = await publicar(c, { alcance: 'tags', tagIds: [tag] })
    const detalhe = await crm('get', c.gestor.cookie, `/portal-eventos/${id}`)
    expect(detalhe.body.tags).toEqual([
      expect.objectContaining({ id: tag, nome: 'Associado premium' }),
    ])
    const lista = async (cliente: Cliente) =>
      (
        (await portal('get', '/portal/eventos', { cookie: cliente.cookie })).body.itens as {
          id: string
        }[]
      ).map((e) => e.id)
    expect(await lista(ana)).toContain(id)
    expect(await lista(alex)).not.toContain(id)
    expect((await confirmar(alex, id)).status).toBe(404)
    expect((await confirmar(ana, id)).status).toBe(200)
  })
})
