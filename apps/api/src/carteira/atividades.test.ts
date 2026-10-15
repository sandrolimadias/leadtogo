import type { Server } from 'node:http'

import { diaNoFuso, inicioDoDiaNoFuso } from '@leadtogo/shared'
import type { Atividade, EmpresaCarteira, ListaDeAtividades, TipoAtividade } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

type Metodo = 'get' | 'post' | 'patch' | 'delete'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.5.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const ATIVIDADES = '/v1/carteira/atividades'
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

/** Empresa com o administrador, um gestor e dois vendedores (Ana e Bia). */
async function cenario() {
  const d = await novoDono(app)
  const pessoa = async (papel: 'gestor' | 'vendedor', nome: string) => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, papel, nome)
    await ativar(u.id, d.tenantId)
    return { ...u, membroId }
  }
  const tipos = (await chamar('get', d.cookie, '/v1/configuracoes/tipos-atividade'))
    .body as TipoAtividade[]
  const tipo = (chave: string) => tipos.find((t) => t.chaveSistema === chave) as TipoAtividade
  return {
    d,
    gestor: await pessoa('gestor', 'Gestor'),
    ana: await pessoa('vendedor', 'Ana'),
    bia: await pessoa('vendedor', 'Bia'),
    visita: tipo('visita'),
    ligacao: tipo('ligacao'),
    tarefa: tipo('tarefa'),
  }
}

const empresa = async (cookie: string, nome: string, extra: Record<string, unknown> = {}) => {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    razaoSocial: nome,
    ...extra,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as EmpresaCarteira
}
const ficha = async (cookie: string, id: string) =>
  (await chamar('get', cookie, `/v1/carteira/empresas/${id}`)).body as EmpresaCarteira
const nomesDasTags = (e: EmpresaCarteira) => e.tags.map((t) => t.nome)

const minutosAtras = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const diasAtras = (dias: number) => minutosAtras(dias * 24 * 60)

