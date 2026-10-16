import type { Server } from 'node:http'

import {
  type Dashboard,
  diaNoFuso,
  inicioDoDiaNoFuso,
  type ListaDeAtividades,
  type ListaDeEmpresas,
  type ListaDeOportunidades,
  periodoDoDashboard,
} from '@leadtogo/shared'
import type { EmpresaCarteira, Funil, Motivo, Oportunidade, TagGrupo } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configuracaoDaTeste } from '../testes/dashboard.js'
import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDaTeste())
})
afterEach(() => app.close())

type Metodo = 'get' | 'post' | 'patch' | 'delete'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.7.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const DASH = '/v1/carteira/dashboard'
const OPS = '/v1/carteira/oportunidades'
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>
const sqlCru = (tenantId: string, consulta: string, params: unknown[] = []) =>
  noTenant(tenantId, async (tx) => {
    await (tx as unknown as { unsafe: (q: string, p: unknown[]) => Promise<unknown> }).unsafe(
      consulta,
      params,
    )
  })

async function cenario() {
  const d = await novoDono(app)
  const pessoa = async (papel: 'gestor' | 'vendedor', nome: string) => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, papel, nome)
    await ativar(u.id, d.tenantId)
    return { ...u, membroId }
  }
  const funil = ((await chamar('get', d.cookie, '/v1/configuracoes/funis')).body as Funil[]).find(
    (f) => f.padrao,
  ) as Funil
  const motivos = (await chamar('get', d.cookie, '/v1/configuracoes/motivos')).body as Motivo[]
  const motivoDe = (status: 'perdido' | 'cancelado', indice = 0) =>
    motivos.filter((m) => m.ativo && (m.aplicaA as string[]).includes(status))[indice]?.id as string
  const grupos = (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
  const tag = (chave: string) =>
    grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === chave) as {
      id: string
      nome: string
    }
  const tipos = (await chamar('get', d.cookie, '/v1/configuracoes/tipos-atividade')).body as {
    id: string
    chaveSistema: string | null
  }[]
  return {
    d,
    ana: await pessoa('vendedor', 'Ana'),
    bia: await pessoa('vendedor', 'Bia'),
    funil,
    fase: (nome: string) => funil.fases.find((f) => f.nome === nome)?.id as string,
    motivoDe,
    tag,
    tipo: (chave: string) => tipos.find((t) => t.chaveSistema === chave)?.id as string,
  }
}
type Cenario = Awaited<ReturnType<typeof cenario>>

