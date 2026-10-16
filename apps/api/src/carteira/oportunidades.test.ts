import type { Server } from 'node:http'

import type {
  Atividade,
  EmpresaCarteira,
  Funil,
  KanbanDeOportunidades,
  ListaDeAtividades,
  ListaDeOportunidades,
  Motivo,
  Oportunidade,
  OportunidadeDetalhada,
  ResultadoDoMovimento,
  TagGrupo,
} from '@leadtogo/shared'
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
    .set('X-Forwarded-For', `10.6.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const OPS = '/v1/carteira/oportunidades'
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

/** Empresa com o administrador, um gestor e dois vendedores (Ana e Bia). */
async function cenario() {
  const d = await novoDono(app)
  const pessoa = async (papel: 'gestor' | 'vendedor', nome: string) => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, papel, nome)
    await ativar(u.id, d.tenantId)
    return { ...u, membroId }
  }
  const funis = (await chamar('get', d.cookie, '/v1/configuracoes/funis')).body as Funil[]
  const funil = funis.find((f) => f.padrao) as Funil
  const fase = (nome: string) => funil.fases.find((f) => f.nome === nome)?.id as string
  const motivos = (await chamar('get', d.cookie, '/v1/configuracoes/motivos')).body as Motivo[]
  const motivoDe = (status: 'perdido' | 'cancelado' | 'suspenso') =>
    motivos.find((m) => m.ativo && (m.aplicaA as string[]).includes(status))?.id as string
  const grupos = (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
  const tagsDeSistema = grupos.flatMap((g) => g.tags)
  return {
    d,
    gestor: await pessoa('gestor', 'Gestor'),
    ana: await pessoa('vendedor', 'Ana'),
    bia: await pessoa('vendedor', 'Bia'),
    funil,
    fase,
    motivoDe,
    tagCliente: tagsDeSistema.find((t) => t.chaveSistema === 'cliente') as { id: string },
  }
}

const empresa = async (cookie: string, nome: string) => {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    razaoSocial: nome,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as EmpresaCarteira
}
const ficha = async (cookie: string, id: string) =>
  (await chamar('get', cookie, `/v1/carteira/empresas/${id}`)).body as EmpresaCarteira
const nova = async (cookie: string, corpo: Record<string, unknown>, status = 201) => {
  const r = await chamar('post', cookie, OPS, corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(status)
  return r.body as Oportunidade
}
const fechar = (cookie: string, id: string, corpo: Record<string, unknown>) =>
  chamar('post', cookie, `${OPS}/${id}/fechar`, corpo)
const mover = (cookie: string, id: string, faseId: string) =>
  chamar('post', cookie, `${OPS}/${id}/mover`, { faseId })

describe('cadastrar oportunidade e valores', () => {
  it('usa o funil padrão, a 1ª fase, a probabilidade da fase e o vendedor da empresa; valores calculados', async () => {
    const c = await cenario()
    const e = await empresa(c.ana.cookie, 'Mercado Central')
    const o = await nova(c.ana.cookie, {
      titulo: ' Contrato anual ',
      empresaId: e.id,
      valorUnico: 2000,
      valorMensal: 500,
    })
    expect(o).toMatchObject({
      titulo: 'Contrato anual',
      status: 'ativo',
      funil: { id: c.funil.id },
      fase: { id: c.fase('Qualificação') },
      probabilidade: 10,
      probabilidadeManual: false,
      responsavel: { id: c.ana.membroId },
      valorUnico: 2000,
      valorMensal: 500,
      meses: 12, // valor mensal sem duração: 12 meses
      valorTotal: 8000, // 2.000 + 500 × 12, calculado pelo banco
      valorPonderado: 800, // 8.000 × 10%
      dataPrevistaFechamento: null,
      editavel: true,
      excluivel: false,
    })
    // sem valor mensal, a duração fica em zero e o total é só o único
    const unico = await nova(c.ana.cookie, {
      titulo: 'Só implantação',
      empresaId: e.id,
      valorUnico: 1500.5,
    })
    expect(unico).toMatchObject({ meses: 0, valorTotal: 1500.5 })
  })

  it('probabilidade digitada diferente da fase fica marcada à mão; igual à da fase, não', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Padaria')
    const manual = await nova(c.d.cookie, {
      titulo: 'A',
      empresaId: e.id,
      valorUnico: 1000,
      probabilidade: 80,
    })
    expect(manual).toMatchObject({
      probabilidade: 80,
      probabilidadeManual: true,
      valorPonderado: 800,
    })
    const igual = await nova(c.d.cookie, { titulo: 'B', empresaId: e.id, probabilidade: 10 })
    expect(igual).toMatchObject({ probabilidade: 10, probabilidadeManual: false })
  })

  it('editar valores recalcula o total e o ponderado; "só mensal" ganha 12 meses', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Oficina')
    const o = await nova(c.d.cookie, { titulo: 'Contrato', empresaId: e.id, valorUnico: 400 })
    expect(o.valorTotal).toBe(400)
    const r = await chamar('patch', c.d.cookie, `${OPS}/${o.id}`, { valorMensal: 100 })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body).toMatchObject({ meses: 12, valorTotal: 1600, valorPonderado: 160 })
    const r2 = await chamar('patch', c.d.cookie, `${OPS}/${o.id}`, { meses: 6 })
    expect(r2.body).toMatchObject({ valorTotal: 1000 })
    // o total não é uma entrada
    expect((await chamar('patch', c.d.cookie, `${OPS}/${o.id}`, { valorTotal: 5 })).status).toBe(
      400,
    )
    expect((await chamar('patch', c.d.cookie, `${OPS}/${o.id}`, { valorUnico: -1 })).status).toBe(
      400,
    )
  })

  it('a data prevista é opcional e o contato precisa ser da empresa', async () => {
    const c = await cenario()
    const e1 = await empresa(c.d.cookie, 'Empresa Um')
    const e2 = await empresa(c.d.cookie, 'Empresa Dois')
    const contato = (
      await chamar('post', c.d.cookie, '/v1/carteira/contatos', {
        nome: 'Dona Maria',
        vinculo: { empresaId: e1.id },
      })
    ).body as { id: string }
    const ok = await nova(c.d.cookie, {
      titulo: 'Com contato',
      empresaId: e1.id,
      contatoId: contato.id,
      dataPrevistaFechamento: '2026-12-15',
    })
    expect(ok).toMatchObject({
      contato: { id: contato.id, nome: 'Dona Maria' },
      dataPrevistaFechamento: '2026-12-15',
    })
    const errado = await chamar('post', c.d.cookie, OPS, {
      titulo: 'Contato de outra',
      empresaId: e2.id,
      contatoId: contato.id,
    })
    expect(erroDe(errado)).toBe('contato_invalido')
  })
})

describe('mover de fase e probabilidade', () => {
  it('a probabilidade acompanha a fase, a menos que tenha sido editada à mão (aí vem o aviso)', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Loja')
    const auto = await nova(c.d.cookie, { titulo: 'Automática', empresaId: e.id, valorUnico: 1000 })
    const r = await mover(c.d.cookie, auto.id, c.fase('Proposta'))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const m = r.body as ResultadoDoMovimento
    expect(m.oportunidade).toMatchObject({
      fase: { nome: 'Proposta' },
      probabilidade: 50,
      probabilidadeManual: false,
      valorPonderado: 500,
    })
    expect(m.avisoDeProbabilidade).toBeNull()

    const manual = await nova(c.d.cookie, {
      titulo: 'Manual',
      empresaId: e.id,
      valorUnico: 1000,
      probabilidade: 90,
    })
    const r2 = (await mover(c.d.cookie, manual.id, c.fase('Diagnóstico')))
      .body as ResultadoDoMovimento
    expect(r2.oportunidade).toMatchObject({ probabilidade: 90, probabilidadeManual: true })
    expect(r2.avisoDeProbabilidade).toEqual({ atual: 90, sugerida: 25 })

    // editar para o valor da fase volta a acompanhar a fase
    const volta = await chamar('patch', c.d.cookie, `${OPS}/${manual.id}`, { probabilidade: 25 })
    expect(volta.body).toMatchObject({ probabilidade: 25, probabilidadeManual: false })
    const r3 = (await mover(c.d.cookie, manual.id, c.fase('Negociação')))
      .body as ResultadoDoMovimento
    expect(r3.oportunidade.probabilidade).toBe(75)
  })

  it('só se move para fase ativa do mesmo funil; o histórico guarda cada mudança', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Distribuidora')
    const o = await nova(c.d.cookie, { titulo: 'Contrato', empresaId: e.id })
    // outro funil
    const outro = (
      await chamar('post', c.d.cookie, '/v1/configuracoes/funis', {
        nome: 'Renovação',
        fases: [{ nome: 'Aviso' }],
      })
    ).body as Funil
    const fora = await mover(c.d.cookie, o.id, outro.fases[0]?.id as string)
    expect(erroDe(fora)).toBe('fase_invalida')
    await mover(c.d.cookie, o.id, c.fase('Diagnóstico'))
    await mover(c.d.cookie, o.id, c.fase('Proposta'))
    const d = (await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body as OportunidadeDetalhada
    expect(d.historico.map((h) => h.titulo)).toEqual([
      'Fase: Diagnóstico → Proposta',
      'Fase: Qualificação → Diagnóstico',
      'Criada na fase Qualificação',
    ])
    expect(d.faseDesde).not.toBeNull()
  })
})

describe('fechar e reabrir', () => {
  it('Perdido, Cancelado e Suspenso exigem o motivo da lista do status; Conquistado não', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Papelaria')
    const o = await nova(c.d.cookie, { titulo: 'Contrato', empresaId: e.id })
    expect((await fechar(c.d.cookie, o.id, { status: 'perdido' })).status).toBe(400)
    // motivo que não vale para o status
    const doCancelado = c.motivoDe('cancelado')
    const naoVale = await fechar(c.d.cookie, o.id, {
      status: 'perdido',
      motivoId: '0191f2b4-0000-7000-8000-000000000009',
    })
    expect(erroDe(naoVale)).toBe('motivo_invalido')
    void doCancelado
    const perdida = await fechar(c.d.cookie, o.id, {
      status: 'perdido',
      motivoId: c.motivoDe('perdido'),
      detalhe: 'Fechou com o concorrente',
    })
    expect(perdida.status, JSON.stringify(perdida.body)).toBe(200)
    expect(perdida.body).toMatchObject({
      status: 'perdido',
      faseParouEm: { nome: 'Qualificação' },
      motivoDetalhe: 'Fechou com o concorrente',
    })
    expect((perdida.body as Oportunidade).dataFechamento).not.toBeNull()
    // fechada não se move nem se fecha de novo
    expect(erroDe(await mover(c.d.cookie, o.id, c.fase('Proposta')))).toBe('oportunidade_nao_ativa')
    expect(erroDe(await fechar(c.d.cookie, o.id, { status: 'conquistado' }))).toBe(
      'oportunidade_nao_ativa',
    )
  })

  it('a fase em que parou continua mesmo depois de mover outra; reabrir limpa tudo e registra', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Mecânica')
    const o = await nova(c.d.cookie, { titulo: 'Contrato', empresaId: e.id, valorUnico: 100 })
    await mover(c.d.cookie, o.id, c.fase('Negociação'))
    await fechar(c.d.cookie, o.id, { status: 'cancelado', motivoId: c.motivoDe('cancelado') })
    const r = await chamar('post', c.d.cookie, `${OPS}/${o.id}/reabrir`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body).toMatchObject({
      status: 'ativo',
      fase: { nome: 'Negociação' },
      faseParouEm: null,
      motivo: null,
      dataFechamento: null,
    })
    expect(erroDe(await chamar('post', c.d.cookie, `${OPS}/${o.id}/reabrir`))).toBe(
      'oportunidade_ja_ativa',
    )
    const d = (await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body as OportunidadeDetalhada
    expect(d.historico.map((h) => h.acao)).toEqual(['reaberta', 'status', 'fase', 'criada'])
  })

  it('Suspensa cria a atividade de retomada na data, com a mesma empresa e o mesmo responsável; reabrir a cancela', async () => {
    const c = await cenario()
    const e = await empresa(c.ana.cookie, 'Gráfica')
    const o = await nova(c.ana.cookie, { titulo: 'Contrato gráfico', empresaId: e.id })
    // sem "retomar em"
    expect(
      (await fechar(c.ana.cookie, o.id, { status: 'suspenso', motivoId: c.motivoDe('suspenso') }))
        .status,
    ).toBe(400)
    // no passado
    expect(
      erroDe(
        await fechar(c.ana.cookie, o.id, {
          status: 'suspenso',
          motivoId: c.motivoDe('suspenso'),
          retomarEm: '2020-01-01',
        }),
      ),
    ).toBe('retomar_no_passado')
    const r = await fechar(c.ana.cookie, o.id, {
      status: 'suspenso',
      motivoId: c.motivoDe('suspenso'),
      retomarEm: '2031-03-10',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body).toMatchObject({ status: 'suspenso', suspensaAte: '2031-03-10' })

    const atividades = (
      await chamar('get', c.ana.cookie, `/v1/carteira/atividades?oportunidadeId=${o.id}`)
    ).body as ListaDeAtividades
    expect(atividades.total).toBe(1)
    const a = atividades.itens[0] as Atividade
    expect(a).toMatchObject({
      titulo: 'Retomar: Contrato gráfico',
      situacao: 'pendente',
      diaInteiro: true,
      empresa: { id: e.id },
      responsavel: { id: c.ana.membroId },
      oportunidade: { id: o.id },
      tipo: { nome: 'Tarefa' },
    })
    // meia-noite de 10/03/2031 em São Paulo
    expect(a.dataInicio).toBe('2031-03-10T03:00:00.000Z')
    // a empresa enxerga como próxima atividade
    expect((await ficha(c.ana.cookie, e.id)).proximaAtividadeEm).toBe(a.dataInicio)

    const reaberta = await chamar('post', c.ana.cookie, `${OPS}/${o.id}/reabrir`)
    expect(reaberta.status).toBe(200)
    const depois = (
      await chamar('get', c.ana.cookie, `/v1/carteira/atividades?oportunidadeId=${o.id}`)
    ).body as ListaDeAtividades
    expect(depois.itens[0]?.situacao).toBe('cancelada')
    expect((await ficha(c.ana.cookie, e.id)).proximaAtividadeEm).toBeNull()
  })

  it('Conquistada muda a empresa para Cliente pela chave do sistema (mesmo renomeada) e reabrir não desfaz', async () => {
    const c = await cenario()
    // a empresa chama a tag Cliente de "Associado"
    const ren = await chamar('patch', c.d.cookie, `/v1/configuracoes/tags/${c.tagCliente.id}`, {
      nome: 'Associado',
    })
    expect(ren.status).toBe(200)
    const e = await empresa(c.d.cookie, 'Cooperativa')
    expect((await ficha(c.d.cookie, e.id)).tags.map((t) => t.nome)).toContain('Lead')
    const o = await nova(c.d.cookie, { titulo: 'Adesão', empresaId: e.id, valorUnico: 100 })
    const r = await fechar(c.d.cookie, o.id, { status: 'conquistado' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const nomes = (await ficha(c.d.cookie, e.id)).tags.map((t) => t.nome)
    expect(nomes).toContain('Associado')
    expect(nomes).not.toContain('Lead')
    // reabrir não volta o Status
    await chamar('post', c.d.cookie, `${OPS}/${o.id}/reabrir`)
    expect((await ficha(c.d.cookie, e.id)).tags.map((t) => t.nome)).toContain('Associado')
  })

  it('"empresa vira Cliente" desligado no fechamento ou na configuração não mexe na empresa', async () => {
    const c = await cenario()
    const e1 = await empresa(c.d.cookie, 'Empresa Um')
    const o1 = await nova(c.d.cookie, { titulo: 'A', empresaId: e1.id })
    await fechar(c.d.cookie, o1.id, { status: 'conquistado', empresaViraCliente: false })
    expect((await ficha(c.d.cookie, e1.id)).tags.map((t) => t.nome)).toContain('Lead')

    await noTenant(c.d.tenantId, async (tx) => {
      await tx`UPDATE tenant_configuracoes SET status_cliente_ao_conquistar = false WHERE tenant_id = ${c.d.tenantId}`
    })
    const e2 = await empresa(c.d.cookie, 'Empresa Dois')
    const o2 = await nova(c.d.cookie, { titulo: 'B', empresaId: e2.id })
    await fechar(c.d.cookie, o2.id, { status: 'conquistado' })
    expect((await ficha(c.d.cookie, e2.id)).tags.map((t) => t.nome)).toContain('Lead')
    // e ligando no próprio fechamento, vale
    const o3 = await nova(c.d.cookie, { titulo: 'C', empresaId: e2.id })
    await fechar(c.d.cookie, o3.id, { status: 'conquistado', empresaViraCliente: true })
    expect((await ficha(c.d.cookie, e2.id)).tags.map((t) => t.nome)).toContain('Cliente')
  })
})

describe('Kanban e lista', () => {
  it('colunas das fases ativas com contagem e soma, só Ativas, resumo e suspensas', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Atacadão')
    const a = await nova(c.d.cookie, {
      titulo: 'A',
      empresaId: e.id,
      valorUnico: 1000,
      probabilidade: 50,
    })
    await nova(c.d.cookie, {
      titulo: 'B',
      empresaId: e.id,
      valorUnico: 500,
      valorMensal: 100,
      meses: 5,
    })
    const c1 = await nova(c.d.cookie, { titulo: 'C', empresaId: e.id, valorUnico: 200 })
    await mover(c.d.cookie, c1.id, c.fase('Proposta'))
    const perdida = await nova(c.d.cookie, { titulo: 'Perdida', empresaId: e.id, valorUnico: 9999 })
    await fechar(c.d.cookie, perdida.id, { status: 'perdido', motivoId: c.motivoDe('perdido') })
    const susp = await nova(c.d.cookie, { titulo: 'Suspensa', empresaId: e.id })
    await fechar(c.d.cookie, susp.id, {
      status: 'suspenso',
      motivoId: c.motivoDe('suspenso'),
      retomarEm: '2031-01-01',
    })

    const k = (await chamar('get', c.d.cookie, `${OPS}/kanban`)).body as KanbanDeOportunidades
    expect(k.funil.id).toBe(c.funil.id)
    expect(k.fases.map((f) => f.nome)).toEqual([
      'Qualificação',
      'Diagnóstico',
      'Proposta',
      'Negociação',
    ])
    const por = (nome: string) => k.fases.find((f) => f.nome === nome)!
    expect(por('Qualificação')).toMatchObject({ quantidade: 2, total: 2000, semMostrar: 0 })
    expect(
      por('Qualificação')
        .itens.map((i) => i.titulo)
        .sort(),
    ).toEqual(['A', 'B'])
    expect(por('Proposta')).toMatchObject({ quantidade: 1, total: 200 })
    expect(por('Diagnóstico')).toMatchObject({ quantidade: 0, total: 0, itens: [] })
    // resumo: 3 ativas; total 1000 + 1000 + 200; mensal 100; ponderado 500 + 100 + 100
    expect(k.resumo).toEqual({ ativas: 3, total: 2200, mensal: 100, ponderado: 700 })
    expect(k.suspensas).toBe(1)
    void a
  })

  it('o Kanban não mostra fase inativa; filtra por responsável e busca', async () => {
    const c = await cenario()
    const e1 = await empresa(c.ana.cookie, 'Café da Ana')
    const e2 = await empresa(c.bia.cookie, 'Doces da Bia')
    await nova(c.ana.cookie, { titulo: 'Da Ana', empresaId: e1.id })
    await nova(c.bia.cookie, { titulo: 'Da Bia', empresaId: e2.id })
    const todas = (await chamar('get', c.d.cookie, `${OPS}/kanban`)).body as KanbanDeOportunidades
    expect(todas.resumo.ativas).toBe(2)
    const daAna = (await chamar('get', c.d.cookie, `${OPS}/kanban?responsavelId=${c.ana.membroId}`))
      .body as KanbanDeOportunidades
    expect(daAna.resumo.ativas).toBe(1)
    const busca = (await chamar('get', c.d.cookie, `${OPS}/kanban?busca=doces`))
      .body as KanbanDeOportunidades
    expect(busca.fases[0]?.itens.map((i) => i.titulo)).toEqual(['Da Bia'])
    // inativar uma fase (sem oportunidades) tira a coluna
    const f = await chamar(
      'patch',
      c.d.cookie,
      `/v1/configuracoes/funis/fases/${c.fase('Diagnóstico')}`,
      {
        ativo: false,
      },
    )
    expect(f.status, JSON.stringify(f.body)).toBe(200)
    const sem = (await chamar('get', c.d.cookie, `${OPS}/kanban`)).body as KanbanDeOportunidades
    expect(sem.fases.map((x) => x.nome)).toEqual(['Qualificação', 'Proposta', 'Negociação'])
  })

  it('alerta de parada: dias na fase (ou desde a última atividade) além do limite da fase', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Fábrica')
    const o = await nova(c.d.cookie, { titulo: 'Parada', empresaId: e.id })
    // a fase Qualificação padrão alerta com 14 dias
    expect((await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body).toMatchObject({
      parada: false,
      diasParada: 0,
    })
    await noTenant(c.d.tenantId, async (tx) => {
      await tx`UPDATE oportunidades SET fase_desde = now() - interval '20 days' WHERE id = ${o.id}`
    })
    expect((await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body).toMatchObject({
      parada: true,
      diasParada: 20,
    })
    // uma atividade realizada hoje, ligada à oportunidade, zera a contagem
    const tipos = (await chamar('get', c.d.cookie, '/v1/configuracoes/tipos-atividade')).body as {
      id: string
      chaveSistema: string | null
    }[]
    const visita = tipos.find((t) => t.chaveSistema === 'visita')?.id
    const r = await chamar('post', c.d.cookie, '/v1/carteira/atividades', {
      tipoAtividadeId: visita,
      titulo: 'Visita',
      empresaId: e.id,
      oportunidadeId: o.id,
      dataInicio: new Date(Date.now() - 60_000).toISOString(),
      situacao: 'realizada',
      resultado: 'Conversa boa',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const depois = (await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body as Oportunidade
    expect(depois).toMatchObject({ parada: false, diasParada: 0 })
    expect(depois.ultimaAtividadeEm).not.toBeNull()
  })

  it('lista: filtros, ordenação por total, somas e paginação', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Revenda')
    for (const [titulo, v] of [
      ['Pequena', 100],
      ['Grande', 5000],
      ['Média', 800],
    ] as const) {
      await nova(c.d.cookie, { titulo, empresaId: e.id, valorUnico: v })
    }
    const lista = async (q: string) =>
      (await chamar('get', c.d.cookie, `${OPS}?${q}`)).body as ListaDeOportunidades
    const porTotal = await lista('ordem=total&sentido=desc')
    expect(porTotal.itens.map((o) => o.titulo)).toEqual(['Grande', 'Média', 'Pequena'])
    expect(porTotal.somas).toEqual({ total: 5900, mensal: 0, ponderado: 590 })
    expect((await lista('busca=GRANDE')).itens.map((o) => o.titulo)).toEqual(['Grande'])
    expect((await lista('status=perdido')).total).toBe(0)
    const p = await lista('ordem=total&sentido=desc&porPagina=2&pagina=2')
    expect(p.itens.map((o) => o.titulo)).toEqual(['Pequena'])
    expect(p.total).toBe(3)
    expect((await chamar('get', c.d.cookie, `${OPS}?porPagina=101`)).status).toBe(400)
  })
})

describe('permissões (regra de carteira)', () => {
  it('vendedor cria, edita, move e fecha só nas empresas dele; o outro recebe 404', async () => {
    const c = await cenario()
    const daAna = await empresa(c.ana.cookie, 'Carteira da Ana')
    const daBia = await empresa(c.bia.cookie, 'Carteira da Bia')
    const o = await nova(c.ana.cookie, { titulo: 'Da Ana', empresaId: daAna.id })
    expect(
      erroDe(await chamar('post', c.ana.cookie, OPS, { titulo: 'x', empresaId: daBia.id })),
    ).toBe('empresa_invalida')
    expect((await chamar('get', c.bia.cookie, `${OPS}/${o.id}`)).status).toBe(404)
    expect((await chamar('patch', c.bia.cookie, `${OPS}/${o.id}`, { titulo: 'x' })).status).toBe(
      404,
    )
    expect((await mover(c.bia.cookie, o.id, c.fase('Proposta'))).status).toBe(404)
    expect(((await chamar('get', c.bia.cookie, OPS)).body as ListaDeOportunidades).total).toBe(0)
    expect(
      ((await chamar('get', c.bia.cookie, `${OPS}/kanban`)).body as KanbanDeOportunidades).resumo
        .ativas,
    ).toBe(0)
    // vendedor não atribui a outra pessoa; gestor atribui
    expect(
      (
        await chamar('post', c.ana.cookie, OPS, {
          titulo: 'x',
          empresaId: daAna.id,
          responsavelId: c.bia.membroId,
        })
      ).status,
    ).toBe(403)
    const doGestor = await nova(c.gestor.cookie, {
      titulo: 'Do gestor',
      empresaId: daAna.id,
      responsavelId: c.bia.membroId,
    })
    expect(doGestor.responsavel.id).toBe(c.bia.membroId)
    expect((await mover(c.gestor.cookie, o.id, c.fase('Proposta'))).status).toBe(200)
  })

  it('com "vendedores veem todas", o vendedor vê a oportunidade da colega, mas não a altera (403)', async () => {
    const c = await cenario()
    const daAna = await empresa(c.ana.cookie, 'Carteira da Ana')
    const o = await nova(c.ana.cookie, { titulo: 'Da Ana', empresaId: daAna.id })
    await noTenant(c.d.tenantId, async (tx) => {
      await tx`UPDATE tenant_configuracoes SET vendedor_ve_todas_empresas = true WHERE tenant_id = ${c.d.tenantId}`
    })
    const vista = await chamar('get', c.bia.cookie, `${OPS}/${o.id}`)
    expect(vista.status).toBe(200)
    expect((vista.body as Oportunidade).editavel).toBe(false)
    expect((await chamar('patch', c.bia.cookie, `${OPS}/${o.id}`, { titulo: 'x' })).status).toBe(
      403,
    )
    expect((await mover(c.bia.cookie, o.id, c.fase('Proposta'))).status).toBe(403)
    expect((await fechar(c.bia.cookie, o.id, { status: 'conquistado' })).status).toBe(403)
  })

  it('excluir é lógico e só de admin e gestor; some da lista, do Kanban e da agenda de retomada', async () => {
    const c = await cenario()
    const e = await empresa(c.ana.cookie, 'Loja da Ana')
    const o = await nova(c.ana.cookie, { titulo: 'Contrato', empresaId: e.id })
    expect((await chamar('delete', c.ana.cookie, `${OPS}/${o.id}`)).status).toBe(403)
    const susp = await nova(c.ana.cookie, { titulo: 'Suspensa', empresaId: e.id })
    await fechar(c.ana.cookie, susp.id, {
      status: 'suspenso',
      motivoId: c.motivoDe('suspenso'),
      retomarEm: '2031-05-05',
    })
    expect((await chamar('delete', c.gestor.cookie, `${OPS}/${o.id}`)).status).toBe(204)
    expect((await chamar('delete', c.d.cookie, `${OPS}/${susp.id}`)).status).toBe(204)
    expect((await chamar('get', c.ana.cookie, `${OPS}/${o.id}`)).status).toBe(404)
    expect(((await chamar('get', c.d.cookie, OPS)).body as ListaDeOportunidades).total).toBe(0)
    // a atividade de retomada da suspensa foi cancelada
    const ativ = (await chamar('get', c.d.cookie, '/v1/carteira/atividades?aba=agendadas'))
      .body as ListaDeAtividades
    expect(ativ.itens.filter((a) => a.titulo.startsWith('Retomar'))).toEqual([])
    expect((await ficha(c.d.cookie, e.id)).proximaAtividadeEm).toBeNull()
  })

  it('sem sessão, 401', async () => {
    expect((await chamar('get', undefined, OPS)).status).toBe(401)
    expect((await chamar('post', undefined, OPS, {})).status).toBe(401)
  })
})

describe('atividade ligada à oportunidade', () => {
  it('a oportunidade guarda a próxima atividade e a última realizada; precisa ser da empresa da atividade', async () => {
    const c = await cenario()
    const e1 = await empresa(c.d.cookie, 'Empresa Um')
    const e2 = await empresa(c.d.cookie, 'Empresa Dois')
    const o = await nova(c.d.cookie, { titulo: 'Contrato', empresaId: e1.id })
    const tipos = (await chamar('get', c.d.cookie, '/v1/configuracoes/tipos-atividade')).body as {
      id: string
      chaveSistema: string | null
    }[]
    const visita = tipos.find((t) => t.chaveSistema === 'visita')?.id
    const daqui = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const agendada = (
      await chamar('post', c.d.cookie, '/v1/carteira/atividades', {
        tipoAtividadeId: visita,
        titulo: 'Apresentar proposta',
        empresaId: e1.id,
        oportunidadeId: o.id,
        dataInicio: daqui,
        situacao: 'pendente',
      })
    ).body as Atividade
    expect(agendada.oportunidade).toMatchObject({ id: o.id, nome: 'Contrato' })
    let d = (await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body as Oportunidade
    expect(d.proximaAtividade).toMatchObject({ id: agendada.id, titulo: 'Apresentar proposta' })
    expect(d.ultimaAtividadeEm).toBeNull()
    // concluir: sai da próxima e vira a última
    await chamar('post', c.d.cookie, `/v1/carteira/atividades/${agendada.id}/concluir`, {
      resultado: 'Entregue',
    })
    d = (await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body as Oportunidade
    expect(d.proximaAtividade).toBeNull()
    expect(d.ultimaAtividadeEm).not.toBeNull()
    // oportunidade de outra empresa
    const errada = await chamar('post', c.d.cookie, '/v1/carteira/atividades', {
      tipoAtividadeId: visita,
      titulo: 'Errada',
      empresaId: e2.id,
      oportunidadeId: o.id,
      dataInicio: daqui,
      situacao: 'pendente',
    })
    expect(erroDe(errada)).toBe('oportunidade_invalida')
    // excluir a atividade volta a oportunidade ao estado sem atividade
    await chamar('delete', c.d.cookie, `/v1/carteira/atividades/${agendada.id}`)
    d = (await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body as Oportunidade
    expect(d.ultimaAtividadeEm).toBeNull()
  })
})

describe('regra de fase e de funil (Módulo 1)', () => {
  const fasesUrl = (id: string) => `/v1/configuracoes/funis/fases/${id}`

  it('fase com oportunidades ativas só sai de uso depois de movê-las; fase que já teve só se inativa', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Indústria')
    const o = await nova(c.d.cookie, { titulo: 'Contrato', empresaId: e.id })
    const fase = c.fase('Qualificação')
    // ativa na fase: nem excluir nem inativar
    expect(erroDe(await chamar('delete', c.d.cookie, fasesUrl(fase)))).toBe(
      'fase_com_oportunidades_ativas',
    )
    expect(erroDe(await chamar('patch', c.d.cookie, fasesUrl(fase), { ativo: false }))).toBe(
      'fase_com_oportunidades_ativas',
    )
    // movida: não está mais ativa lá, mas a fase já foi usada: só inativa
    await mover(c.d.cookie, o.id, c.fase('Diagnóstico'))
    expect(erroDe(await chamar('delete', c.d.cookie, fasesUrl(fase)))).toBe('fase_ja_usada')
    const inativada = await chamar('patch', c.d.cookie, fasesUrl(fase), { ativo: false })
    expect(inativada.status, JSON.stringify(inativada.body)).toBe(200)
    // o histórico e a "fase em que parou" seguem mostrando o nome
    await fechar(c.d.cookie, o.id, { status: 'conquistado' })
    await mover(c.d.cookie, o.id, c.fase('Proposta')) // fechada não se move
    const d = (await chamar('get', c.d.cookie, `${OPS}/${o.id}`)).body as OportunidadeDetalhada
    expect(d.faseParouEm?.nome).toBe('Diagnóstico')
    expect(d.historico.some((h) => h.titulo.includes('Qualificação'))).toBe(true)
    // reativar é permitido; a fase nunca usada ainda se exclui
    expect((await chamar('patch', c.d.cookie, fasesUrl(fase), { ativo: true })).status).toBe(200)
    expect((await chamar('delete', c.d.cookie, fasesUrl(c.fase('Negociação')))).status).toBe(200)
  })

  it('o funil precisa de ao menos uma fase ativa', async () => {
    const c = await cenario()
    const outro = (
      await chamar('post', c.d.cookie, '/v1/configuracoes/funis', {
        nome: 'Renovação',
        fases: [{ nome: 'Aviso' }, { nome: 'Fechamento' }],
      })
    ).body as Funil
    const [a, b] = outro.fases
    expect(
      (await chamar('patch', c.d.cookie, fasesUrl(a?.id as string), { ativo: false })).status,
    ).toBe(200)
    expect(
      erroDe(await chamar('patch', c.d.cookie, fasesUrl(b?.id as string), { ativo: false })),
    ).toBe('ultima_fase')
    expect(erroDe(await chamar('delete', c.d.cookie, fasesUrl(b?.id as string)))).toBe(
      'ultima_fase',
    )
  })

  it('funil com oportunidades ativas não se inativa; funil que já teve só se inativa', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Comércio')
    const outro = (
      await chamar('post', c.d.cookie, '/v1/configuracoes/funis', {
        nome: 'Renovação',
        fases: [{ nome: 'Aviso' }],
      })
    ).body as Funil
    const o = await nova(c.d.cookie, {
      titulo: 'Renovar',
      empresaId: e.id,
      funilId: outro.id,
    })
    const url = `/v1/configuracoes/funis/${outro.id}`
    expect(erroDe(await chamar('patch', c.d.cookie, url, { ativo: false }))).toBe(
      'funil_com_oportunidades_ativas',
    )
    expect(erroDe(await chamar('delete', c.d.cookie, url))).toBe('funil_ja_usado')
    await fechar(c.d.cookie, o.id, { status: 'cancelado', motivoId: c.motivoDe('cancelado') })
    // só fechadas: pode inativar, mas excluir continua recusado (já foi usado)
    expect((await chamar('patch', c.d.cookie, url, { ativo: false })).status).toBe(200)
    expect(erroDe(await chamar('delete', c.d.cookie, url))).toBe('funil_ja_usado')
    // um funil nunca usado se exclui
    const virgem = (
      await chamar('post', c.d.cookie, '/v1/configuracoes/funis', {
        nome: 'Virgem',
        fases: [{ nome: 'F' }],
      })
    ).body as Funil
    expect(
      (await chamar('delete', c.d.cookie, `/v1/configuracoes/funis/${virgem.id}`)).status,
    ).toBe(204)
  })
})

describe('isolamento entre empresas e auditoria', () => {
  it('uma empresa não vê nem toca as oportunidades da outra', async () => {
    const a = await cenario()
    const b = await cenario()
    const e = await empresa(a.d.cookie, 'Empresa do tenant A')
    const o = await nova(a.d.cookie, { titulo: 'Segredo', empresaId: e.id })
    expect((await chamar('get', b.d.cookie, `${OPS}/${o.id}`)).status).toBe(404)
    expect((await chamar('delete', b.d.cookie, `${OPS}/${o.id}`)).status).toBe(404)
    expect(((await chamar('get', b.d.cookie, OPS)).body as ListaDeOportunidades).total).toBe(0)
    const r = await chamar('post', b.d.cookie, OPS, { titulo: 'x', empresaId: e.id })
    expect(erroDe(r)).toBe('empresa_invalida')
    const r2 = await chamar('post', b.d.cookie, OPS, {
      titulo: 'y',
      empresaId: (await empresa(b.d.cookie, 'Do B')).id,
      funilId: a.funil.id,
    })
    expect(erroDe(r2)).toBe('funil_invalido')
  })

  it('registra criar, alterar, mover, fechar, reabrir e excluir na auditoria', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Auditada')
    const o = await nova(c.d.cookie, { titulo: 'Primeira', empresaId: e.id })
    await chamar('patch', c.d.cookie, `${OPS}/${o.id}`, { titulo: 'Segunda' })
    await mover(c.d.cookie, o.id, c.fase('Proposta'))
    await fechar(c.d.cookie, o.id, { status: 'conquistado' })
    await chamar('post', c.d.cookie, `${OPS}/${o.id}/reabrir`)
    await chamar('delete', c.d.cookie, `${OPS}/${o.id}`)
    const regs = (await auditoriaDe(c.d.tenantId)).filter((r) => r.entidade === 'oportunidade')
    expect(regs.map((r) => r.acao)).toEqual([
      'criar',
      'alterar',
      'mover',
      'fechar',
      'reabrir',
      'excluir',
    ])
    expect(regs[1]?.alteracoes).toMatchObject({ titulo: { de: 'Primeira', para: 'Segunda' } })
  })
})