const registrar = async (cookie: string, corpo: Record<string, unknown>, status = 201) => {
  const r = await chamar('post', cookie, ATIVIDADES, corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(status)
  return r.body as Atividade
}
const realizada = (tipoId: string, empresaId: string, dataInicio: string, extra = {}) => ({
  tipoAtividadeId: tipoId,
  titulo: 'Visita de rotina',
  empresaId,
  dataInicio,
  situacao: 'realizada',
  resultado: 'Conversamos sobre a renovação.',
  ...extra,
})

describe('efeito na carteira (última visita, último contato, próxima atividade e tags)', () => {
  it('visita realizada atualiza última visita E último contato e aplica só a tag Visitada', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Mercado Central')
    expect(e.ultimaVisitaEm).toBeNull()

    const quando = diasAtras(3)
    const a = await registrar(c.d.cookie, realizada(c.visita.id, e.id, quando))
    expect(a).toMatchObject({ situacao: 'realizada', atrasada: false, editavel: true })
    expect(a.realizadaEm).toBe(new Date(quando).toISOString())

    const depois = await ficha(c.d.cookie, e.id)
    expect(depois.ultimaVisitaEm).toBe(new Date(quando).toISOString())
    expect(depois.ultimoContatoEm).toBe(new Date(quando).toISOString())
    expect(nomesDasTags(depois)).toContain('Visitada')
    expect(nomesDasTags(depois)).not.toContain('Contactada')
  })

  it('ligação realizada atualiza só o último contato e aplica Contactada', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Padaria Sol')
    const quando = diasAtras(1)
    await registrar(c.d.cookie, realizada(c.ligacao.id, e.id, quando))
    const depois = await ficha(c.d.cookie, e.id)
    expect(depois.ultimaVisitaEm).toBeNull()
    expect(depois.ultimoContatoEm).toBe(new Date(quando).toISOString())
    expect(nomesDasTags(depois)).toContain('Contactada')
    expect(nomesDasTags(depois)).not.toContain('Visitada')
  })

  it('tarefa realizada não conta como visita nem contato', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Loja do Zé')
    await registrar(c.d.cookie, realizada(c.tarefa.id, e.id, diasAtras(1)))
    const depois = await ficha(c.d.cookie, e.id)
    expect(depois.ultimaVisitaEm).toBeNull()
    expect(depois.ultimoContatoEm).toBeNull()
    expect(nomesDasTags(depois)).not.toContain('Visitada')
  })

  it('pendente define a próxima atividade (a mais próxima) e não mexe em visita nem contato', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Oficina 3 Irmãos')
    const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()
    const longe = await registrar(c.d.cookie, {
      tipoAtividadeId: c.visita.id,
      titulo: 'Visita longe',
      empresaId: e.id,
      dataInicio: daqui(20),
      situacao: 'pendente',
    })
    const perto = await registrar(c.d.cookie, {
      tipoAtividadeId: c.ligacao.id,
      titulo: 'Ligar na semana',
      empresaId: e.id,
      dataInicio: daqui(2),
      situacao: 'pendente',
    })
    let f = await ficha(c.d.cookie, e.id)
    expect(f.proximaAtividadeEm).toBe(perto.dataInicio)
    expect(f.ultimaVisitaEm).toBeNull()
    expect(f.ultimoContatoEm).toBeNull()

    // concluir a mais próxima passa a próxima para a outra e registra o contato
    const r = await chamar('post', c.d.cookie, `${ATIVIDADES}/${perto.id}/concluir`, {
      resultado: 'Falei com o dono.',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    f = await ficha(c.d.cookie, e.id)
    expect(f.proximaAtividadeEm).toBe(longe.dataInicio)
    expect(f.ultimoContatoEm).not.toBeNull()
    expect(nomesDasTags(f)).toContain('Contactada')
  })

  it('editar, cancelar e excluir a realizada recalculam; a tag só sai quando não resta nenhuma do tipo', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Farmácia Vida')
    const antiga = await registrar(c.d.cookie, realizada(c.visita.id, e.id, diasAtras(30)))
    const recente = await registrar(c.d.cookie, realizada(c.visita.id, e.id, diasAtras(2)))
    let f = await ficha(c.d.cookie, e.id)
    expect(f.ultimaVisitaEm).toBe(recente.realizadaEm)

    // editar a data da mais recente (para antes da antiga): a última visita passa a ser a antiga
    const nova = diasAtras(40)
    const ed = await chamar('patch', c.d.cookie, `${ATIVIDADES}/${recente.id}`, {
      dataInicio: nova,
    })
    expect(ed.status, JSON.stringify(ed.body)).toBe(200)
    f = await ficha(c.d.cookie, e.id)
    expect(f.ultimaVisitaEm).toBe(antiga.realizadaEm)

    // excluir a antiga: sobra a editada (40 dias atrás), a tag fica
    expect((await chamar('delete', c.d.cookie, `${ATIVIDADES}/${antiga.id}`)).status).toBe(204)
    f = await ficha(c.d.cookie, e.id)
    expect(f.ultimaVisitaEm).toBe(new Date(nova).toISOString())
    expect(nomesDasTags(f)).toContain('Visitada')

    // cancelar a única que resta: nenhuma realizada, a tag sai e as datas voltam a vazio
    const cancelada = await chamar('post', c.d.cookie, `${ATIVIDADES}/${recente.id}/cancelar`)
    expect(cancelada.status, JSON.stringify(cancelada.body)).toBe(200)
    expect((cancelada.body as Atividade).situacao).toBe('cancelada')
    expect((cancelada.body as Atividade).realizadaEm).toBeNull()
    f = await ficha(c.d.cookie, e.id)
    expect(f.ultimaVisitaEm).toBeNull()
    expect(f.ultimoContatoEm).toBeNull()
    expect(nomesDasTags(f)).not.toContain('Visitada')
  })

  it('a tag Contactada fica enquanto houver uma ligação realizada, mesmo cancelando a visita', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Casa de Carnes')
    await registrar(c.d.cookie, realizada(c.ligacao.id, e.id, diasAtras(5)))
    const visita = await registrar(c.d.cookie, realizada(c.visita.id, e.id, diasAtras(1)))
    await chamar('post', c.d.cookie, `${ATIVIDADES}/${visita.id}/cancelar`)
    const f = await ficha(c.d.cookie, e.id)
    expect(nomesDasTags(f)).toContain('Contactada')
    expect(nomesDasTags(f)).not.toContain('Visitada')
    expect(f.ultimaVisitaEm).toBeNull()
  })

  it('trocar o tipo de Visita para Tarefa tira a visita da empresa', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Auto Peças Norte')
    const a = await registrar(c.d.cookie, realizada(c.visita.id, e.id, diasAtras(1)))
    const r = await chamar('patch', c.d.cookie, `${ATIVIDADES}/${a.id}`, {
      tipoAtividadeId: c.tarefa.id,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const f = await ficha(c.d.cookie, e.id)
    expect(f.ultimaVisitaEm).toBeNull()
    expect(nomesDasTags(f)).not.toContain('Visitada')
  })

  it('mover a atividade de empresa recalcula as duas', async () => {
    const c = await cenario()
    const a1 = await empresa(c.d.cookie, 'Empresa Um')
    const a2 = await empresa(c.d.cookie, 'Empresa Dois')
    const a = await registrar(c.d.cookie, realizada(c.visita.id, a1.id, diasAtras(1)))
    const r = await chamar('patch', c.d.cookie, `${ATIVIDADES}/${a.id}`, { empresaId: a2.id })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await ficha(c.d.cookie, a1.id)).ultimaVisitaEm).toBeNull()
    expect((await ficha(c.d.cookie, a2.id)).ultimaVisitaEm).not.toBeNull()
  })
})

