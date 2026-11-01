import type { Server } from 'node:http'

import {
  type AssociadosDoDashboard,
  type ContornosDaUf,
  diaNoFuso,
  type EmpresaCarteira,
  type Funil,
  instantesDoIntervalo,
  type MapaDoDashboard,
  type Oportunidade,
  periodoDoDashboard,
  type ResultadosDoDashboard,
  type TagGrupo,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { configuracaoDaTeste } from '../testes/dashboard.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste'),
    ('SP', 'São Paulo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'Vitória', 'ES'),
    (3201308, 'Cariacica', 'ES'), (3550308, 'São Paulo', 'SP') ON CONFLICT DO NOTHING`
  // Dois quadrados de teste (a malha real vem do seed, que estes testes não carregam)
  await dono`INSERT INTO municipio_contornos (municipio_codigo, uf, contorno, fonte) VALUES
    (3205309, 'ES', ST_Multi(ST_GeomFromText('POLYGON((-40.35 -20.33, -40.28 -20.33, -40.28 -20.25, -40.35 -20.25, -40.35 -20.33))', 4326)), 'teste'),
    (3201308, 'ES', ST_Multi(ST_GeomFromText('POLYGON((-40.45 -20.33, -40.35 -20.33, -40.35 -20.25, -40.45 -20.25, -40.45 -20.33))', 4326)), 'teste')
    ON CONFLICT DO NOTHING`
})
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

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.8.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const RES = '/v1/carteira/dashboard/resultados'
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
  const [eu] = await noTenant(
    d.tenantId,
    (tx) => tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`,
  )
  return {
    d,
    euId: (eu as { id: string }).id,
    ana: await pessoa('vendedor', 'Ana'),
    bia: await pessoa('vendedor', 'Bia'),
    funil,
    fase: (nome: string) => funil.fases.find((f) => f.nome === nome)?.id as string,
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
const resultados = async (cookie: string, q = '') => {
  const r = await chamar('get', cookie, `${RES}${q}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as ResultadosDoDashboard
}
async function conquistarEm(c: Cenario, cookie: string, o: Oportunidade, quando: Date) {
  const r = await chamar('post', cookie, `${OPS}/${o.id}/fechar`, {
    status: 'conquistado',
    empresaViraCliente: false,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  await sqlCru(c.d.tenantId, `UPDATE oportunidades SET data_fechamento = $1 WHERE id = $2`, [
    quando.toISOString(),
    o.id,
  ])
}

const agora = () => new Date()
const mes = () => periodoDoDashboard('mes', agora())
const instantes = () => instantesDoIntervalo(mes())
/** Um instante `horas` depois do início do mês atual (no fuso de São Paulo) */
const noMes = (horas = 12) => new Date(instantes().de.getTime() + horas * 3_600_000)
/** Um instante antes do início do mês atual */
const antesDoMes = (dias = 3) => new Date(instantes().de.getTime() - dias * 86_400_000)

describe('Dashboard Resultados: estrutura e validação', () => {
  it('empresa nova: tudo zerado, as três visões do admin e a fase final do funil padrão', async () => {
    const c = await cenario()
    const x = await resultados(c.d.cookie)
    expect(x.periodo).toMatchObject({ chave: 'mes', inicio: mes().inicio, fim: mes().fim })
    expect(x.visao).toBe('minha')
    expect(x.visoes).toEqual(['minha', 'equipe', 'empresa'])
    expect(x.previsao).toMatchObject({ valor: 0, ponderado: 0, quantidade: 0, semPrevisao: 0 })
    expect(x.previsao.porFunil).toEqual([
      expect.objectContaining({ funilId: c.funil.id, fase: 'Negociação', valor: 0 }),
    ])
    expect(x.vendas).toEqual({ total: 0, quantidade: 0, anterior: 0, variacao: null })
    expect(x.mrr.serie).toHaveLength(6)
    expect(x.associados).toMatchObject({ atual: 0, inicio: 0, churn: null })
    expect(x.associados.tag?.id).toBe(c.tag('cliente').id)
    expect(x.visitas).toEqual({ realizadas: 0, anterior: 0, variacao: null })
    expect(x.atividadesRealizadas).toEqual({ realizadas: 0, anterior: 0, variacao: null })
    expect(x.funil.fases).toHaveLength(4)
  })

  it('períodos novos e os recusados', async () => {
    const c = await cenario()
    const ano = Number(diaNoFuso(agora()).slice(0, 4))
    expect((await resultados(c.d.cookie, '?periodo=ano')).periodo.rotulo).toBe(String(ano))
    expect((await resultados(c.d.cookie, '?periodo=semestre')).mrr.serie).toHaveLength(6)
    expect((await resultados(c.d.cookie, '?periodo=ano')).mrr.serie).toHaveLength(12)
    expect(
      (await resultados(c.d.cookie, `?periodo=ano_anterior&ano=${ano - 2}`)).periodo,
    ).toMatchObject({ inicio: `${ano - 2}-01-01`, fim: `${ano - 2}-12-31` })
    expect(
      (await resultados(c.d.cookie, '?periodo=personalizado&de=2026-01-05&ate=2026-01-10')).periodo,
    ).toMatchObject({ inicio: '2026-01-05', anterior: { inicio: '2025-12-30', fim: '2026-01-04' } })
    const recusa = async (q: string) => {
      const r = await chamar('get', c.d.cookie, `${RES}${q}`)
      return { status: r.status, erro: erroDe(r) }
    }
    expect(await recusa(`?periodo=ano_anterior&ano=${ano}`)).toEqual({
      status: 400,
      erro: 'periodo_invalido',
    })
    expect((await recusa('?periodo=personalizado')).status).toBe(400)
    expect((await recusa('?periodo=personalizado&de=2026-02-01&ate=2026-01-01')).status).toBe(400)
    expect((await recusa('?visao=todas')).status).toBe(400)
    expect((await chamar('get', undefined, RES)).status).toBe(401)
  })

  it('a visão é limitada pelo alcance: o vendedor só tem "minha" (403 acima)', async () => {
    const c = await cenario()
    expect((await resultados(c.ana.cookie)).visoes).toEqual(['minha'])
    for (const visao of ['equipe', 'empresa']) {
      const r = await chamar('get', c.ana.cookie, `${RES}?visao=${visao}`)
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('acesso_negado')
    }
  })
})

describe('Dashboard Resultados: previsão, vendas e visão', () => {
  it('previsão: a fase final de cada funil ativo, com data no período, pelo valor total', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Mercado')
    const dentro = mes().inicio
    // funil padrão: 1.000 na Negociação (fase final) entra; 5.000 na Proposta não; uma sem data
    await nova(c.d.cookie, {
      titulo: 'final',
      empresaId: e.id,
      faseId: c.fase('Negociação'),
      valorUnico: 1000,
      dataPrevistaFechamento: dentro,
    })
    await nova(c.d.cookie, {
      titulo: 'proposta',
      empresaId: e.id,
      faseId: c.fase('Proposta'),
      valorUnico: 5000,
      dataPrevistaFechamento: dentro,
    })
    await nova(c.d.cookie, {
      titulo: 'sem data',
      empresaId: e.id,
      faseId: c.fase('Negociação'),
      valorUnico: 700,
    })
    // fora do período
    await nova(c.d.cookie, {
      titulo: 'longe',
      empresaId: e.id,
      faseId: c.fase('Negociação'),
      valorUnico: 900,
      dataPrevistaFechamento: '2099-01-10',
    })
    // segundo funil, com a última fase "Assinatura": 2.000 entram
    const r = await chamar('post', c.d.cookie, '/v1/configuracoes/funis', {
      nome: 'Renovação',
      fases: [
        { nome: 'Contato', probabilidadePadrao: 20 },
        { nome: 'Assinatura', probabilidadePadrao: 90 },
      ],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const renovacao = r.body as Funil
    await nova(c.d.cookie, {
      titulo: 'renova',
      empresaId: e.id,
      funilId: renovacao.id,
      faseId: renovacao.fases.find((f) => f.nome === 'Assinatura')?.id,
      valorUnico: 2000,
      dataPrevistaFechamento: dentro,
    })
    // de outra pessoa: só na visão Empresa
    await nova(c.d.cookie, {
      titulo: 'da Ana',
      empresaId: e.id,
      responsavelId: c.ana.membroId,
      faseId: c.fase('Negociação'),
      valorUnico: 400,
      dataPrevistaFechamento: dentro,
    })

    const x = await resultados(c.d.cookie)
    expect(x.previsao).toMatchObject({ valor: 3000, quantidade: 2, semPrevisao: 1 })
    const prob = c.funil.fases.find((f) => f.nome === 'Negociação')?.probabilidadePadrao ?? 0
    expect(x.previsao.ponderado).toBe((1000 * prob) / 100 + 2000 * 0.9)
    expect(x.previsao.porFunil.map((f) => [f.fase, f.valor])).toEqual([
      ['Negociação', 1000],
      ['Assinatura', 2000],
    ])
    expect((await resultados(c.d.cookie, '?visao=empresa')).previsao.valor).toBe(3400)
    // funil inativo sai da soma (a API não inativa funil com ativas; o banco é a defesa)
    await sqlCru(c.d.tenantId, `UPDATE funis SET ativo = false WHERE id = $1`, [renovacao.id])
    expect((await resultados(c.d.cookie)).previsao.valor).toBe(1000)
  })

  it('vendas: valor total das conquistadas no período, com a variação sobre o anterior; visão Equipe', async () => {
    const c = await cenario()
    // a Ana é da equipe do admin (gestor_id); a Bia não
    await sqlCru(c.d.tenantId, `UPDATE membros SET gestor_id = $1 WHERE id = $2`, [
      c.euId,
      c.ana.membroId,
    ])
    const e = await empresa(c.d.cookie, 'Loja')
    const venda = async (valor: number, quando: Date, responsavelId?: string) => {
      const o = await nova(c.d.cookie, {
        titulo: `v ${valor}`,
        empresaId: e.id,
        valorUnico: valor,
        valorMensal: 100,
        meses: 12,
        ...(responsavelId ? { responsavelId } : {}),
      })
      await conquistarEm(c, c.d.cookie, o, quando)
    }
    await venda(1000, noMes())
    await venda(500, antesDoMes(20))
    await venda(300, noMes(), c.ana.membroId)
    await venda(200, noMes(), c.bia.membroId)

    const minha = await resultados(c.d.cookie)
    // valor total = único + mensal × meses
    expect(minha.vendas).toEqual({ total: 2200, quantidade: 1, anterior: 1700, variacao: 29.4 })
    expect(minha.mrr.valor).toBe(100)
    expect((await resultados(c.d.cookie, '?visao=equipe')).vendas.total).toBe(2200 + 1500)
    expect((await resultados(c.d.cookie, '?visao=empresa')).vendas.total).toBe(2200 + 1500 + 1400)
  })
})

describe('Dashboard Resultados: visitas e atividades realizadas', () => {
  it('visitas (tipo de sistema, inclusive a não localizada) × as outras realizadas (com as Tarefas)', async () => {
    const c = await cenario()
    const e = await empresa(c.d.cookie, 'Padaria')
    const realizada = async (chave: string, quando: Date, titulo = chave) => {
      const r = await chamar('post', c.d.cookie, '/v1/carteira/atividades', {
        tipoAtividadeId: c.tipo(chave),
        titulo,
        empresaId: e.id,
        situacao: 'realizada',
        resultado: 'feito',
        dataInicio: new Date(Date.now() - 3_600_000).toISOString(),
      })
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      const id = (r.body as { id: string }).id
      await sqlCru(c.d.tenantId, `UPDATE atividades SET realizada_em = $1 WHERE id = $2`, [
        quando.toISOString(),
        id,
      ])
      return id
    }
    await realizada('visita', noMes())
    const naoLocalizada = await realizada('visita', noMes(2), 'não localizada')
    await sqlCru(c.d.tenantId, `UPDATE atividades SET conta_visita = false WHERE id = $1`, [
      naoLocalizada,
    ])
    await realizada('visita', antesDoMes())
    await realizada('ligacao', noMes())
    await realizada('tarefa', noMes())
    await realizada('ligacao', antesDoMes())
    // pendente e cancelada não contam
    await chamar('post', c.d.cookie, '/v1/carteira/atividades', {
      tipoAtividadeId: c.tipo('visita'),
      titulo: 'agendada',
      empresaId: e.id,
      situacao: 'pendente',
      dataInicio: new Date(Date.now() + 86_400_000).toISOString(),
    })
    // renomear o tipo Visita não muda nada (pela chave)
    await chamar('patch', c.d.cookie, `/v1/configuracoes/tipos-atividade/${c.tipo('visita')}`, {
      nome: 'Visita técnica',
    })

    const x = await resultados(c.d.cookie)
    expect(x.visitas).toEqual({ realizadas: 2, anterior: 1, variacao: 100 })
    expect(x.atividadesRealizadas).toEqual({ realizadas: 2, anterior: 1, variacao: 100 })
  })
})

describe('Dashboard Resultados: associados, churn e listas', () => {
  /** Aplica e tira a tag Cliente pela API e põe as datas do histórico onde o teste quer. */
  async function montar(c: Cenario) {
    // renomeada: achada pela chave do sistema
    await chamar('patch', c.d.cookie, `/v1/configuracoes/tags/${c.tag('cliente').id}`, {
      nome: 'Associado',
    })
    const tags = async (e: EmpresaCarteira, chave: string) => {
      const r = await chamar('put', c.d.cookie, `/v1/carteira/empresas/${e.id}/tags`, {
        tagIds: [c.tag(chave).id],
      })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }
    const datar = (e: EmpresaCarteira, acao: 'adicionada' | 'removida', quando: Date) =>
      sqlCru(
        c.d.tenantId,
        `UPDATE empresa_tags_historico SET em = $1 WHERE empresa_id = $2 AND tag_id = $3 AND acao = $4`,
        [quando.toISOString(), e.id, c.tag('cliente').id, acao],
      )
    const antiga = await empresa(c.d.cookie, 'Antiga')
    await tags(antiga, 'cliente')
    await datar(antiga, 'adicionada', antesDoMes(40))

    const nova_ = await empresa(c.d.cookie, 'Nova', {
      endereco: { municipioCodigo: 3205309 },
    })
    await tags(nova_, 'cliente')
    await datar(nova_, 'adicionada', noMes(5))
    const o = await nova(c.d.cookie, {
      titulo: 'contrato',
      empresaId: nova_.id,
      valorMensal: 350,
      meses: 12,
    })
    await conquistarEm(c, c.d.cookie, o, noMes(5))

    const saiu = await empresa(c.d.cookie, 'Saiu')
    await tags(saiu, 'cliente')
    await tags(saiu, 'inativo')
    await datar(saiu, 'adicionada', antesDoMes(60))
    await datar(saiu, 'removida', noMes(10))

    const passou = await empresa(c.d.cookie, 'Passou')
    await tags(passou, 'cliente')
    await tags(passou, 'prospect')
    await datar(passou, 'adicionada', noMes(1))
    await datar(passou, 'removida', noMes(2))

    const excluida = await empresa(c.d.cookie, 'Excluída')
    await tags(excluida, 'cliente')
    await datar(excluida, 'adicionada', antesDoMes(30))
    expect(
      (await chamar('delete', c.d.cookie, `/v1/carteira/empresas/${excluida.id}`)).status,
    ).toBe(204)
    return { antiga, nova: nova_, saiu, passou }
  }

  it('associados no início e no fim, novos, desassociados e churn; a excluída não conta', async () => {
    const c = await cenario()
    await montar(c)
    const x = await resultados(c.d.cookie)
    expect(x.associados.tag?.nome).toBe('Associado')
    expect(x.associados).toMatchObject({
      inicio: 2,
      atual: 2,
      novos: 1,
      desassociados: 1,
      churn: 50,
    })
    expect(x.associados.historicoDesde).not.toBeNull()
    // no mês anterior, a "Saiu" e a "Antiga" já eram; ninguém entrou nem saiu
    expect((await resultados(c.d.cookie, '?periodo=mes_anterior')).associados).toMatchObject({
      atual: 2,
      novos: 0,
      desassociados: 0,
      churn: 0,
    })
  })

  it('listas: novos (com o MRR conquistado no período) e desassociados (com o Status de agora)', async () => {
    const c = await cenario()
    const m = await montar(c)
    const lista = async (q: string) => {
      const r = await chamar('get', c.d.cookie, `/v1/carteira/dashboard/associados${q}`)
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      return r.body as AssociadosDoDashboard
    }
    const novos = await lista('?tipo=novos')
    expect(novos.total).toBe(1)
    expect(novos.itens[0]).toMatchObject({
      id: m.nova.id,
      nome: 'Nova',
      cidade: { nome: 'Vitória', uf: 'ES' },
      mrr: 350,
      statusAtual: null,
    })
    expect(novos.itens[0]?.vendedor?.id).toBe(c.euId)
    expect(new Date(novos.itens[0]?.em ?? '').getTime()).toBe(noMes(5).getTime())
    const fora = await lista('?tipo=desassociados')
    expect(fora.itens.map((i) => [i.nome, i.statusAtual?.id, i.mrr])).toEqual([
      ['Saiu', c.tag('inativo').id, null],
    ])
    expect((await lista('?tipo=novos&pagina=2&porPagina=1')).itens).toEqual([])
    expect((await chamar('get', c.d.cookie, '/v1/carteira/dashboard/associados')).status).toBe(400)
  })
})

describe('Dashboard Resultados: mapa e contornos', () => {
  it('por município da UF da empresa; as de outra UF e as sem cidade à parte', async () => {
    const c = await cenario()
    const mapa = async (cookie = c.d.cookie) => {
      const r = await chamar('get', cookie, '/v1/carteira/dashboard/mapa?visao=empresa')
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      return r.body as MapaDoDashboard
    }
    // sem endereço da empresa que usa o CRM: sem UF (tudo "fora")
    expect((await mapa()).uf).toBeNull()
    await sqlCru(c.d.tenantId, `UPDATE tenants SET municipio_codigo = 3201308 WHERE id = $1`, [
      c.d.tenantId,
    ])
    const vitoria = { endereco: { municipioCodigo: 3205309 } }
    const a = await empresa(c.d.cookie, 'Empresa A', vitoria)
    await empresa(c.d.cookie, 'Empresa B', vitoria)
    await empresa(c.d.cookie, 'Empresa C', { endereco: { municipioCodigo: 3201308 } })
    await empresa(c.d.cookie, 'Empresa D', { endereco: { municipioCodigo: 3550308 } })
    await empresa(c.d.cookie, 'Empresa E')
    await chamar('put', c.d.cookie, `/v1/carteira/empresas/${a.id}/tags`, {
      tagIds: [c.tag('cliente').id],
    })
    const x = await mapa()
    expect(x.uf).toBe('ES')
    expect(x.municipios).toEqual([
      { codigo: 3205309, nome: 'Vitória', associados: 1, empresas: 2 },
      { codigo: 3201308, nome: 'Cariacica', associados: 0, empresas: 1 },
    ])
    expect(x.foraDaUf).toEqual({ associados: 0, empresas: 1 })
    expect(x.semCidade).toEqual({ associados: 0, empresas: 1 })
    expect(x.total).toEqual({ associados: 1, empresas: 5 })
    // a vendedora vê só a carteira dela
    expect((await chamar('get', c.ana.cookie, '/v1/carteira/dashboard/mapa')).body).toMatchObject({
      total: { associados: 0, empresas: 0 },
    })
  })

  it('contornos da UF, em cache, para todo membro', async () => {
    const c = await cenario()
    const r = await chamar('get', c.ana.cookie, '/v1/carteira/dashboard/contornos?uf=es')
    expect(r.status).toBe(200)
    expect(r.headers['cache-control']).toContain('max-age=86400')
    const x = r.body as ContornosDaUf
    expect(x.uf).toBe('ES')
    expect(x.municipios.map((m) => m.nome)).toEqual(['Cariacica', 'Vitória'])
    expect(x.municipios[1]?.poligonos[0]?.[0]?.[0]).toEqual([-40.35, -20.33])
    expect(
      (
        (await chamar('get', c.ana.cookie, '/v1/carteira/dashboard/contornos?uf=SP'))
          .body as ContornosDaUf
      ).municipios,
    ).toEqual([])
    expect((await chamar('get', c.ana.cookie, '/v1/carteira/dashboard/contornos')).status).toBe(400)
  })
})

describe('Dashboard Resultados: isolamento entre empresas', () => {
  it('cada empresa vê só os próprios números, mesmo na visão Empresa', async () => {
    const a = await cenario()
    const b = await cenario()
    const e = await empresa(a.d.cookie, 'Só da A', { endereco: { municipioCodigo: 3205309 } })
    const o = await nova(a.d.cookie, { titulo: 'x', empresaId: e.id, valorUnico: 999 })
    await conquistarEm(a, a.d.cookie, o, noMes())
    await chamar('put', a.d.cookie, `/v1/carteira/empresas/${e.id}/tags`, {
      tagIds: [a.tag('cliente').id],
    })
    expect((await resultados(a.d.cookie, '?visao=empresa')).vendas.total).toBe(999)
    const deB = await resultados(b.d.cookie, '?visao=empresa')
    expect(deB.vendas.total).toBe(0)
    expect(deB.associados.atual).toBe(0)
    const mapaB = (await chamar('get', b.d.cookie, '/v1/carteira/dashboard/mapa?visao=empresa'))
      .body as MapaDoDashboard
    expect(mapaB.total).toEqual({ associados: 0, empresas: 0 })
    const listaB = (
      await chamar('get', b.d.cookie, '/v1/carteira/dashboard/associados?tipo=novos&visao=empresa')
    ).body as AssociadosDoDashboard
    expect(listaB.total).toBe(0)
  })
})
