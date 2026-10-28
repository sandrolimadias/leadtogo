import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import {
  completarCnpj,
  type ListaDeLinhas,
  type LoteDeImportacao,
  type Oportunidade,
  type OportunidadeDetalhada,
  type PreviaDaImportacao,
  type ValoresDoTipo,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import {
  ativar,
  dono,
  membroComEmail,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'
import { ExecutorDaImportacao } from './executor.js'

// Importação de OPORTUNIDADES (docs/plano_importacao_oportunidades.md): planilhas e pessoas inventadas
// aqui; nenhum dado real.

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
const log = pino({ level: 'silent' })
afterAll(async () => {
  await banco.cliente.end({ timeout: 5 })
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

let seq = 0
const cnpjNovo = () =>
  completarCnpj(`7${String(Date.now() % 1_000_000).padStart(6, '0')}${++seq % 10}0001`.slice(0, 12))

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

const descartarEventos = (tenantId: string) =>
  noTenant(
    tenantId,
    (tx) =>
      tx`UPDATE eventos_outbox SET processado_em = now()
         WHERE tipo = 'importacao.executar' AND processado_em IS NULL`,
  )

type Metodo = 'get' | 'post' | 'patch'
let ip = 0
const chamar = (metodo: Metodo, cookie: string, url: string, corpo?: unknown) => {
  ip += 1
  const r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.9.${Math.floor(ip / 250)}.${ip % 250}`)
    .set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const LOTES = '/v1/importacao/lotes'
const OPS = '/v1/carteira/oportunidades'

const CABECALHO = [
  'CNPJ',
  'Título',
  'Fase',
  'Status',
  'Motivo',
  'Detalhe',
  'Retomar em',
  'Fechamento',
  'Único',
  'Mensal',
  'Meses',
  'Probabilidade',
  'Previsão',
  'Origem',
  'Solução',
  'Contato',
  'Responsável',
  'Obs',
]
const CAMPOS = {
  documento: 'CNPJ',
  titulo: 'Título',
  fase: 'Fase',
  status: 'Status',
  motivo: 'Motivo',
  motivoDetalhe: 'Detalhe',
  retomarEm: 'Retomar em',
  dataFechamento: 'Fechamento',
  valorUnico: 'Único',
  valorMensal: 'Mensal',
  meses: 'Meses',
  probabilidade: 'Probabilidade',
  dataPrevista: 'Previsão',
  origem: 'Origem',
  solucao: 'Solução',
  emailContato: 'Contato',
  emailResponsavel: 'Responsável',
  observacoes: 'Obs',
}
const linha = (cnpj: string, extra: Record<string, string> = {}) =>
  CABECALHO.map((c) => (c === 'CNPJ' ? cnpj : (extra[c] ?? ''))).join(';')

/** Hoje e amanhã em São Paulo, como a planilha escreve (dd/mm/aaaa). */
const diaBr = (deslocamento: number) => {
  const d = new Date(Date.now() - 3 * 3_600_000 + deslocamento * 86_400_000)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

async function criarEmpresa(tenantId: string, membroId: string, nome: string) {
  const cnpj = cnpjNovo()
  const id = await noTenant(tenantId, async (tx) => {
    const [e] = await tx<{ id: string }[]>`
      INSERT INTO empresas (id, tenant_id, tipo_documento, documento, razao_social, vendedor_id)
      VALUES (gen_random_uuid(), ${tenantId}, 'cnpj', ${cnpj}, ${nome}, ${membroId}) RETURNING id`
    return (e as { id: string }).id
  })
  return { id, cnpj }
}

const membroDe = (tenantId: string, usuarioId: string) =>
  noTenant(tenantId, async (tx) => {
    const [m] = await tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${usuarioId}`
    return (m as { id: string }).id
  })

type Empresa = { id: string; cnpj: string }
async function cenario(corpo: (a: { a: Empresa; b: Empresa }) => string[], mapear = true) {
  const d = await novoDono(app)
  const membroId = await membroDe(d.tenantId, d.usuarioId)
  const a = await criarEmpresa(d.tenantId, membroId, 'Empresa A')
  const b = await criarEmpresa(d.tenantId, membroId, 'Empresa B')
  const csv = [CABECALHO.join(';'), ...corpo({ a, b })].join('\n')
  const criado = await request(app.getHttpServer())
    .post(`${LOTES}?arquivo=oportunidades.csv&tipo=oportunidades`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', d.cookie)
    .set('Content-Type', 'application/octet-stream')
    .send(csv)
  expect(criado.status, JSON.stringify(criado.body)).toBe(201)
  const lote = criado.body as LoteDeImportacao
  if (mapear) {
    const r = await chamar('patch', d.cookie, `${LOTES}/${lote.id}`, { campos: CAMPOS })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((r.body as LoteDeImportacao).situacao).toBe('pronta')
  }
  const funis = (await chamar('get', d.cookie, '/v1/configuracoes/funis')).body as {
    id: string
    padrao: boolean
    fases: { id: string; nome: string }[]
  }[]
  const funil = funis.find((f) => f.padrao) as (typeof funis)[number]
  const fase = (nome: string) => funil.fases.find((f) => f.nome === nome)?.id as string
  const motivos = (await chamar('get', d.cookie, '/v1/configuracoes/motivos')).body as {
    id: string
    nome: string
  }[]
  const motivo = (nome: string) => motivos.find((m) => m.nome === nome)?.id as string
  return { d, membroId, lote, a, b, funil, fase, motivo }
}

const executar = async (d: { cookie: string; tenantId: string }, id: string) => {
  const r = await chamar('post', d.cookie, `${LOTES}/${id}/iniciar`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  await descartarEventos(d.tenantId)
  return new ExecutorDaImportacao({
    banco,
    receita: {
      consultar: () => Promise.reject(new Error('oportunidades não consultam a Receita')),
    },
    log,
    esperar: () => Promise.resolve(),
  }).executar(d.tenantId, id)
}

const linhasDe = (tenantId: string, loteId: string) =>
  noTenant(
    tenantId,
    (tx) =>
      tx<
        {
          numero: number
          resultado: string
          motivo: string | null
          avisos: string[]
          oportunidade_id: string | null
        }[]
      >`
        SELECT numero, resultado::text AS resultado, motivo, avisos, oportunidade_id
        FROM importacao_linhas WHERE importacao_id = ${loteId} ORDER BY numero`,
  )
const resultados = async (t: string, l: string) => (await linhasDe(t, l)).map((x) => x.resultado)
const oportunidadeDaLinha = async (cookie: string, t: string, l: string, numero: number) => {
  const id = (await linhasDe(t, l)).find((x) => x.numero === numero)?.oportunidade_id
  const r = await chamar('get', cookie, `${OPS}/${id}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as OportunidadeDetalhada
}
const statusDaEmpresa = (tenantId: string, empresaId: string) =>
  noTenant(tenantId, async (tx) => {
    const rs = await tx<{ chave: string | null }[]>`
      SELECT t.chave_sistema AS chave FROM empresa_tags et
      JOIN tags t ON t.id = et.tag_id JOIN tag_grupos g ON g.id = t.tag_grupo_id
      WHERE et.empresa_id = ${empresaId} AND g.chave_sistema = 'status'`
    return rs.map((r) => r.chave)
  })

describe('importação de oportunidades: o caminho completo', () => {
  it('importa ativas e fechadas, pula e avisa como combinado', async () => {
    const amanha = diaBr(1)
    const c = await cenario(({ a, b }) => [
      // 1 ativa na fase Proposta, com valores no formato brasileiro e probabilidade da fase
      linha(a.cnpj, {
        Título: 'Contrato anual',
        Fase: 'Proposta',
        Único: 'R$ 2.000,00',
        Mensal: '500',
        Previsão: '15/12/2030',
        Origem: 'Indicação',
        Obs: 'veio do CRM antigo',
      }),
      // 2 sem fase: a primeira; probabilidade editada; meses explícitos
      linha(a.cnpj, { Título: 'Implantação', Mensal: '1.000', Meses: '6', Probabilidade: '40%' }),
      // 3 perdida, com motivo e data de fechamento
      linha(a.cnpj, {
        Título: 'Renovação 2025',
        Fase: 'Negociação',
        Status: 'Perdida',
        Motivo: 'preço',
        Detalhe: 'Fechou com o concorrente',
        Fechamento: '10/03/2026',
      }),
      // 4 perdida sem motivo: pula
      linha(a.cnpj, { Título: 'Sem motivo', Status: 'Perdido' }),
      // 5 motivo de outro status: pula
      linha(a.cnpj, { Título: 'Motivo errado', Status: 'Cancelado', Motivo: 'Preço' }),
      // 6 suspensa: cria a retomada
      linha(b.cnpj, {
        Título: 'Projeto 2027',
        Status: 'Suspensa',
        Motivo: 'Mudança de prioridade',
        'Retomar em': amanha,
      }),
      // 7 fase que não existe no funil: pula
      linha(b.cnpj, { Título: 'Fase errada', Fase: 'Prospecção' }),
      // 8 conquistada sem data de fechamento: entra com a data de hoje e aviso; origem inexistente: aviso
      linha(b.cnpj, { Título: 'Ganha', Status: 'Ganho', Único: '3000', Origem: 'Feira' }),
      // 9 igual à linha 1 (mesma empresa, funil e título, sem diferença de acento e caixa)
      linha(a.cnpj, { Título: 'CONTRATO ANUAL' }),
      // 10 CNPJ fora da carteira
      linha(cnpjNovo(), { Título: 'Fora' }),
      // 11 valor inválido: pula
      linha(b.cnpj, { Título: 'Valor ruim', Único: 'mil reais' }),
      // 12 sem título: "Empresa – Solução" (sem solução, só a empresa)
      linha(b.cnpj, { Fase: 'Diagnóstico' }),
      // 13 data de fechamento no futuro: pula
      linha(b.cnpj, { Título: 'Futuro', Status: 'Perdido', Motivo: 'Preço', Fechamento: amanha }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual([
      'criada',
      'criada',
      'criada',
      'pulada_invalida',
      'pulada_invalida',
      'criada',
      'pulada_invalida',
      'criada',
      'pulada_duplicada',
      'pulada_empresa_inexistente',
      'pulada_invalida',
      'criada',
      'pulada_invalida',
    ])
    const linhas = await linhasDe(c.d.tenantId, c.lote.id)
    const motivo = (n: number) => linhas.find((l) => l.numero === n)?.motivo
    expect(motivo(4)).toBe('Oportunidade Perdida exige o Motivo.')
    expect(motivo(5)).toBe('O motivo "Preço" não vale para oportunidade Cancelada.')
    expect(motivo(7)).toContain('Fase "Prospecção" não existe no funil')
    expect(motivo(13)).toBe('A data de fechamento não pode ser no futuro.')
    expect(linhas.find((l) => l.numero === 8)?.avisos).toEqual([
      'Sem data de fechamento: ficou a data da importação.',
      'Origem "Feira" não está cadastrada: entrou sem origem.',
    ])

    const o1 = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 1)
    expect(o1).toMatchObject({
      titulo: 'Contrato anual',
      status: 'ativo',
      fase: { id: c.fase('Proposta') },
      probabilidade: 50,
      probabilidadeManual: false,
      valorUnico: 2000,
      valorMensal: 500,
      meses: 12,
      valorTotal: 8000,
      dataPrevistaFechamento: '2030-12-15',
      responsavel: { id: c.membroId },
      observacoes: 'veio do CRM antigo',
    })
    expect(o1.historico.map((h) => h.acao)).toEqual(['criada'])

    const o2 = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 2)
    expect(o2).toMatchObject({
      fase: { id: c.fase('Qualificação') },
      probabilidade: 40,
      probabilidadeManual: true,
      meses: 6,
      valorTotal: 6000,
    })

    const o3 = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 3)
    expect(o3).toMatchObject({ status: 'perdido', motivo: { id: c.motivo('Preço') } })
    expect(o3.historico.map((h) => h.titulo)).toEqual([
      'Perdida (Preço), na fase Negociação',
      'Criada na fase Negociação',
    ])
    const [fechamento] = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ data: string; parou: string; detalhe: string }[]>`
          SELECT data_fechamento::text AS data, fase_parou_em_id AS parou, motivo_detalhe AS detalhe
          FROM oportunidades WHERE id = ${o3.id}`,
    )
    expect(fechamento).toEqual({
      data: '2026-03-10 03:00:00+00',
      parou: c.fase('Negociação'),
      detalhe: 'Fechou com o concorrente',
    })

    // suspensa: a retomada é uma Tarefa de dia inteiro, marcada como importada
    const o6 = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 6)
    expect(o6.status).toBe('suspenso')
    const [retomada] = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ titulo: string; origem: string; importacao_id: string }[]>`
          SELECT titulo, origem::text AS origem, importacao_id FROM atividades WHERE oportunidade_id = ${o6.id}`,
    )
    expect(retomada).toEqual({
      titulo: 'Retomar: Projeto 2027',
      origem: 'importacao',
      importacao_id: c.lote.id,
    })

    // conquistada: a chave "vira Cliente" ficou desligada (padrão), então a empresa não muda
    const o8 = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 8)
    expect(o8).toMatchObject({ status: 'conquistado', origem: null })
    expect(await statusDaEmpresa(c.d.tenantId, c.b.id)).not.toContain('cliente')

    const o12 = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 12)
    expect(o12.titulo).toBe('Empresa B')

    // o relatório traz o título da oportunidade de cada linha
    const lista = (await chamar('get', c.d.cookie, `${LOTES}/${c.lote.id}/linhas`))
      .body as ListaDeLinhas
    expect(lista.itens[0]).toMatchObject({
      resultado: 'criada',
      oportunidadeTitulo: 'Contrato anual',
      empresaNome: 'Empresa A',
    })
    expect(lista.itens[8]).toMatchObject({ resultado: 'pulada_duplicada', oportunidadeId: o1.id })
  })

  it('fica igual à oportunidade cadastrada e fechada pela tela', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, {
        Título: 'Igual',
        Fase: 'Diagnóstico',
        Status: 'Cancelada',
        Motivo: 'Duplicada',
        Único: '1500,50',
        Mensal: '200',
        Meses: '10',
        Probabilidade: '30',
        Previsão: '01/02/2031',
      }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const importada = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 1)

    const manual = (
      await chamar('post', c.d.cookie, OPS, {
        titulo: 'Igual (tela)',
        empresaId: c.a.id,
        faseId: c.fase('Diagnóstico'),
        valorUnico: 1500.5,
        valorMensal: 200,
        meses: 10,
        probabilidade: 30,
        dataPrevistaFechamento: '2031-02-01',
      })
    ).body as Oportunidade
    const fechada = await chamar('post', c.d.cookie, `${OPS}/${manual.id}/fechar`, {
      status: 'cancelado',
      motivoId: c.motivo('Duplicada'),
    })
    expect(fechada.status, JSON.stringify(fechada.body)).toBe(200)
    const daTela = (await chamar('get', c.d.cookie, `${OPS}/${manual.id}`))
      .body as OportunidadeDetalhada

    const comparavel = (o: OportunidadeDetalhada) => ({
      status: o.status,
      fase: o.fase,
      funil: o.funil,
      motivo: o.motivo,
      responsavel: o.responsavel,
      valorUnico: o.valorUnico,
      valorMensal: o.valorMensal,
      meses: o.meses,
      valorTotal: o.valorTotal,
      valorPonderado: o.valorPonderado,
      probabilidade: o.probabilidade,
      probabilidadeManual: o.probabilidadeManual,
      dataPrevistaFechamento: o.dataPrevistaFechamento,
      historico: o.historico.map((h) => ({ acao: h.acao, titulo: h.titulo })),
    })
    expect(comparavel(importada)).toEqual(comparavel(daTela))
  })

  it('conquistada com a chave ligada muda a empresa para Cliente; responsável e contato pelo e-mail', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, {
        Título: 'Ganha',
        Status: 'Conquistado',
        Contato: 'compras@exemplo.com.br',
        Responsável: 'gestor-oport@exemplo.com.br',
      }),
      linha(a.cnpj, { Título: 'Outra', Responsável: 'fantasma@exemplo.com.br' }),
    ])
    const gestorId = await membroComEmail(c.d.tenantId, 'gestor-oport@exemplo.com.br', 'Gestor')
    const contato = await chamar('post', c.d.cookie, '/v1/carteira/contatos', {
      nome: 'Compras',
      emails: [{ email: 'compras@exemplo.com.br' }],
      vinculo: { empresaId: c.a.id },
    })
    expect(contato.status, JSON.stringify(contato.body)).toBe(201)
    const r = await chamar('patch', c.d.cookie, `${LOTES}/${c.lote.id}`, {
      clienteAoConquistar: true,
    })
    expect((r.body as LoteDeImportacao).clienteAoConquistar).toBe(true)

    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const ganha = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 1)
    expect(ganha).toMatchObject({
      status: 'conquistado',
      responsavel: { id: gestorId },
      contato: { id: (contato.body as { id: string }).id },
    })
    expect(await statusDaEmpresa(c.d.tenantId, c.a.id)).toEqual(['cliente'])
    const outra = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 2)
    expect(outra.responsavel?.id).toBe(c.membroId)
    expect((await linhasDe(c.d.tenantId, c.lote.id))[1]?.avisos).toEqual([
      'Responsável fantasma@exemplo.com.br não é usuário da empresa: ficou com o vendedor da empresa.',
    ])
  })

  it('a prévia prevê o que o worker fez e não grava nada', async () => {
    const c = await cenario(({ a, b }) => [
      linha(a.cnpj, { Título: 'Um', Fase: 'Proposta' }),
      linha(a.cnpj, { Título: 'um' }), // repetida na planilha
      linha(b.cnpj, { Título: 'Perdida', Status: 'Perdido', Motivo: 'Preço' }),
      linha(b.cnpj, { Título: 'Sem motivo', Status: 'Perdido' }),
      linha('', { Título: 'Sem CNPJ' }),
      linha(cnpjNovo(), { Título: 'Fora' }),
      linha(b.cnpj, { Título: 'Aviso', Origem: 'Feira' }),
    ])
    const previa = (await chamar('get', c.d.cookie, `${LOTES}/${c.lote.id}/previa`))
      .body as PreviaDaImportacao
    expect(previa).toMatchObject({
      totalLinhas: 7,
      aImportar: 3,
      semCnpjValido: 1,
      comAviso: 2,
      previsao: {
        criada: 3,
        pulada_duplicada: 1,
        pulada_invalida: 1,
        pulada_sem_cnpj: 1,
        pulada_empresa_inexistente: 1,
        fechadas: 1,
      },
    })
    const [n] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM oportunidades`,
    )
    expect(n?.n).toBe(0)
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const contagem = (await resultados(c.d.tenantId, c.lote.id)).reduce<Record<string, number>>(
      (m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }),
      {},
    )
    expect(contagem).toEqual({
      criada: 3,
      pulada_duplicada: 1,
      pulada_invalida: 1,
      pulada_sem_cnpj: 1,
      pulada_empresa_inexistente: 1,
    })
  })

  it('dois executores no mesmo lote não duplicam oportunidade nem perdem linha', async () => {
    const c = await cenario(({ a, b }) =>
      Array.from({ length: 30 }, (_, i) =>
        linha(i % 2 ? a.cnpj : b.cnpj, { Título: `Op ${i % 20}` }),
      ),
    )
    expect((await chamar('post', c.d.cookie, `${LOTES}/${c.lote.id}/iniciar`)).status).toBe(200)
    await descartarEventos(c.d.tenantId)
    const novo = () =>
      new ExecutorDaImportacao({
        banco,
        receita: { consultar: () => Promise.reject(new Error('não consulta')) },
        log,
        esperar: () => Promise.resolve(),
        limites: { linhas: 3, duracaoMs: 60_000 },
      }).executar(c.d.tenantId, c.lote.id)
    await Promise.all([novo(), novo()])
    const r = await resultados(c.d.tenantId, c.lote.id)
    expect(r.filter((x) => x === 'pendente')).toHaveLength(0)
    expect(r.filter((x) => x === 'criada')).toHaveLength(20)
    expect(r.filter((x) => x === 'pulada_duplicada')).toHaveLength(10)
    const [n] = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ n: number }[]>`SELECT count(*)::int AS n FROM oportunidades WHERE excluido_em IS NULL`,
    )
    expect(n?.n).toBe(20)
  })
})

