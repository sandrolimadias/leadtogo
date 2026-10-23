import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { Chamado, ListaDeChamados } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { criarAppComRotas, configuracaoDeTeste } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { dono } from '../testes/mundo.js'
import { chamarEm, empresaDeChamados, noTenant, PERMISSOES, type Pessoa } from './teste-chamados.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
let app: INestApplication<Server>
const chamar = chamarEm(() => app)
const erroDe = (r: { body: unknown }) => (r.body as RespostaDeErro).erro

beforeAll(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterAll(async () => {
  await app.close()
  await valkey.quit()
  await dono.end()
})

/** Empresa com: admin (tudo), solicitante, atendente e gestor da área Jurídico. */
async function cenario() {
  const e = await empresaDeChamados(app)
  const juridico = await e.areaPadrao('juridico')
  const financeiro = await e.areaPadrao('financeiro')
  const solicitante = await e.pessoa('Solicitante', PERMISSOES.solicitante)
  const atendente = await e.pessoa('Atendente', PERMISSOES.atendente)
  const gestor = await e.pessoa('Gestor da área', PERMISSOES.gestorDeArea)
  const outraArea = await e.pessoa('Atendente do Financeiro', PERMISSOES.atendente)
  const admin = e.d.cookie
  await chamar('put', admin, `/chamados/areas/${juridico}/membros`, {
    membros: [{ membroId: gestor.membroId, gestor: true }, { membroId: atendente.membroId }],
    perfilIds: [],
  })
  await chamar('put', admin, `/chamados/areas/${financeiro}/membros`, {
    membros: [{ membroId: outraArea.membroId }],
    perfilIds: [],
  })
  const abrir = async (quem: string, corpo: Record<string, unknown> = {}) => {
    const r = await chamar('post', quem, '/chamados', {
      assunto: 'Revisar contrato do cliente',
      ...corpo,
    })
    return r
  }
  const ligarTriagem = (triador: Pessoa) =>
    chamar('put', admin, '/chamados/triagem', {
      ativa: true,
      perfilId: null,
      membroIds: [triador.membroId],
    })
  return {
    e,
    admin,
    juridico,
    financeiro,
    solicitante,
    atendente,
    gestor,
    outraArea,
    abrir,
    ligarTriagem,
  }
}

describe('abrir', () => {
  it('triagem desligada: cai direto na área como Pendente, com número sequencial e evento "aberto"', async () => {
    const c = await cenario()
    const r1 = await c.abrir(c.solicitante.cookie, {
      areaId: c.juridico,
      descricao: 'Preciso de ajuda',
    })
    expect(r1.status).toBe(201)
    const ch = r1.body as Chamado
    expect(ch).toMatchObject({
      numero: 1,
      codigo: 'CH-0001',
      status: 'pendente',
      prioridade: 'normal',
      origem: 'interna',
      area: { id: c.juridico, nome: 'Jurídico' },
      solicitante: { tipo: 'membro', nome: 'Solicitante' },
      responsavel: null,
      descricao: 'Preciso de ajuda',
    })
    expect(ch.eventos.map((v) => [v.tipo, v.statusPara])).toEqual([['aberto', 'pendente']])
    expect(
      ((await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado).codigo,
    ).toBe('CH-0002')
  })

  it('sem área ("não sei"): sempre vai para a triagem', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie)).body as Chamado
    expect(ch).toMatchObject({ status: 'aguardando_triagem', area: null })
  })

  it('triagem ligada: com área vai para a triagem, salvo se a área a pular', async () => {
    const c = await cenario()
    const triador = await c.e.pessoa('Triador', PERMISSOES.triador)
    expect((await c.ligarTriagem(triador)).status).toBe(200)
    const comArea = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    expect(comArea.status).toBe('aguardando_triagem')
    expect(comArea.area?.nome).toBe('Jurídico')
    await chamar('patch', c.admin, `/chamados/areas/${c.financeiro}`, { pulaTriagem: true })
    const pula = (await c.abrir(c.solicitante.cookie, { areaId: c.financeiro })).body as Chamado
    expect(pula.status).toBe('pendente')
  })

  it('recusa área inativa ou inexistente, empresa fora da carteira e quem não tem chamados.criar', async () => {
    const c = await cenario()
    await chamar('patch', c.admin, `/chamados/areas/${c.financeiro}`, { ativa: false })
    const inativa = await c.abrir(c.solicitante.cookie, { areaId: c.financeiro })
    expect(inativa.status).toBe(400)
    expect(erroDe(inativa)).toBe('area_invalida')
    expect(erroDe(await c.abrir(c.solicitante.cookie, { areaId: novoId() }))).toBe('area_invalida')
    expect(
      erroDe(
        await c.abrir(c.solicitante.cookie, { areaId: c.juridico, empresaClienteId: novoId() }),
      ),
    ).toBe('empresa_invalida')
    const semCriar = await c.e.pessoa('Só vê', { 'chamados.ver': 'propria' })
    const negado = await c.abrir(semCriar.cookie, { areaId: c.juridico })
    expect(negado.status).toBe(403)
    expect(erroDe(negado)).toBe('acesso_negado')
  })
})