const empresa = async (cookie: string, nome: string, extra: Record<string, unknown> = {}) => {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    razaoSocial: nome,
    ...extra,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as EmpresaCarteira
}
const nova = async (cookie: string, corpo: Record<string, unknown>) => {
  const r = await chamar('post', cookie, OPS, corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as Oportunidade
}
const dashboard = async (cookie: string, q = '') => {
  const r = await chamar('get', cookie, `${DASH}${q}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as Dashboard
}
/** Fecha a oportunidade e coloca a data de fechamento onde o teste quer (instante ISO). */
async function fecharEm(
  c: Cenario,
  cookie: string,
  o: Oportunidade,
  status: 'conquistado' | 'perdido' | 'cancelado',
  quando: Date,
  motivoId?: string,
) {
  const r = await chamar('post', cookie, `${OPS}/${o.id}/fechar`, {
    status,
    ...(status === 'conquistado' ? { empresaViraCliente: false } : { motivoId }),
  })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  await sqlCru(c.d.tenantId, `UPDATE oportunidades SET data_fechamento = $1 WHERE id = $2`, [
    quando.toISOString(),
    o.id,
  ])
}

const agora = () => new Date()
const hoje = () => diaNoFuso(agora())
const somarDias = (dia: string, n: number): string => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const periodoAtual = () => periodoDoDashboard('mes', agora())

describe('Dashboard: estrutura', () => {
  it('empresa nova: tudo zerado, o funil padrão com as fases, os Status e o prazo de 60 dias', async () => {
    const c = await cenario()
    const x = await dashboard(c.d.cookie)
    expect(x.periodo).toMatchObject({
      chave: 'mes',
      inicio: periodoAtual().inicio,
      fim: periodoAtual().fim,
    })
    expect(x.previsao).toEqual({ valor: 0, quantidade: 0, semPrevisao: 0 })
    expect(x.mrr).toMatchObject({ valor: 0, quantidade: 0, anterior: 0, variacao: null })
    expect(x.mrr.serie).toHaveLength(6)
    expect(x.conversao).toEqual({ taxa: null, conquistadas: 0, perdidas: 0 })
    expect(x.motivosDePerda).toEqual([])
    expect(x.funil.nome).toBe(c.funil.nome)
    expect(x.funil.fases.map((f) => f.nome)).toEqual([
      'Qualificação',
      'Diagnóstico',
      'Proposta',
      'Negociação',
    ])
    expect(x.carteira.porStatus.map((s) => s.chaveSistema)).toEqual([
      'lead',
      'prospect',
      'cliente',
      'inativo',
    ])
    expect(x.carteira.total).toBe(0)
    expect(x.semContato).toEqual({ dias: 60, total: 0, itens: [] })
    expect(x.atividades).toEqual({ hoje: 0, atrasadas: 0, proximos7: 0 })
  })

  it('período inválido é recusado e sem sessão é 401', async () => {
    const c = await cenario()
    expect((await chamar('get', c.d.cookie, `${DASH}?periodo=ano`)).status).toBe(400)
    expect((await chamar('get', undefined, DASH)).status).toBe(401)
    expect(
      erroDe(
        await chamar('get', c.d.cookie, `${DASH}?funilId=0191f2b4-0000-7000-8000-000000000009`),
      ),
    ).toBe('funil_nao_encontrado')
  })
})

describe('Dashboard: previsão', () => {
  it('soma o valor ponderado das ativas com data prevista no período; as sem data vão para "sem previsão"', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Mercado')
    const noMes = periodoAtual()
    const dentro = (n: number) => somarDias(noMes.inicio, n)
    // 1.000 × 10% = 100 e 2.000 × 50% = 1.000 (dentro do mês)
    await nova(c.d.cookie, {
      titulo: 'A',
      empresaId: e.id,
      valorUnico: 1000,
      dataPrevistaFechamento: dentro(2),
    })
    await nova(c.d.cookie, {
      titulo: 'B',
      empresaId: e.id,
      valorUnico: 2000,
      probabilidade: 50,
      dataPrevistaFechamento: noMes.fim,
    })
    // fora do mês, sem data e fechada: não entram
    await nova(c.d.cookie, {
      titulo: 'Fora',
      empresaId: e.id,
      valorUnico: 9000,
      dataPrevistaFechamento: somarDias(noMes.fim, 1),
    })
    await nova(c.d.cookie, { titulo: 'Sem data', empresaId: e.id, valorUnico: 5000 })
    const fechada = await nova(c.d.cookie, {
      titulo: 'Fechada',
      empresaId: e.id,
      valorUnico: 7000,
      dataPrevistaFechamento: dentro(1),
    })
    await chamar('post', c.d.cookie, `${OPS}/${fechada.id}/fechar`, {
      status: 'conquistado',
      empresaViraCliente: false,
    })

    const x = await dashboard(c.d.cookie)
    expect(x.previsao).toEqual({ valor: 1100, quantidade: 2, semPrevisao: 1 })
    // o mês anterior não tem nada previsto
    expect((await dashboard(c.d.cookie, '?periodo=mes_anterior')).previsao.quantidade).toBe(0)
  })
})

describe('Dashboard: conquistadas, perdidas, conversão e MRR', () => {
  it('conta só o que fechou no período; a conversão deixa as canceladas de fora; MRR e variação', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Atacadão')
    const p = periodoAtual()
    const meio = inicioDoDiaNoFuso(somarDias(p.inicio, 3))
    const mesPassado = inicioDoDiaNoFuso(somarDias(p.inicio, -5))

    const c1 = await nova(c.d.cookie, {
      titulo: 'C1',
      empresaId: e.id,
      valorUnico: 1000,
      valorMensal: 100,
      meses: 10,
    })
    const c2 = await nova(c.d.cookie, { titulo: 'C2', empresaId: e.id, valorMensal: 200, meses: 5 })
    const antiga = await nova(c.d.cookie, {
      titulo: 'Antiga',
      empresaId: e.id,
      valorMensal: 100,
      meses: 12,
    })
    await fecharEm(c, c.d.cookie, c1, 'conquistado', meio)
    await fecharEm(c, c.d.cookie, c2, 'conquistado', meio)
    await fecharEm(c, c.d.cookie, antiga, 'conquistado', mesPassado)
    const p1 = await nova(c.d.cookie, { titulo: 'P1', empresaId: e.id, valorUnico: 4000 })
    const k1 = await nova(c.d.cookie, { titulo: 'K1', empresaId: e.id, valorUnico: 600 })
    await fecharEm(c, c.d.cookie, p1, 'perdido', meio, c.motivoDe('perdido'))
    await fecharEm(c, c.d.cookie, k1, 'cancelado', meio, c.motivoDe('cancelado'))
    // suspensa não entra em nada
    const s1 = await nova(c.d.cookie, { titulo: 'S1', empresaId: e.id, valorUnico: 999 })
    await chamar('post', c.d.cookie, `${OPS}/${s1.id}/fechar`, {
      status: 'suspenso',
      motivoId: c.motivoDe('perdido'),
      retomarEm: somarDias(hoje(), 30),
    })

    const x = await dashboard(c.d.cookie)
    // MRR = 100 + 200; o do mês passado = 100 → +200%
    expect(x.mrr).toMatchObject({ valor: 300, quantidade: 2, anterior: 100, variacao: 200 })
    expect(x.resultado.conquistadas).toEqual({ quantidade: 2, total: 2000 + 1000, mensal: 300 })
    expect(x.conversao).toEqual({ taxa: 66.7, conquistadas: 2, perdidas: 1 }) // 2 ÷ (2 + 1); a cancelada fica fora
    expect(x.resultado.perdidasECanceladas).toEqual({
      quantidade: 2,
      total: 4600,
      perdidas: 1,
      canceladas: 1,
    })
    // a série dos 6 meses termina no mês atual e o último ponto é o MRR do período
    expect(x.mrr.serie[5]).toMatchObject({ valor: 300, quantidade: 2 })
    expect(x.mrr.serie[4]?.valor).toBe(100)
    // o mês anterior olha para o que fechou lá
    const ant = await dashboard(c.d.cookie, '?periodo=mes_anterior')
    expect(ant.mrr).toMatchObject({ valor: 100, quantidade: 1 })
    expect(ant.mrr.serie[5]?.valor).toBe(100)
  })

  it('borda de mês no fuso da empresa: 22h do último dia e 00h30 do primeiro caem no mês certo', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Borda')
    const p = periodoAtual()
    const meiaNoite = inicioDoDiaNoFuso(p.inicio) // 00h de 1º no fuso da empresa
    const as22 = new Date(meiaNoite.getTime() - 2 * 3_600_000) // 22h do último dia do mês anterior
    const as0030 = new Date(meiaNoite.getTime() + 30 * 60_000) // 00h30 do dia 1º
    const a = await nova(c.d.cookie, { titulo: '22h', empresaId: e.id, valorMensal: 100, meses: 1 })
    const b = await nova(c.d.cookie, {
      titulo: '00h30',
      empresaId: e.id,
      valorMensal: 40,
      meses: 1,
    })
    await fecharEm(c, c.d.cookie, a, 'conquistado', as22)
    await fecharEm(c, c.d.cookie, b, 'conquistado', as0030)
    const x = await dashboard(c.d.cookie)
    expect(x.mrr).toMatchObject({ valor: 40, anterior: 100 }) // a de 22h é do mês passado, mesmo que em UTC já fosse o dia 1º
    const ant = await dashboard(c.d.cookie, '?periodo=mes_anterior')
    expect(ant.mrr.valor).toBe(100)
  })

  it('trimestre do calendário soma os três meses', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Trimestral')
    const t = periodoDoDashboard('trimestre', agora())
    const o1 = await nova(c.d.cookie, { titulo: 'T1', empresaId: e.id, valorMensal: 10, meses: 1 })
    const o2 = await nova(c.d.cookie, { titulo: 'T2', empresaId: e.id, valorMensal: 20, meses: 1 })
    await fecharEm(c, c.d.cookie, o1, 'conquistado', inicioDoDiaNoFuso(t.inicio))
    await fecharEm(
      c,
      c.d.cookie,
      o2,
      'conquistado',
      new Date(inicioDoDiaNoFuso(t.fimExclusivo).getTime() - 3_600_000),
    )
    const x = await dashboard(c.d.cookie, '?periodo=trimestre')
    expect(x.periodo).toMatchObject({ chave: 'trimestre', inicio: t.inicio, fim: t.fim })
    expect(x.mrr.valor).toBe(30)
  })

  it('principais motivos de perda: os 5 mais frequentes (perdidas e canceladas), com quantidade e valor', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Perdas')
    const meio = inicioDoDiaNoFuso(somarDias(periodoAtual().inicio, 2))
    const perder = async (
      titulo: string,
      motivoId: string,
      valor: number,
      status: 'perdido' | 'cancelado' = 'perdido',
    ) =>
      fecharEm(
        c,
        c.d.cookie,
        await nova(c.d.cookie, { titulo, empresaId: e.id, valorUnico: valor }),
        status,
        meio,
        motivoId,
      )
    const m1 = c.motivoDe('perdido', 0)
    const m2 = c.motivoDe('perdido', 1)
    await perder('a', m1, 100)
    await perder('b', m1, 200)
    await perder('c', m1, 300)
    await perder('d', m2, 1000)
    const x = await dashboard(c.d.cookie)
    expect(x.motivosDePerda).toHaveLength(2)
    expect(x.motivosDePerda[0]).toMatchObject({ id: m1, quantidade: 3, total: 600 })
    expect(x.motivosDePerda[1]).toMatchObject({ id: m2, quantidade: 1, total: 1000 })
    // fechadas fora do período não contam
    await perder('antiga', m2, 5000)
    const dentro = (await dashboard(c.d.cookie)).motivosDePerda.find((m) => m.id === m2)
    expect(dentro?.quantidade).toBe(2)
  })
})

describe('Dashboard: funil, carteira e sem contato', () => {
  it('o funil mostra só as ativas de hoje, por fase ativa; troca de funil; fase inativa some', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Funilaria')
    const o = await nova(c.d.cookie, { titulo: 'A', empresaId: e.id, valorUnico: 1000 })
    await nova(c.d.cookie, {
      titulo: 'B',
      empresaId: e.id,
      valorUnico: 500,
      valorMensal: 100,
      meses: 5,
    })
    await chamar('post', c.d.cookie, `${OPS}/${o.id}/mover`, { faseId: c.fase('Proposta') })
    const fechada = await nova(c.d.cookie, { titulo: 'Fechada', empresaId: e.id, valorUnico: 9000 })
    await chamar('post', c.d.cookie, `${OPS}/${fechada.id}/fechar`, {
      status: 'conquistado',
      empresaViraCliente: false,
    })
    const x = await dashboard(c.d.cookie)
    const por = (n: string) => x.funil.fases.find((f) => f.nome === n)
    expect(por('Qualificação')).toMatchObject({ quantidade: 1, total: 1000 })
    expect(por('Proposta')).toMatchObject({ quantidade: 1, total: 1000 })
    expect(por('Diagnóstico')).toMatchObject({ quantidade: 0, total: 0 })
    await chamar('patch', c.d.cookie, `/v1/configuracoes/funis/fases/${c.fase('Negociação')}`, {
      ativo: false,
    })
    expect((await dashboard(c.d.cookie)).funil.fases.map((f) => f.nome)).not.toContain('Negociação')
    const outro = (
      await chamar('post', c.d.cookie, '/v1/configuracoes/funis', {
        nome: 'Renovação',
        fases: [{ nome: 'Aviso' }],
      })
    ).body as Funil
    expect((await dashboard(c.d.cookie, `?funilId=${outro.id}`)).funil).toMatchObject({
      nome: 'Renovação',
    })
  })

  it('carteira por Status pela chave do sistema (renomear não muda), só as minhas; novas no período', async () => {
    const c = await cenario()
    await chamar('patch', c.d.cookie, `/v1/configuracoes/tags/${c.tag('cliente').id}`, {
      nome: 'Associado',
    })
    await empresa(c.ana.cookie, 'Lead da Ana')
    await empresa(c.ana.cookie, 'Cliente da Ana', { statusTagId: c.tag('cliente').id })
    await empresa(c.bia.cookie, 'Lead da Bia')
    const ana = await dashboard(c.ana.cookie)
    expect(ana.carteira.total).toBe(2)
    expect(ana.carteira.novas).toBe(2)
    const por = (chave: string) => ana.carteira.porStatus.find((s) => s.chaveSistema === chave)
    expect(por('lead')).toMatchObject({ quantidade: 1, nome: 'Lead' })
    expect(por('cliente')).toMatchObject({ quantidade: 1, nome: 'Associado' })
    // uma empresa cadastrada antes do período não é "nova"
    await sqlCru(
      c.d.tenantId,
      `UPDATE empresas SET criado_em = $1 WHERE razao_social = 'Lead da Ana'`,
      [inicioDoDiaNoFuso(somarDias(periodoAtual().inicio, -3)).toISOString()],
    )
    expect((await dashboard(c.ana.cookie)).carteira.novas).toBe(1)
    expect((await dashboard(c.bia.cookie)).carteira.total).toBe(1)
  })

  it('sem contato: só Cliente e Prospect (pela chave), inclui os nunca contatados, no prazo da empresa', async () => {
    const c = await cenario()
    const nunca = await empresa(c.ana.cookie, 'Cliente nunca contatado', {
      statusTagId: c.tag('cliente').id,
    })
    const velho = await empresa(c.ana.cookie, 'Prospect antigo', {
      statusTagId: c.tag('prospect').id,
    })
    const recente = await empresa(c.ana.cookie, 'Cliente recente', {
      statusTagId: c.tag('cliente').id,
    })
    await empresa(c.ana.cookie, 'Lead sem contato') // lead: fora
    await empresa(c.bia.cookie, 'Cliente da Bia', { statusTagId: c.tag('cliente').id }) // de outra carteira
    await sqlCru(
      c.d.tenantId,
      `UPDATE empresas SET ultimo_contato_em = now() - interval '90 days' WHERE id = $1`,
      [velho.id],
    )
    await sqlCru(
      c.d.tenantId,
      `UPDATE empresas SET ultimo_contato_em = now() - interval '10 days' WHERE id = $1`,
      [recente.id],
    )

    const x = await dashboard(c.ana.cookie)
    expect(x.semContato.dias).toBe(60)
    expect(x.semContato.total).toBe(2)
    // as nunca contatadas primeiro, depois a mais antiga
    expect(x.semContato.itens.map((i) => i.nome)).toEqual([
      'Cliente nunca contatado',
      'Prospect antigo',
    ])
    expect(x.semContato.itens[0]).toMatchObject({
      diasSemContato: null,
      status: { nome: 'Cliente' },
    })
    expect(x.semContato.itens[1]).toMatchObject({
      diasSemContato: 90,
      status: { nome: 'Prospect' },
    })

    // o prazo configurado na empresa vale
    await sqlCru(
      c.d.tenantId,
      `UPDATE tenant_configuracoes SET dias_sem_contato_alerta = 5 WHERE tenant_id = $1`,
      [c.d.tenantId],
    )
    const x2 = await dashboard(c.ana.cookie)
    expect(x2.semContato).toMatchObject({ dias: 5, total: 3 })
    void nunca
  })

  it('a lista traz no máximo 8, mas o total conta todas; o filtro "semContato" da lista de Empresas bate com o total', async () => {
    const c = await cenario()
    for (let i = 1; i <= 10; i += 1) {
      await empresa(c.ana.cookie, `Cliente ${String(i).padStart(2, '0')}`, {
        statusTagId: c.tag('cliente').id,
      })
    }
    const x = await dashboard(c.ana.cookie)
    expect(x.semContato.total).toBe(10)
    expect(x.semContato.itens).toHaveLength(8)
    const lista = (
      await chamar(
        'get',
        c.ana.cookie,
        `/v1/carteira/empresas?semContato=${x.semContato.dias}&vendedorId=${c.ana.membroId}`,
      )
    ).body as ListaDeEmpresas
    expect(lista.total).toBe(10)
    // lead só entra com "incluir leads"
    await empresa(c.ana.cookie, 'Um lead')
    const sem = (await chamar('get', c.ana.cookie, `/v1/carteira/empresas?semContato=60`))
      .body as ListaDeEmpresas
    expect(sem.total).toBe(10)
    const com = (
      await chamar('get', c.ana.cookie, `/v1/carteira/empresas?semContato=60&incluirLeads=true`)
    ).body as ListaDeEmpresas
    expect(com.total).toBe(11)
  })
})

describe('Dashboard: atividades (sem sobreposição, no fuso da empresa)', () => {
  it('hoje, atrasadas e próximos 7 dias: cada atividade em uma só janela; só as minhas', async () => {
    const c = await cenario()
    const e = await empresa(c.ana.cookie, 'Loja da Ana')
    const diaInteiro = (titulo: string, dia: string, cookie = c.ana.cookie) =>
      chamar('post', cookie, '/v1/carteira/atividades', {
        tipoAtividadeId: c.tipo('visita'),
        titulo,
        empresaId: e.id,
        situacao: 'pendente',
        diaInteiro: true,
        dataInicio: inicioDoDiaNoFuso(dia).toISOString(),
      })
    expect((await diaInteiro('hoje', hoje())).status).toBe(201)
    expect((await diaInteiro('ontem', somarDias(hoje(), -1))).status).toBe(201)
    expect((await diaInteiro('amanhã', somarDias(hoje(), 1))).status).toBe(201)
    expect((await diaInteiro('em 7 dias', somarDias(hoje(), 7))).status).toBe(201)
    expect((await diaInteiro('em 8 dias', somarDias(hoje(), 8))).status).toBe(201)
    // atrasada por hora (30 minutos atrás)
    expect(
      (
        await chamar('post', c.ana.cookie, '/v1/carteira/atividades', {
          tipoAtividadeId: c.tipo('ligacao'),
          titulo: 'há 30 min',
          empresaId: e.id,
          situacao: 'pendente',
          dataInicio: new Date(Date.now() - 30 * 60_000).toISOString(),
        })
      ).status,
    ).toBe(201)
    // de outra pessoa (o gestor/admin registra para a Bia): não entra no dashboard da Ana
    await chamar('post', c.d.cookie, '/v1/carteira/atividades', {
      tipoAtividadeId: c.tipo('visita'),
      titulo: 'da Bia',
      empresaId: e.id,
      situacao: 'pendente',
      diaInteiro: true,
      responsavelId: c.bia.membroId,
      dataInicio: inicioDoDiaNoFuso(hoje()).toISOString(),
    })

    const x = await dashboard(c.ana.cookie)
    expect(x.atividades).toEqual({ hoje: 1, atrasadas: 2, proximos7: 2 })
    // a lista das mesmas janelas traz as mesmas atividades (a conclusão rápida usa)
    const lista = async (aba: string) =>
      (await chamar('get', c.ana.cookie, `/v1/carteira/atividades?aba=${aba}&minhas=true`))
        .body as ListaDeAtividades
    expect((await lista('hoje')).itens.map((a) => a.titulo)).toEqual(['hoje'])
    expect((await lista('atrasadas')).itens.map((a) => a.titulo).sort()).toEqual([
      'há 30 min',
      'ontem',
    ])
    expect((await lista('proximos7')).itens.map((a) => a.titulo)).toEqual(['amanhã', 'em 7 dias'])
    expect((await lista('hoje')).contagens).toMatchObject({ hoje: 1, atrasadas: 2, proximos7: 2 })
  })
})

describe('Lista de oportunidades: filtros que o Dashboard usa nos cliques', () => {
  it('por motivo, por "perdas" (perdidas e canceladas) e por período de fechamento', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Cliques')
    const p = periodoAtual()
    const dentro = inicioDoDiaNoFuso(somarDias(p.inicio, 2))
    const fora = inicioDoDiaNoFuso(somarDias(p.inicio, -10))
    const m1 = c.motivoDe('perdido', 0)
    const m2 = c.motivoDe('perdido', 1)
    const a = await nova(c.d.cookie, { titulo: 'Perdida m1', empresaId: e.id })
    const b = await nova(c.d.cookie, { titulo: 'Cancelada m1', empresaId: e.id })
    const d2 = await nova(c.d.cookie, { titulo: 'Perdida m2', empresaId: e.id })
    const velha = await nova(c.d.cookie, { titulo: 'Perdida antiga', empresaId: e.id })
    const ganha = await nova(c.d.cookie, { titulo: 'Ganha', empresaId: e.id })
    await fecharEm(c, c.d.cookie, a, 'perdido', dentro, m1)
    await fecharEm(c, c.d.cookie, b, 'cancelado', dentro, c.motivoDe('cancelado'))
    await fecharEm(c, c.d.cookie, d2, 'perdido', dentro, m2)
    await fecharEm(c, c.d.cookie, velha, 'perdido', fora, m1)
    await fecharEm(c, c.d.cookie, ganha, 'conquistado', dentro)
    const lista = async (q: string) => {
      const r = await chamar('get', c.d.cookie, `${OPS}?${q}`)
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      return (r.body as ListaDeOportunidades).itens.map((o) => o.titulo).sort()
    }
    const periodo = `fechadaDe=${p.inicio}&fechadaAte=${p.fim}`
    expect(await lista(`motivoId=${m1}&${periodo}`)).toEqual(['Perdida m1'])
    expect(await lista(`grupo=perdas&${periodo}`)).toEqual([
      'Cancelada m1',
      'Perdida m1',
      'Perdida m2',
    ])
    expect(await lista(`status=conquistado&${periodo}`)).toEqual(['Ganha'])
    // o fim vale o dia todo: fechada às 23h do último dia ainda entra
    await sqlCru(c.d.tenantId, `UPDATE oportunidades SET data_fechamento = $1 WHERE id = $2`, [
      new Date(inicioDoDiaNoFuso(p.fimExclusivo).getTime() - 3_600_000).toISOString(),
      ganha.id,
    ])
    expect(await lista(`status=conquistado&${periodo}`)).toEqual(['Ganha'])
    expect(
      await lista(`status=conquistado&fechadaAte=${somarDias(p.fim, -1)}&fechadaDe=${p.inicio}`),
    ).toEqual([])
  })
})

describe('Dashboard: isolamento entre empresas', () => {
  it('cada empresa vê só os próprios números', async () => {
    const a = await cenario()
    const b = await cenario()
    const e = await empresa(a.d.cookie, 'Empresa do A')
    const o = await nova(a.d.cookie, {
      titulo: 'Grande',
      empresaId: e.id,
      valorMensal: 1000,
      meses: 12,
    })
    await fecharEm(a, a.d.cookie, o, 'conquistado', new Date())
    expect((await dashboard(a.d.cookie)).mrr.valor).toBe(1000)
    const doB = await dashboard(b.d.cookie)
    expect(doB.mrr.valor).toBe(0)
    expect(doB.carteira.total).toBe(0)
  })
})