describe('regras de data e de preenchimento', () => {
  it('realizada aceita até 5 minutos no futuro (relógio adiantado) e recusa mais que isso', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Mercearia')
    const em = (min: number) => new Date(Date.now() + min * 60_000).toISOString()
    await registrar(c.d.cookie, realizada(c.visita.id, e.id, em(4)))
    const r = await chamar('post', c.d.cookie, ATIVIDADES, realizada(c.visita.id, e.id, em(7)))
    expect(r.status).toBe(400)
    expect(erroDe(r)).toBe('atividade_no_futuro')
    // a pendente pode ser no futuro
    await registrar(c.d.cookie, {
      tipoAtividadeId: c.visita.id,
      titulo: 'Agendada',
      empresaId: e.id,
      dataInicio: em(60 * 24),
      situacao: 'pendente',
    })
  })

  it('realizada sem resultado é recusada; concluir também exige o resultado', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Papelaria')
    const sem = await chamar('post', c.d.cookie, ATIVIDADES, {
      ...realizada(c.visita.id, e.id, diasAtras(1)),
      resultado: '  ',
    })
    expect(sem.status).toBe(400)
    const p = await registrar(c.d.cookie, {
      tipoAtividadeId: c.visita.id,
      titulo: 'Ir lá',
      empresaId: e.id,
      dataInicio: new Date(Date.now() + 86_400_000).toISOString(),
      situacao: 'pendente',
    })
    expect((await chamar('post', c.d.cookie, `${ATIVIDADES}/${p.id}/concluir`, {})).status).toBe(
      400,
    )
    // concluir com data no futuro, também não
    const f = await chamar('post', c.d.cookie, `${ATIVIDADES}/${p.id}/concluir`, {
      resultado: 'ok',
      realizadaEm: new Date(Date.now() + 3_600_000).toISOString(),
    })
    expect(erroDe(f)).toBe('atividade_no_futuro')
    // editar a realizada para o futuro, idem
    const feita = await registrar(c.d.cookie, realizada(c.visita.id, e.id, diasAtras(1)))
    const ed = await chamar('patch', c.d.cookie, `${ATIVIDADES}/${feita.id}`, {
      dataInicio: new Date(Date.now() + 3_600_000).toISOString(),
    })
    expect(erroDe(ed)).toBe('atividade_no_futuro')
    // e esvaziar o resultado da realizada
    const vazio = await chamar('patch', c.d.cookie, `${ATIVIDADES}/${feita.id}`, { resultado: '' })
    expect(vazio.status).toBe(400)
  })

  it('a empresa é obrigatória, exceto na Tarefa; contato só da empresa', async () => {
    const c = await cenario()
    const e1 = await empresa(c.d.cookie, 'Empresa Um')
    const e2 = await empresa(c.d.cookie, 'Empresa Dois')
    const sem = await chamar('post', c.d.cookie, ATIVIDADES, {
      tipoAtividadeId: c.visita.id,
      titulo: 'Sem empresa',
      dataInicio: diasAtras(1),
      situacao: 'realizada',
      resultado: 'x',
    })
    expect(erroDe(sem)).toBe('empresa_obrigatoria')
    const tarefa = await registrar(c.d.cookie, {
      tipoAtividadeId: c.tarefa.id,
      titulo: 'Emitir relatório',
      dataInicio: new Date(Date.now() + 86_400_000).toISOString(),
      situacao: 'pendente',
    })
    expect(tarefa.empresa).toBeNull()

    const contato = (
      await chamar('post', c.d.cookie, '/v1/carteira/contatos', {
        nome: 'Dona Maria',
        vinculo: { empresaId: e1.id },
      })
    ).body as { id: string }
    const ok = await registrar(c.d.cookie, {
      ...realizada(c.visita.id, e1.id, diasAtras(1)),
      contatoId: contato.id,
    })
    expect(ok.contato).toMatchObject({ id: contato.id, nome: 'Dona Maria' })
    const errado = await chamar('post', c.d.cookie, ATIVIDADES, {
      ...realizada(c.visita.id, e2.id, diasAtras(1)),
      contatoId: contato.id,
    })
    expect(erroDe(errado)).toBe('contato_invalido')
    const semEmpresa = await chamar('post', c.d.cookie, ATIVIDADES, {
      tipoAtividadeId: c.tarefa.id,
      titulo: 'Tarefa com contato',
      dataInicio: diasAtras(0),
      situacao: 'pendente',
      contatoId: contato.id,
    })
    expect(erroDe(semEmpresa)).toBe('contato_sem_empresa')
  })

  it('trocar de empresa sem dizer o contato tira o contato', async () => {
    const c = await cenario()
    const e1 = await empresa(c.d.cookie, 'Empresa Um')
    const e2 = await empresa(c.d.cookie, 'Empresa Dois')
    const contato = (
      await chamar('post', c.d.cookie, '/v1/carteira/contatos', {
        nome: 'Seu João',
        vinculo: { empresaId: e1.id },
      })
    ).body as { id: string }
    const a = await registrar(c.d.cookie, {
      ...realizada(c.visita.id, e1.id, diasAtras(1)),
      contatoId: contato.id,
    })
    const r = await chamar('patch', c.d.cookie, `${ATIVIDADES}/${a.id}`, { empresaId: e2.id })
    expect(r.status).toBe(200)
    expect((r.body as Atividade).contato).toBeNull()
  })

  it('cancelada não se edita nem se conclui; concluir exige atividade aberta', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Loja')
    const a = await registrar(c.d.cookie, realizada(c.visita.id, e.id, diasAtras(1)))
    await chamar('post', c.d.cookie, `${ATIVIDADES}/${a.id}/cancelar`)
    expect(
      erroDe(await chamar('patch', c.d.cookie, `${ATIVIDADES}/${a.id}`, { titulo: 'x' })),
    ).toBe('atividade_cancelada')
    expect(erroDe(await chamar('post', c.d.cookie, `${ATIVIDADES}/${a.id}/cancelar`))).toBe(
      'atividade_cancelada',
    )
    expect(
      erroDe(
        await chamar('post', c.d.cookie, `${ATIVIDADES}/${a.id}/concluir`, { resultado: 'x' }),
      ),
    ).toBe('atividade_nao_aberta')
  })
})