describe('quem vê o quê', () => {
  it('triagem ligada: só quem tria vê "Aguardando triagem" (nem o admin, se não for designado); o solicitante vê o seu', async () => {
    const c = await cenario()
    const triador = await c.e.pessoa('Triador', PERMISSOES.triador)
    await c.ligarTriagem(triador)
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado

    const lista = async (cookie: string, aba: string) =>
      (await chamar('get', cookie, `/chamados?aba=${aba}`)).body as ListaDeChamados
    expect((await lista(triador.cookie, 'triagem')).itens.map((i) => i.id)).toEqual([ch.id])
    expect((await lista(c.solicitante.cookie, 'triagem')).itens.map((i) => i.id)).toEqual([ch.id])
    expect((await lista(c.admin, 'triagem')).itens).toEqual([])
    expect((await lista(c.admin, 'todos')).itens).toEqual([])
    expect((await lista(c.atendente.cookie, 'triagem')).itens).toEqual([])
    expect((await lista(c.atendente.cookie, 'todos')).itens).toEqual([])
    expect((await chamar('get', c.admin, `/chamados/${ch.id}`)).status).toBe(404)
    expect((await chamar('get', c.atendente.cookie, `/chamados/${ch.id}`)).status).toBe(404)
    expect((await chamar('get', triador.cookie, `/chamados/${ch.id}`)).status).toBe(200)
    expect((await lista(triador.cookie, 'todos')).abas.triagem).toBe(1)
    expect((await lista(c.admin, 'todos')).abas.triagem).toBe(0)
  })

  it('triagem desligada: o chamado vai direto à área e os membros dela o veem; quem não é da área não', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    const ids = async (p: Pessoa | string) =>
      (
        (await chamar('get', typeof p === 'string' ? p : p.cookie, '/chamados?aba=pendentes'))
          .body as ListaDeChamados
      ).itens.map((i) => i.id)
    expect(await ids(c.atendente)).toEqual([ch.id])
    expect(await ids(c.gestor)).toEqual([ch.id])
    expect(await ids(c.admin)).toEqual([ch.id])
    expect(await ids(c.outraArea)).toEqual([])
    expect((await chamar('get', c.outraArea.cookie, `/chamados/${ch.id}`)).status).toBe(404)
  })

  it('perfil sem chamados.ver recebe 403 acesso_negado; outra empresa nunca vê nada', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    const semVer = await c.e.pessoa('Sem ver', { 'chamados.criar': null })
    const negado = await chamar('get', semVer.cookie, '/chamados')
    expect(negado.status).toBe(403)
    expect(erroDe(negado)).toBe('acesso_negado')
    expect((await chamar('get', semVer.cookie, `/chamados/${ch.id}`)).status).toBe(403)

    const outra = await empresaDeChamados(app)
    expect(
      ((await chamar('get', outra.d.cookie, '/chamados')).body as ListaDeChamados).itens,
    ).toEqual([])
    const r = await chamar('get', outra.d.cookie, `/chamados/${ch.id}`)
    expect(r.status).toBe(404)
    expect(erroDe(r)).toBe('chamado_nao_encontrado')
    expect((await chamar('post', outra.d.cookie, `/chamados/${ch.id}/assumir`)).status).toBe(404)
  })

  it('"meus": os abertos em que a pessoa é responsável ou solicitante; filtros e busca por número', async () => {
    const c = await cenario()
    const a = (
      await c.abrir(c.solicitante.cookie, { areaId: c.juridico, assunto: 'Alteração contratual' })
    ).body as Chamado
    const b = (
      await c.abrir(c.solicitante.cookie, {
        areaId: c.financeiro,
        assunto: 'Boleto vencido',
        prioridade: 'urgente',
      })
    ).body as Chamado
    const lista = async (qs: string, cookie = c.admin) =>
      (await chamar('get', cookie, `/chamados${qs}`)).body as ListaDeChamados
    expect(
      (await lista('?aba=meus', c.solicitante.cookie)).itens.map((i) => i.codigo).sort(),
    ).toEqual(['CH-0001', 'CH-0002'])
    expect((await lista('?aba=meus', c.atendente.cookie)).itens).toEqual([])
    await chamar('post', c.atendente.cookie, `/chamados/${a.id}/assumir`)
    expect((await lista('?aba=meus', c.atendente.cookie)).itens.map((i) => i.id)).toEqual([a.id])
    expect((await lista('?busca=CH-0002')).itens.map((i) => i.id)).toEqual([b.id])
    expect((await lista('?busca=2')).itens.map((i) => i.id)).toEqual([b.id])
    expect((await lista('?busca=alteracao')).itens.map((i) => i.id)).toEqual([a.id])
    expect((await lista(`?areaId=${c.financeiro}`)).itens.map((i) => i.id)).toEqual([b.id])
    expect((await lista('?prioridade=urgente')).itens.map((i) => i.id)).toEqual([b.id])
    // pendentes: prioridade urgente primeiro
    expect((await lista('?aba=pendentes')).itens.map((i) => i.id)).toEqual([b.id])
    const pag = await lista('?porPagina=1&pagina=2')
    expect(pag).toMatchObject({ total: 2 })
    expect(pag.itens).toHaveLength(1)
  })
})