describe('importação de oportunidades: funil, valores das colunas e permissões', () => {
  it('lista os valores de cada coluna com o cadastro que valerá; o funil escolhido vale e trocá-lo esquece as fases', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, { Título: '1', Fase: 'proposta', Motivo: 'Preço', Status: 'Perdido' }),
      linha(a.cnpj, { Título: '2', Fase: 'Em proposta' }),
      linha(a.cnpj, { Título: '3', Fase: 'Lixo' }),
      linha(a.cnpj, { Título: '4', Solução: 'ERP Plus' }),
    ])
    const valores = async (campo: string) =>
      (await chamar('get', c.d.cookie, `${LOTES}/${c.lote.id}/valores-do-tipo?campo=${campo}`))
        .body as ValoresDoTipo
    const fases = Object.fromEntries((await valores('fase')).itens.map((i) => [i.chave, i]))
    expect(fases['proposta']).toMatchObject({ origem: 'automatico', tipoId: c.fase('Proposta') })
    expect(fases['em proposta']).toMatchObject({ origem: 'sem_correspondencia', tipoId: null })
    expect((await valores('motivo')).itens[0]).toMatchObject({ tipoId: c.motivo('Preço') })
    // sem `campo` no lote de oportunidades: 400
    expect((await chamar('get', c.d.cookie, `${LOTES}/${c.lote.id}/valores-do-tipo`)).status).toBe(
      400,
    )

    // apontar "Em proposta" para Proposta, pular "Lixo" e deixar a solução vazia de propósito
    const r = await chamar('patch', c.d.cookie, `${LOTES}/${c.lote.id}`, {
      valoresDeCampo: {
        fase: { 'em proposta': c.fase('Proposta'), lixo: null },
        solucao: { 'erp plus': null },
      },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((r.body as LoteDeImportacao).valoresDeCampo).toEqual({
      fase: { 'em proposta': c.fase('Proposta'), lixo: null },
      solucao: { 'erp plus': null },
    })
    // fase de outro funil não é aceita
    const outro = (
      await chamar('post', c.d.cookie, '/v1/configuracoes/funis', {
        nome: 'Renovação',
        fases: [{ nome: 'Contato' }, { nome: 'Fechamento' }],
      })
    ).body as { id: string; fases: { id: string; nome: string }[] }
    const ruim = await chamar('patch', c.d.cookie, `${LOTES}/${c.lote.id}`, {
      valoresDeCampo: { fase: { lixo: outro.fases[0]?.id } },
    })
    expect(ruim.status).toBe(400)

    // trocar o funil esquece as fases apontadas (eram do funil padrão); as do novo funil passam a valer
    const trocado = (
      await chamar('patch', c.d.cookie, `${LOTES}/${c.lote.id}`, { funilId: outro.id })
    ).body as LoteDeImportacao
    expect(trocado.funilId).toBe(outro.id)
    expect(trocado.valoresDeCampo).toEqual({ fase: {}, solucao: { 'erp plus': null } })
    const doOutro = (await valores('fase')).itens.every((i) => i.tipoId === null)
    expect(doOutro).toBe(true)

    // volta ao padrão e executa: 1 e 2 em Proposta, 3 pulada, 4 sem solução e sem aviso
    await chamar('patch', c.d.cookie, `${LOTES}/${c.lote.id}`, {
      funilId: null,
      valoresDeCampo: { fase: { 'em proposta': c.fase('Proposta'), lixo: null } },
    })
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const linhas = await linhasDe(c.d.tenantId, c.lote.id)
    expect(linhas.map((l) => l.resultado)).toEqual([
      'criada',
      'criada',
      'pulada_invalida',
      'criada',
    ])
    expect(linhas[2]?.motivo).toBe('Fase "Lixo" marcada para pular.')
    expect(linhas[3]?.avisos).toEqual([])
    const o2 = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 2)
    expect(o2.fase?.id).toBe(c.fase('Proposta'))
  })

  it('o funil escolhido recebe as oportunidades; inativá-lo antes de importar faz o lote parar', async () => {
    const c = await cenario(({ a }) => [linha(a.cnpj, { Título: 'Renovar', Fase: 'Fechamento' })])
    const outro = (
      await chamar('post', c.d.cookie, '/v1/configuracoes/funis', {
        nome: 'Renovação',
        fases: [{ nome: 'Contato' }, { nome: 'Fechamento' }],
      })
    ).body as { id: string; fases: { id: string; nome: string }[] }
    await chamar('patch', c.d.cookie, `${LOTES}/${c.lote.id}`, { funilId: outro.id })
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const o = await oportunidadeDaLinha(c.d.cookie, c.d.tenantId, c.lote.id, 1)
    expect(o).toMatchObject({
      funil: { id: outro.id },
      fase: { id: outro.fases.find((f) => f.nome === 'Fechamento')?.id },
    })
  })

  it('só administrador e gestor; escolhas de oportunidades não valem em outro tipo; modelo', async () => {
    const c = await cenario(({ a }) => [linha(a.cnpj, { Título: 'X' })])
    const vendedor = await usuarioSimples(app)
    await vincular(c.d.tenantId, vendedor.id, 'vendedor')
    await ativar(vendedor.id, c.d.tenantId)
    expect(
      (await chamar('get', vendedor.cookie, `${LOTES}/${c.lote.id}/valores-do-tipo?campo=fase`))
        .status,
    ).toBe(403)
    expect(
      (await chamar('patch', c.d.cookie, `${LOTES}/${c.lote.id}`, { tiposDeAtividade: {} })).status,
    ).toBe(400)

    const contatos = await request(app.getHttpServer())
      .post(`${LOTES}?arquivo=contatos.csv&tipo=contatos`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', c.d.cookie)
      .set('Content-Type', 'application/octet-stream')
      .send('CNPJ;Nome\n1;Ana')
    const patch = await chamar(
      'patch',
      c.d.cookie,
      `${LOTES}/${(contatos.body as LoteDeImportacao).id}`,
      {
        clienteAoConquistar: true,
      },
    )
    expect(patch.status).toBe(400)
    expect((patch.body as { erro: string }).erro).toBe('campo_so_de_oportunidades')
    const modelo = await chamar('get', c.d.cookie, '/v1/importacao/modelo?tipo=oportunidades')
    expect(modelo.status).toBe(200)
    expect(modelo.headers['content-disposition']).toContain('modelo-importacao-oportunidades.xlsx')
  })

  it('uma empresa não importa oportunidades para a carteira de outra', async () => {
    const outra = await novoDono(app)
    const daOutra = await criarEmpresa(
      outra.tenantId,
      await membroDe(outra.tenantId, outra.usuarioId),
      'Empresa da outra',
    )
    const c = await cenario(() => [linha(daOutra.cnpj, { Título: 'Invasão' })])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual(['pulada_empresa_inexistente'])
    const [n] = await noTenant(
      outra.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM oportunidades`,
    )
    expect(n?.n).toBe(0)
    // o lote de uma empresa não aparece para a outra
    expect((await chamar('get', outra.cookie, `${LOTES}/${c.lote.id}`)).status).toBe(404)
  })
})

describe('importação de oportunidades: desfazer', () => {
  it('tira o que o lote criou (e a retomada) e mantém a que mudou depois', async () => {
    const c = await cenario(({ a, b }) => [
      linha(a.cnpj, { Título: 'Intacta' }),
      linha(a.cnpj, { Título: 'Movida' }),
      linha(b.cnpj, {
        Título: 'Suspensa',
        Status: 'Suspenso',
        Motivo: 'Troca de gestor',
        'Retomar em': diaBr(2),
      }),
      linha(b.cnpj, { Título: 'Com atividade' }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const id = async (n: number) =>
      (await linhasDe(c.d.tenantId, c.lote.id)).find((l) => l.numero === n)
        ?.oportunidade_id as string
    // depois do lote: alguém move a 2 de fase e registra uma atividade na 4
    expect(
      (
        await chamar('post', c.d.cookie, `${OPS}/${await id(2)}/mover`, {
          faseId: c.fase('Proposta'),
        })
      ).status,
    ).toBe(200)
    const tipos = (await chamar('get', c.d.cookie, '/v1/configuracoes/tipos-atividade')).body as {
      id: string
      nome: string
    }[]
    const atividade = await chamar('post', c.d.cookie, '/v1/carteira/atividades', {
      tipoAtividadeId: tipos.find((t) => t.nome === 'Ligação')?.id,
      titulo: 'Ligar de novo',
      situacao: 'pendente',
      empresaId: c.b.id,
      oportunidadeId: await id(4),
      dataInicio: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(atividade.status, JSON.stringify(atividade.body)).toBe(201)

    const r = await chamar('post', c.d.cookie, `${LOTES}/${c.lote.id}/desfazer`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((r.body as LoteDeImportacao).desfeito).toEqual({ removidas: 2, mantidas: 2 })
    const restantes = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ titulo: string }[]>`
          SELECT titulo FROM oportunidades WHERE excluido_em IS NULL ORDER BY titulo`,
    )
    expect(restantes.map((o) => o.titulo)).toEqual(['Com atividade', 'Movida'])
    // a retomada da suspensa saiu junto, e a próxima atividade da empresa B foi recalculada
    const retomadas = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM atividades WHERE titulo = 'Retomar: Suspensa' AND excluido_em IS NULL`,
    )
    expect(retomadas[0]?.n).toBe(0)
  })

  it('desfazer um lote de empresas mantém a empresa que tem oportunidade', async () => {
    const c = await cenario(({ a }) => [linha(a.cnpj, { Título: 'Segura a empresa' })])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    // um lote de empresas (já concluído) que "criou" as empresas A e B
    const loteDeEmpresas = await noTenant(c.d.tenantId, async (tx) => {
      const [l] = await tx<{ id: string }[]>`
        INSERT INTO importacoes (id, tenant_id, tipo, nome, nome_arquivo, situacao, concluido_em, criado_por)
        VALUES (gen_random_uuid(), ${c.d.tenantId}, 'empresas', 'Empresas', 'empresas.csv', 'concluida', now(),
                ${c.membroId})
        RETURNING id`
      const id = (l as { id: string }).id
      await tx`UPDATE empresas SET importacao_id = ${id} WHERE id IN (${c.a.id}, ${c.b.id})`
      return id
    })
    const r = await chamar('post', c.d.cookie, `${LOTES}/${loteDeEmpresas}/desfazer`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const empresas = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ razao_social: string }[]>`
          SELECT razao_social FROM empresas WHERE excluido_em IS NULL ORDER BY razao_social`,
    )
    expect(empresas.map((e) => e.razao_social)).toEqual(['Empresa A'])
  })
})