describe('fuso horário (America/Sao_Paulo, nunca UTC)', () => {
  it('dia inteiro vale a meia-noite do dia em São Paulo: 22h e 00h30 caem em dias diferentes', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Distribuidora')
    const base = {
      tipoAtividadeId: c.visita.id,
      empresaId: e.id,
      situacao: 'pendente',
      diaInteiro: true,
    }
    // 22h de 14/10 em Brasília = 01h de 15/10 em UTC; 00h30 de 15/10 em Brasília = 03h30 UTC
    const as22 = await registrar(c.d.cookie, {
      ...base,
      titulo: '22h',
      dataInicio: '2030-10-15T01:00:00Z',
    })
    const as0030 = await registrar(c.d.cookie, {
      ...base,
      titulo: '00h30',
      dataInicio: '2030-10-15T03:30:00Z',
    })
    expect(as22.dataInicio).toBe('2030-10-14T03:00:00.000Z') // meia-noite de 14/10 em Brasília
    expect(as0030.dataInicio).toBe('2030-10-15T03:00:00.000Z') // meia-noite de 15/10 em Brasília
  })

  it('dia inteiro de hoje (em São Paulo) está agendado e o de ontem, atrasado; hora marcada vale o instante', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Atacadão')
    const hoje = diaNoFuso(new Date())
    const ontem = diaNoFuso(new Date(Date.now() - 86_400_000))
    const dia = (d: string, titulo: string) =>
      registrar(c.d.cookie, {
        tipoAtividadeId: c.visita.id,
        titulo,
        empresaId: e.id,
        situacao: 'pendente',
        diaInteiro: true,
        dataInicio: inicioDoDiaNoFuso(d).toISOString(),
      })
    await dia(hoje, 'Dia inteiro de hoje')
    await dia(ontem, 'Dia inteiro de ontem')
    await registrar(c.d.cookie, {
      tipoAtividadeId: c.ligacao.id,
      titulo: 'Hora que já passou',
      empresaId: e.id,
      situacao: 'pendente',
      dataInicio: minutosAtras(30),
    })
    const lista = async (aba: string) =>
      (await chamar('get', c.d.cookie, `${ATIVIDADES}?aba=${aba}&empresaId=${e.id}`))
        .body as ListaDeAtividades
    const atrasadas = await lista('atrasadas')
    expect(atrasadas.itens.map((a) => a.titulo).sort()).toEqual([
      'Dia inteiro de ontem',
      'Hora que já passou',
    ])
    expect(atrasadas.itens.every((a) => a.atrasada)).toBe(true)
    const agendadas = await lista('agendadas')
    expect(agendadas.itens.map((a) => a.titulo)).toEqual(['Dia inteiro de hoje'])
    expect(agendadas.contagens).toEqual({ agendadas: 1, atrasadas: 2, realizadas: 0 })
  })
})