describe('triar, atribuir e assumir', () => {
  it('o triador define a área, a prioridade e o responsável; o chamado vira Pendente', async () => {
    const c = await cenario()
    const triador = await c.e.pessoa('Triador', PERMISSOES.triador)
    await c.ligarTriagem(triador)
    const ch = (await c.abrir(c.solicitante.cookie)).body as Chamado
    expect(
      erroDe(
        await chamar('post', c.solicitante.cookie, `/chamados/${ch.id}/triar`, {
          areaId: c.juridico,
        }),
      ),
    ).toBe('acesso_negado')
    const semAtender = await chamar('post', triador.cookie, `/chamados/${ch.id}/triar`, {
      areaId: c.juridico,
      responsavelId: c.outraArea.membroId,
    })
    expect(semAtender.status).toBe(400)
    expect(erroDe(semAtender)).toBe('responsavel_invalido')
    const ok = await chamar('post', triador.cookie, `/chamados/${ch.id}/triar`, {
      areaId: c.juridico,
      prioridade: 'alta',
      responsavelId: c.atendente.membroId,
    })
    expect(ok.status).toBe(200)
    const triado = ok.body as Chamado
    expect(triado).toMatchObject({
      status: 'pendente',
      prioridade: 'alta',
      area: { nome: 'Jurídico' },
      responsavel: { nome: 'Atendente' },
    })
    expect(triado.eventos.map((v) => v.tipo)).toEqual(['aberto', 'triado'])
    const de = triado.eventos[1]
    expect(de).toMatchObject({
      statusDe: 'aguardando_triagem',
      statusPara: 'pendente',
      areaPara: 'Jurídico',
      responsavelPara: 'Atendente',
      prioridadePara: 'alta',
    })
    // já triado, o chamado sai da fila: o triador não o vê mais (404) e não tria de novo
    expect(
      erroDe(
        await chamar('post', triador.cookie, `/chamados/${ch.id}/triar`, { areaId: c.juridico }),
      ),
    ).toBe('chamado_nao_encontrado')
    // o atendente passa a ver o chamado, que agora é dele
    expect((await chamar('get', c.atendente.cookie, `/chamados/${ch.id}`)).status).toBe(200)
  })

  it('assumir: membro da área pega o chamado sem responsável (Em atendimento); o segundo recebe 409; quem não é da área não pega', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    expect((await chamar('post', c.outraArea.cookie, `/chamados/${ch.id}/assumir`)).status).toBe(
      404,
    )
    const r = await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/assumir`)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ status: 'em_atendimento', responsavel: { nome: 'Atendente' } })
    const dois = await chamar('post', c.gestor.cookie, `/chamados/${ch.id}/assumir`)
    expect(dois.status).toBe(409)
    expect(erroDe(dois)).toBe('ja_atribuido')
    const eventos = ((await chamar('get', c.admin, `/chamados/${ch.id}`)).body as Chamado).eventos
    expect(eventos.map((v) => v.tipo)).toEqual(['aberto', 'assumido'])
    expect(eventos[1]).toMatchObject({
      statusDe: 'pendente',
      statusPara: 'em_atendimento',
      responsavelPara: 'Atendente',
    })
  })

  it('atribuir: o gestor da área e quem atende tudo atribuem; o atendente comum não; o destino precisa atender a área', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    const negado = await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/atribuir`, {
      responsavelId: c.atendente.membroId,
    })
    expect(negado.status).toBe(403)
    const invalido = await chamar('post', c.gestor.cookie, `/chamados/${ch.id}/atribuir`, {
      responsavelId: c.outraArea.membroId,
    })
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido)).toBe('responsavel_invalido')
    const ok = await chamar('post', c.gestor.cookie, `/chamados/${ch.id}/atribuir`, {
      responsavelId: c.atendente.membroId,
    })
    expect(ok.status).toBe(200)
    expect((ok.body as Chamado).responsavel?.nome).toBe('Atendente')
    const tira = await chamar('post', c.admin, `/chamados/${ch.id}/atribuir`, {
      responsavelId: null,
    })
    expect((tira.body as Chamado).responsavel).toBeNull()
    expect(
      ((await chamar('get', c.admin, `/chamados/${ch.id}`)).body as Chamado).eventos.map(
        (v) => v.tipo,
      ),
    ).toEqual(['aberto', 'atribuido', 'atribuido'])
  })
})