describe('lista e abas', () => {
  it('abas, contagens, filtros e a linha do tempo (abertas primeiro, depois o histórico)', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Supermercado Alfa')
    const outra = await empresa(c.d.cookie, 'Café Beta')
    const daqui = (min: number) => new Date(Date.now() + min * 60_000).toISOString()
    await registrar(c.d.cookie, realizada(c.visita.id, e.id, diasAtras(3), { titulo: 'Feita 3d' }))
    await registrar(c.d.cookie, realizada(c.ligacao.id, e.id, diasAtras(1), { titulo: 'Feita 1d' }))
    await registrar(c.d.cookie, {
      tipoAtividadeId: c.visita.id,
      titulo: 'Adiantada',
      empresaId: e.id,
      dataInicio: daqui(60 * 48),
      situacao: 'pendente',
    })
    await registrar(c.d.cookie, {
      tipoAtividadeId: c.visita.id,
      titulo: 'Esquecida',
      empresaId: e.id,
      dataInicio: minutosAtras(60 * 24 * 2),
      situacao: 'pendente',
    })
    await registrar(
      c.d.cookie,
      realizada(c.visita.id, outra.id, diasAtras(2), { titulo: 'De outra' }),
    )

    const lista = async (q: string) =>
      (await chamar('get', c.d.cookie, `${ATIVIDADES}?${q}`)).body as ListaDeAtividades
    const titulos = (l: ListaDeAtividades) => l.itens.map((a) => a.titulo)

    const realizadas = await lista(`aba=realizadas&empresaId=${e.id}`)
    expect(titulos(realizadas)).toEqual(['Feita 1d', 'Feita 3d']) // a mais recente primeiro
    expect(realizadas.contagens).toEqual({ agendadas: 1, atrasadas: 1, realizadas: 2 })
    expect(titulos(await lista(`aba=agendadas&empresaId=${e.id}`))).toEqual(['Adiantada'])
    expect(titulos(await lista(`aba=atrasadas&empresaId=${e.id}`))).toEqual(['Esquecida'])
    // linha do tempo: abertas primeiro (a mais antiga), depois o histórico (o mais recente primeiro)
    expect(titulos(await lista(`empresaId=${e.id}`))).toEqual([
      'Esquecida',
      'Adiantada',
      'Feita 1d',
      'Feita 3d',
    ])
    // busca sem acento por empresa e por título; filtro por tipo e por responsável
    expect(titulos(await lista('busca=cafe'))).toEqual(['De outra'])
    expect(titulos(await lista(`busca=ESQUECIDA`))).toEqual(['Esquecida'])
    expect((await lista(`tipoAtividadeId=${c.ligacao.id}`)).total).toBe(1)
    expect((await lista('minhas=true')).total).toBe(5)
    expect((await lista(`responsavelId=${c.ana.membroId}`)).total).toBe(0)
    // paginação
    const p = await lista(`porPagina=2&pagina=2&empresaId=${e.id}`)
    expect(titulos(p)).toEqual(['Feita 1d', 'Feita 3d'])
    expect(p.total).toBe(4)
    expect((await chamar('get', c.d.cookie, `${ATIVIDADES}?porPagina=101`)).status).toBe(400)
  })
})

describe('permissões (regra de carteira)', () => {
  it('vendedor só registra e edita na própria carteira; o outro vendedor recebe 404', async () => {
    const c = await cenario()
    const daAna = await empresa(c.ana.cookie, 'Carteira da Ana')
    const daBia = await empresa(c.bia.cookie, 'Carteira da Bia')
    const feita = await registrar(c.ana.cookie, realizada(c.visita.id, daAna.id, diasAtras(1)))
    expect(feita.responsavel.id).toBe(c.ana.membroId)

    // empresa que a Ana não vê: 400 (empresa inválida), nada vaza
    const naoVe = await chamar(
      'post',
      c.ana.cookie,
      ATIVIDADES,
      realizada(c.visita.id, daBia.id, diasAtras(1)),
    )
    expect(erroDe(naoVe)).toBe('empresa_invalida')
    // a Bia não vê nem edita a atividade da Ana
    expect((await chamar('get', c.bia.cookie, `${ATIVIDADES}/${feita.id}`)).status).toBe(404)
    expect(
      (await chamar('patch', c.bia.cookie, `${ATIVIDADES}/${feita.id}`, { titulo: 'x' })).status,
    ).toBe(404)
    expect((await chamar('delete', c.bia.cookie, `${ATIVIDADES}/${feita.id}`)).status).toBe(404)
    const listaBia = (await chamar('get', c.bia.cookie, ATIVIDADES)).body as ListaDeAtividades
    expect(listaBia.itens).toEqual([])
    // vendedor não atribui a outra pessoa
    const paraOutro = await chamar('post', c.ana.cookie, ATIVIDADES, {
      ...realizada(c.visita.id, daAna.id, diasAtras(1)),
      responsavelId: c.bia.membroId,
    })
    expect(paraOutro.status).toBe(403)
    // gestor vê e edita tudo e atribui a qualquer vendedor
    const doGestor = await registrar(c.gestor.cookie, {
      ...realizada(c.visita.id, daAna.id, diasAtras(1)),
      responsavelId: c.ana.membroId,
    })
    expect(doGestor.responsavel.id).toBe(c.ana.membroId)
    expect(
      (await chamar('patch', c.gestor.cookie, `${ATIVIDADES}/${feita.id}`, { titulo: 'Revisada' }))
        .status,
    ).toBe(200)
  })

  it('com "vendedores veem todas", o vendedor vê a atividade da colega mas não a edita (403)', async () => {
    const c = await cenario()
    const daAna = await empresa(c.ana.cookie, 'Carteira da Ana')
    const feita = await registrar(c.ana.cookie, realizada(c.visita.id, daAna.id, diasAtras(1)))
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${c.d.tenantId}, true)`
      await tx`UPDATE tenant_configuracoes SET vendedor_ve_todas_empresas = true WHERE tenant_id = ${c.d.tenantId}`
    })
    const vista = await chamar('get', c.bia.cookie, `${ATIVIDADES}/${feita.id}`)
    expect(vista.status).toBe(200)
    expect((vista.body as Atividade).editavel).toBe(false)
    expect(
      (await chamar('patch', c.bia.cookie, `${ATIVIDADES}/${feita.id}`, { titulo: 'x' })).status,
    ).toBe(403)
    expect((await chamar('delete', c.bia.cookie, `${ATIVIDADES}/${feita.id}`)).status).toBe(403)
    expect((await chamar('post', c.bia.cookie, `${ATIVIDADES}/${feita.id}/cancelar`)).status).toBe(
      403,
    )
  })

  it('a Tarefa sem empresa só aparece para o responsável, o gestor e o administrador', async () => {
    const c = await cenario()
    const tarefa = await registrar(c.ana.cookie, {
      tipoAtividadeId: c.tarefa.id,
      titulo: 'Tarefa da Ana',
      dataInicio: new Date(Date.now() + 86_400_000).toISOString(),
      situacao: 'pendente',
    })
    expect((await chamar('get', c.bia.cookie, `${ATIVIDADES}/${tarefa.id}`)).status).toBe(404)
    expect((await chamar('get', c.ana.cookie, `${ATIVIDADES}/${tarefa.id}`)).status).toBe(200)
    expect((await chamar('get', c.gestor.cookie, `${ATIVIDADES}/${tarefa.id}`)).status).toBe(200)
    expect((await chamar('get', c.d.cookie, `${ATIVIDADES}/${tarefa.id}`)).status).toBe(200)
  })

  it('sem sessão, 401', async () => {
    expect((await chamar('get', undefined, ATIVIDADES)).status).toBe(401)
    expect((await chamar('post', undefined, ATIVIDADES, {})).status).toBe(401)
  })
})

describe('isolamento entre empresas e auditoria', () => {
  it('uma empresa não vê nem toca as atividades da outra', async () => {
    const a = await cenario()
    const b = await cenario()
    const e = await empresa(a.d.cookie, 'Empresa do tenant A')
    const feita = await registrar(a.d.cookie, realizada(a.visita.id, e.id, diasAtras(1)))
    expect((await chamar('get', b.d.cookie, `${ATIVIDADES}/${feita.id}`)).status).toBe(404)
    expect((await chamar('delete', b.d.cookie, `${ATIVIDADES}/${feita.id}`)).status).toBe(404)
    expect(((await chamar('get', b.d.cookie, ATIVIDADES)).body as ListaDeAtividades).total).toBe(0)
    // nem registrar usando a empresa ou o tipo do outro tenant
    const r = await chamar(
      'post',
      b.d.cookie,
      ATIVIDADES,
      realizada(b.visita.id, e.id, diasAtras(1)),
    )
    expect(erroDe(r)).toBe('empresa_invalida')
    const r2 = await chamar('post', b.d.cookie, ATIVIDADES, {
      ...realizada(a.visita.id, (await empresa(b.d.cookie, 'Do B')).id, diasAtras(1)),
    })
    expect(erroDe(r2)).toBe('tipo_invalido')
  })

  it('registra criar, alterar, concluir, cancelar e excluir na auditoria', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Auditada')
    const a = await registrar(c.d.cookie, {
      tipoAtividadeId: c.visita.id,
      titulo: 'Primeira',
      empresaId: e.id,
      dataInicio: new Date(Date.now() + 86_400_000).toISOString(),
      situacao: 'pendente',
    })
    await chamar('patch', c.d.cookie, `${ATIVIDADES}/${a.id}`, { titulo: 'Segunda' })
    await chamar('post', c.d.cookie, `${ATIVIDADES}/${a.id}/concluir`, { resultado: 'Feito' })
    await chamar('post', c.d.cookie, `${ATIVIDADES}/${a.id}/cancelar`)
    await chamar('delete', c.d.cookie, `${ATIVIDADES}/${a.id}`)
    const regs = (await auditoriaDe(c.d.tenantId)).filter((r) => r.entidade === 'atividade')
    expect(regs.map((r) => r.acao)).toEqual(['criar', 'alterar', 'concluir', 'cancelar', 'excluir'])
    expect(regs[1]?.alteracoes).toMatchObject({ titulo: { de: 'Primeira', para: 'Segunda' } })
  })
})