describe('atendentes da área', () => {
  it('lista quem atende a área (ou todos, se ela não tem ninguém); só quem tria ou atribui consulta', async () => {
    const c = await cenario()
    const lista = async (cookie: string, area: string) =>
      chamar('get', cookie, `/chamados/atendentes?areaId=${area}`)
    const juridico = await lista(c.admin, c.juridico)
    expect(juridico.status).toBe(200)
    expect((juridico.body as { nome: string }[]).map((a) => a.nome)).toEqual([
      'Atendente',
      'Gestor da área',
    ])
    const financeiro = await lista(c.admin, c.financeiro)
    expect((financeiro.body as { nome: string }[]).map((a) => a.nome)).toEqual([
      'Atendente do Financeiro',
    ])
    // área sem ninguém cadastrado: todos os que atendem (inclusive o administrador)
    const comercial = await lista(c.admin, await c.e.areaPadrao('comercial'))
    const nomes = (comercial.body as { nome: string }[]).map((a) => a.nome)
    expect(nomes).toHaveLength(4)
    expect(nomes).toEqual(
      expect.arrayContaining(['Atendente', 'Atendente do Financeiro', 'Gestor da área']),
    )
    expect((await lista(c.gestor.cookie, c.juridico)).status).toBe(200)
    expect((await lista(c.atendente.cookie, c.juridico)).status).toBe(403)
    expect((await lista(c.solicitante.cookie, c.juridico)).status).toBe(403)
    expect((await chamar('get', c.admin, '/chamados/atendentes')).status).toBe(400)
  })
})

describe('estados', () => {
  it('percorre todos os estados, grava um evento em cada passo e recusa o que não é permitido', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    const status = (cookie: string, para: string) =>
      chamar('post', cookie, `/chamados/${ch.id}/status`, { status: para })
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/assumir`)

    expect((await status(c.solicitante.cookie, 'resolvido')).status).toBe(403)
    expect(erroDe(await status(c.atendente.cookie, 'fechado'))).toBe('transicao_invalida')
    expect(erroDe(await status(c.atendente.cookie, 'aguardando_triagem'))).toBe(
      'transicao_invalida',
    )
    expect((await status(c.atendente.cookie, 'aguardando_cliente')).body).toMatchObject({
      status: 'aguardando_cliente',
    })
    expect((await status(c.atendente.cookie, 'em_atendimento')).body).toMatchObject({
      status: 'em_atendimento',
    })
    const resolvido = (await status(c.atendente.cookie, 'resolvido')).body as Chamado
    expect(resolvido.status).toBe('resolvido')
    expect(resolvido.resolvidoEm).not.toBeNull()
    expect(resolvido.acoes).toMatchObject({ alterarStatus: true, statusPossiveis: ['fechado'] })
    const fechado = (await status(c.atendente.cookie, 'fechado')).body as Chamado
    expect(fechado).toMatchObject({ status: 'fechado' })
    expect(fechado.acoes.statusPossiveis).toEqual([])
    expect(erroDe(await status(c.atendente.cookie, 'em_atendimento'))).toBe('chamado_fechado')

    const tipos = fechado.eventos.map((v) => [v.tipo, v.statusPara])
    expect(tipos).toEqual([
      ['aberto', 'pendente'],
      ['assumido', 'em_atendimento'],
      ['status_alterado', 'aguardando_cliente'],
      ['status_alterado', 'em_atendimento'],
      ['resolvido', 'resolvido'],
      ['fechado', 'fechado'],
    ])
  })

  it('reabrir: o solicitante ou quem atende, até 7 dias depois de Resolvido; fechado não reabre', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    const reabrir = (cookie: string) => chamar('post', cookie, `/chamados/${ch.id}/reabrir`)
    expect(erroDe(await reabrir(c.solicitante.cookie))).toBe('nao_resolvido')
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/assumir`)
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' })

    expect((await reabrir(c.outraArea.cookie)).status).toBe(404)
    const ok = await reabrir(c.solicitante.cookie)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({
      status: 'em_atendimento',
      reaberturas: 1,
      resolvidoEm: null,
      responsavel: { nome: 'Atendente' },
    })

    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/status`, { status: 'resolvido' })
    await noTenant(
      c.e.d.tenantId,
      (tx) => tx`UPDATE chamados SET resolvido_em = now() - interval '8 days' WHERE id = ${ch.id}`,
    )
    const tarde = await reabrir(c.solicitante.cookie)
    expect(tarde.status).toBe(409)
    expect(erroDe(tarde)).toBe('prazo_de_reabertura_vencido')
    const detalhe = (await chamar('get', c.solicitante.cookie, `/chamados/${ch.id}`))
      .body as Chamado
    expect(detalhe.acoes.reabrir).toBe(false)

    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/status`, { status: 'fechado' })
    expect(erroDe(await reabrir(c.solicitante.cookie))).toBe('nao_resolvido')
  })

  it('prioridade e área: o atendente muda a prioridade; só quem tria ou atribui muda a área (e o responsável de fora perde o chamado)', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/assumir`)
    const prio = await chamar('patch', c.atendente.cookie, `/chamados/${ch.id}`, {
      prioridade: 'urgente',
    })
    expect(prio.body).toMatchObject({ prioridade: 'urgente' })
    expect(
      (await chamar('patch', c.atendente.cookie, `/chamados/${ch.id}`, { areaId: c.financeiro }))
        .status,
    ).toBe(403)
    const muda = await chamar('patch', c.admin, `/chamados/${ch.id}`, { areaId: c.financeiro })
    expect(muda.body).toMatchObject({ area: { nome: 'Financeiro' }, responsavel: null })
    const tipos = (muda.body as Chamado).eventos.map((v) => v.tipo)
    expect(tipos).toEqual(['aberto', 'assumido', 'prioridade_alterada', 'area_alterada'])
  })
})

describe('notas internas e prazos', () => {
  it('a nota interna e o evento dela só aparecem para quem atende', async () => {
    const c = await cenario()
    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    await noTenant(c.e.d.tenantId, async (tx) => {
      await tx`INSERT INTO chamado_notas_internas (id, tenant_id, chamado_id, autor_membro_id, corpo)
        VALUES (${novoId()}, ${c.e.d.tenantId}, ${ch.id}, ${c.atendente.membroId}, 'Cliente já deu calote')`
      await tx`INSERT INTO chamado_eventos (id, tenant_id, chamado_id, tipo, ator_tipo, ator_membro_id)
        VALUES (${novoId()}, ${c.e.d.tenantId}, ${ch.id}, 'nota_interna', 'membro', ${c.atendente.membroId})`
    })
    const doSolicitante = (await chamar('get', c.solicitante.cookie, `/chamados/${ch.id}`))
      .body as Chamado
    expect(doSolicitante.notasInternas).toEqual([])
    expect(doSolicitante.eventos.map((v) => v.tipo)).toEqual(['aberto'])
    expect(doSolicitante.acoes).toMatchObject({
      notaInterna: false,
      responder: true,
      alterarStatus: false,
    })
    const doAtendente = (await chamar('get', c.atendente.cookie, `/chamados/${ch.id}`))
      .body as Chamado
    expect(doAtendente.notasInternas.map((n) => n.corpo)).toEqual(['Cliente já deu calote'])
    expect(doAtendente.eventos.map((v) => v.tipo)).toEqual(['aberto', 'nota_interna'])
  })

  it('prazos em horas úteis: sem meta não há prazo; com meta vence e atrasa; Aguardando cliente pausa', async () => {
    const c = await cenario()
    await chamar('patch', c.admin, `/chamados/areas/${c.juridico}`, {
      metaRespostaMin: 60,
      metaResolucaoMin: 480,
    })
    const sem = (await c.abrir(c.solicitante.cookie, { areaId: c.financeiro })).body as Chamado
    expect(sem.prazoResposta).toBeNull()
    expect(sem.prazoResolucao).toBeNull()

    const ch = (await c.abrir(c.solicitante.cookie, { areaId: c.juridico })).body as Chamado
    expect(ch.prazoResposta).toMatchObject({
      metaMin: 60,
      atrasado: false,
      pausado: false,
      cumpridoEm: null,
    })
    expect(ch.prazoResolucao).toMatchObject({ metaMin: 480, atrasado: false })

    // Abertura há 10 dias (a linha do tempo é a base): a resposta está muito atrasada
    await noTenant(c.e.d.tenantId, async (tx) => {
      await tx`UPDATE chamados SET criado_em = now() - interval '10 days' WHERE id = ${ch.id}`
      await tx`UPDATE chamado_eventos SET em = now() - interval '10 days' WHERE chamado_id = ${ch.id}`
    })
    const atrasado = (await chamar('get', c.admin, `/chamados/${ch.id}`)).body as Chamado
    expect(atrasado.prazoResposta?.atrasado).toBe(true)
    expect(atrasado.prazoResolucao?.atrasado).toBe(true)

    // Aguardando cliente pausa o prazo
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/assumir`)
    await chamar('post', c.atendente.cookie, `/chamados/${ch.id}/status`, {
      status: 'aguardando_cliente',
    })
    const pausado = (await chamar('get', c.admin, `/chamados/${ch.id}`)).body as Chamado
    expect(pausado.prazoResolucao).toMatchObject({ pausado: true, venceEm: null })
  })
})
