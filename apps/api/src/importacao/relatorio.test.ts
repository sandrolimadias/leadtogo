import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import {
  completarCnpj,
  type ListaDeLinhas,
  type ListaDeLotes,
  MOTIVO_IMPORTAR_MESMO_ASSIM,
  type LoteDeImportacao,
  normalizarRespostaDaReceita,
  type PerfilDeImportacao,
  type TagGrupo,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ErroApi } from '../http/erro-api.js'
import { respostaDaReceita } from '../receita/servidor-falso.js'
import type { ConsultaDeCnpj } from '../receita/receita.service.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { dono, novoDono } from '../testes/mundo.js'
import { ExecutorDaImportacao } from './executor.js'

// Todas as planilhas e respostas da Receita são inventadas aqui: nenhum dado real de cliente.

/** Um CNAE de mentira para a lista do perfil (nenhum CNAE real do Receita-falsa está nela). */
const CNAE_DO_PERFIL = 9_981_001

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const banco = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
const log = pino({ level: 'silent' })
/** As tabelas de referência vêm vazias no banco de teste: só o que estes testes usam. */
beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO portes (codigo, descricao) VALUES (3, 'Empresa de Pequeno Porte') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO qualificacoes_socio (codigo, descricao) VALUES (49, 'Sócio-Administrador') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO cnaes (codigo, descricao, secao, divisao, grupo, classe) VALUES (${CNAE_DO_PERFIL}, 'Atividade de teste do perfil', 'C', '99', '998', '99810') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'VITORIA', 'ES') ON CONFLICT DO NOTHING`
})
afterAll(async () => {
  await dono`DELETE FROM cnaes WHERE codigo = ${CNAE_DO_PERFIL}`
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
  completarCnpj(`8${String(Date.now() % 1_000_000).padStart(6, '0')}${++seq % 10}0001`.slice(0, 12))

/** Uma Receita de mentira: cada CNPJ responde o que o teste combinou; o que não foi combinado é ativa. */
class ReceitaFalsa {
  readonly chamadas: string[] = []
  readonly respostas = new Map<string, (tentativa: number) => Record<string, unknown> | ErroApi>()
  /** Chamado antes de cada consulta (para o teste mexer no lote no meio da execução) */
  aoConsultar: (cnpj: string) => Promise<void> | void = () => undefined
  doCache = false

  async consultar(cnpj: string): Promise<ConsultaDeCnpj> {
    await this.aoConsultar(cnpj)
    this.chamadas.push(cnpj)
    const tentativa = this.chamadas.filter((c) => c === cnpj).length
    const r = this.respostas.get(cnpj)?.(tentativa) ?? respostaDaReceita(cnpj)
    if (r instanceof ErroApi) throw r
    return {
      dados: normalizarRespostaDaReceita(r),
      fonte: 'minhareceita',
      consultadoEm: new Date(),
      doCache: this.doCache,
      expirada: false,
    }
  }
}
const baixada = (cnpj: string) =>
  respostaDaReceita(cnpj, {
    situacao_cadastral: 8,
    descricao_situacao_cadastral: 'BAIXADA',
    descricao_motivo_situacao_cadastral: 'EXTINCAO',
  })

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

/**
 * Os testes executam o lote chamando o executor direto. O evento que o "Iniciar" grava no outbox
 * serve a outro processo (o relay de um worker): se ficasse pendente, o worker de OUTRO teste, rodando
 * em paralelo, o pegaria e executaria este lote (inclusive consultando a Receita de verdade).
 * Por isso o evento é dado como entregue logo depois de gerado.
 */
const descartarEventos = (tenantId: string) =>
  noTenant(
    tenantId,
    (tx) =>
      tx`UPDATE eventos_outbox SET processado_em = now()
         WHERE tipo = 'importacao.executar' AND processado_em IS NULL`,
  )

const chamar = (metodo: 'get' | 'post' | 'patch', cookie: string, url: string, corpo?: unknown) => {
  const r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}

/** Empresa pronta para importar: lote criado pela API, escolhas feitas, ainda em rascunho/pronta. */
async function cenario(opcoes: {
  linhas: string[][]
  fonte?: 'planilha' | 'receita' | 'completar'
  campos?: Record<string, string>
  perfil?: Record<string, unknown>
  status?: 'cliente' | 'lead'
  bloquear?: boolean
}) {
  const d = await novoDono(app)
  const membroId = await noTenant(d.tenantId, async (tx) => {
    const [m] = await tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    return (m as { id: string }).id
  })
  const grupos = (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
  const tag = (chave: string) =>
    (grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === chave) as { id: string }).id
  const csv = [
    'CNPJ;Razão social;Telefone;Cidade;UF',
    ...opcoes.linhas.map((l) => l.join(';')),
  ].join('\n')
  const criado = await request(app.getHttpServer())
    .post('/v1/importacao/lotes?arquivo=teste.csv')
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', d.cookie)
    .set('Content-Type', 'application/octet-stream')
    .send(csv)
  const lote = criado.body as LoteDeImportacao
  let perfilId: string | null = null
  if (opcoes.perfil) {
    perfilId = (
      (await chamar('post', d.cookie, '/v1/importacao/perfis', { nome: 'P', ...opcoes.perfil }))
        .body as PerfilDeImportacao
    ).id
  }
  const r = await chamar('patch', d.cookie, `/v1/importacao/lotes/${lote.id}`, {
    fonteDados: opcoes.fonte ?? 'receita',
    campos: opcoes.campos ?? {
      documento: 'CNPJ',
      razaoSocial: 'Razão social',
      telefone: 'Telefone',
      municipio: 'Cidade',
      uf: 'UF',
    },
    intervaloMs: 1500,
    perfilId,
    vendedorId: membroId,
    statusTagId: tag(opcoes.status ?? 'cliente'),
  })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  if (opcoes.bloquear === false) {
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE tenant_configuracoes SET bloquear_empresa_nao_ativa = false WHERE tenant_id = ${d.tenantId}`,
    )
  }
  return { d, membroId, lote, tag }
}

const iniciar = async (d: { cookie: string; tenantId: string }, id: string) => {
  const r = await chamar('post', d.cookie, `/v1/importacao/lotes/${id}/iniciar`)
  await descartarEventos(d.tenantId)
  return r
}

const linhasDe = (tenantId: string, loteId: string) =>
  noTenant(
    tenantId,
    (tx) =>
      tx<{ numero: number; resultado: string; motivo: string | null; empresa_id: string | null }[]>`
      SELECT numero, resultado::text AS resultado, motivo, empresa_id
      FROM importacao_linhas WHERE importacao_id = ${loteId} ORDER BY numero`,
  )
const resultados = async (tenantId: string, loteId: string) =>
  (await linhasDe(tenantId, loteId)).map((l) => l.resultado)
function executor(receita: ReceitaFalsa, esperas: number[] = []) {
  return new ExecutorDaImportacao({
    banco,
    receita,
    log,
    esperar: (ms) => {
      esperas.push(ms)
      return Promise.resolve()
    },
  })
}

/** Roda os blocos, um atrás do outro, até o lote deixar de "continuar" (como o worker faz com a fila). */
const executar = async (receita: ReceitaFalsa, tenantId: string, loteId: string) => {
  const ex = executor(receita)
  for (;;) {
    const { desfecho } = await ex.executarBloco(tenantId, loteId)
    if (desfecho !== 'continua') return desfecho
  }
}

const linhasApi = async (cookie: string, id: string, consulta = '') =>
  (await chamar('get', cookie, `/v1/importacao/lotes/${id}/linhas${consulta}`))
    .body as ListaDeLinhas

/** 6 linhas: 4 entram, 1 sem CNPJ (com texto que vira fórmula no Excel) e 1 repetida. */
async function lotePronto(perfilAcao: 'pular' | 'importar_com_tag' = 'pular') {
  const [a, b, fora, ruim] = [cnpjNovo(), cnpjNovo(), cnpjNovo(), cnpjNovo()]
  const c = await cenario({
    linhas: [
      [a, 'Alfa', '', '', ''],
      [b, 'Beta', '', '', ''],
      ['', '=HYPERLINK("http://exemplo")', '', '', ''],
      [a, 'Alfa repetida', '', '', ''],
      [fora, 'Fora do perfil', '', '', ''],
      [ruim, 'Com; ponto e vírgula', '', '', ''],
    ],
    perfil: { acaoForaDoPerfil: perfilAcao },
  })
  return { ...c, receita: new ReceitaFalsa(), a, b, fora, ruim }
}

describe('GET /v1/importacao/lotes (lista)', () => {
  it('traz os lotes do mais novo para o mais antigo, com a contagem; só da própria empresa; vendedor 403', async () => {
    const um = await cenario({ linhas: [[cnpjNovo(), 'A', '', '', '']] })
    const dois = await request(app.getHttpServer())
      .post('/v1/importacao/lotes?arquivo=segundo.csv')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', um.d.cookie)
      .set('Content-Type', 'application/octet-stream')
      .send('CNPJ;Razão social\n1;X\n')
    const lista = (await chamar('get', um.d.cookie, '/v1/importacao/lotes')).body as ListaDeLotes
    expect(lista.total).toBe(2)
    expect(lista.itens.map((l) => l.nomeArquivo)).toEqual(['segundo.csv', 'teste.csv'])
    expect(lista.itens[0]).toMatchObject({
      id: (dois.body as LoteDeImportacao).id,
      situacao: 'rascunho',
      totalLinhas: 1,
    })
    expect(lista.itens[0]?.criadoPor).toBeTruthy()
    const pagina = (await chamar('get', um.d.cookie, '/v1/importacao/lotes?pagina=2&porPagina=1'))
      .body as ListaDeLotes
    expect(pagina.itens.map((l) => l.nomeArquivo)).toEqual(['teste.csv'])
    const outra = await cenario({ linhas: [[cnpjNovo(), 'B', '', '', '']] })
    expect(
      ((await chamar('get', outra.d.cookie, '/v1/importacao/lotes')).body as ListaDeLotes).total,
    ).toBe(1)
    expect((await chamar('get', um.d.cookie, '/v1/importacao/lotes?porPagina=500')).status).toBe(
      400,
    )
  })
})

describe('relatório: linhas, CSV e importar mesmo assim', () => {
  it('lista as linhas com o resultado, filtra por resultado e pagina; a empresa criada vem com o nome', async () => {
    const { d, lote, receita, a } = await lotePronto()
    await iniciar(d, lote.id)
    // o perfil sem lista de CNAEs aceita tudo: só a linha sem CNPJ e a repetida ficam de fora
    expect(await executar(receita, d.tenantId, lote.id)).toBe('concluida')
    const todas = await linhasApi(d.cookie, lote.id)
    expect(todas).toMatchObject({
      total: 6,
      pagina: 1,
      porPagina: 50,
      colunas: ['CNPJ', 'Razão social', 'Telefone', 'Cidade', 'UF'],
    })
    expect(todas.itens.map((l) => l.resultado)).toEqual([
      'criada',
      'criada',
      'pulada_sem_cnpj',
      'pulada_duplicada',
      'criada',
      'criada',
    ])
    expect(todas.itens[0]).toMatchObject({
      numero: 1,
      empresaNome: 'EXEMPLO USINAGEM',
      dados: { CNPJ: a, 'Razão social': 'Alfa' },
    })
    expect(todas.itens[2]).toMatchObject({
      motivo: 'CNPJ em branco.',
      empresaId: null,
      empresaNome: null,
    })
    const so = await linhasApi(d.cookie, lote.id, '?resultado=pulada_sem_cnpj')
    expect([so.total, so.itens.map((l) => l.numero)]).toEqual([1, [3]])
    const segunda = await linhasApi(d.cookie, lote.id, '?porPagina=4&pagina=2')
    expect(segunda.itens.map((l) => l.numero)).toEqual([5, 6])
    expect(
      (await chamar('get', d.cookie, `/v1/importacao/lotes/${lote.id}/linhas?resultado=x`)).status,
    ).toBe(400)
    const outra = await cenario({ linhas: [[cnpjNovo(), 'B', '', '', '']] })
    expect(
      (await chamar('get', outra.d.cookie, `/v1/importacao/lotes/${lote.id}/linhas`)).status,
    ).toBe(404)
  })

  it('o CSV traz só o que não entrou, em português, e não deixa texto virar fórmula', async () => {
    const { d, lote, receita } = await lotePronto()
    await iniciar(d, lote.id)
    await executar(receita, d.tenantId, lote.id)
    const r = await request(app.getHttpServer())
      .get(`/v1/importacao/lotes/${lote.id}/problemas.csv`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = []
        res.on('data', (p: Buffer) => partes.push(p))
        res.on('end', () => cb(null, Buffer.concat(partes)))
      })
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toContain('text/csv')
    const texto = (r.body as Buffer).toString('utf8')
    expect(texto.startsWith('\uFEFF')).toBe(true)
    const linhas = texto.slice(1).trimEnd().split('\r\n')
    expect(linhas[0]).toBe('Linha;Resultado;Motivo;CNPJ;Razão social;Telefone;Cidade;UF')
    expect(linhas).toHaveLength(3) // cabeçalho + as 2 que não entraram
    expect(linhas[1]).toBe(
      `3;Pulada: sem CNPJ válido;CNPJ em branco.;;"'=HYPERLINK(""http://exemplo"")";;;`,
    )
    expect(
      linhas[2]?.startsWith(
        '4;Pulada: CNPJ repetido ou já na carteira;CNPJ repetido na planilha: já está na linha 1.;',
      ),
    ).toBe(true)
  })

  it('importar mesmo assim: as fora do perfil voltam a pendentes e entram com a tag; o bloqueio de empresa não ativa continua valendo', async () => {
    const [x, y, z] = [cnpjNovo(), cnpjNovo(), cnpjNovo()]
    const c = await cenario({
      linhas: [
        [x, 'X', '', '', ''],
        [y, 'Y', '', '', ''],
        [z, 'Z', '', '', ''],
      ],
      perfil: { cnaes: [CNAE_DO_PERFIL] }, // o CNAE das três é outro: todas ficam fora do perfil ("pular")
      bloquear: false,
    })
    await iniciar(c.d, c.lote.id)
    const receita = new ReceitaFalsa()
    receita.respostas.set(z, () => baixada(z))
    await executar(receita, c.d.tenantId, c.lote.id)
    // nas três a Receita mostra um CNAE fora da lista; a Z está baixada (e o perfil pede ativa)
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual([
      'fora_do_perfil',
      'fora_do_perfil',
      'fora_do_perfil',
    ])

    // lote não concluído e lote sem linhas fora do perfil são recusados
    const incompleto = await cenario({ linhas: [[cnpjNovo(), 'W', '', '', '']] })
    const antes = await chamar(
      'post',
      incompleto.d.cookie,
      `/v1/importacao/lotes/${incompleto.lote.id}/importar-fora-do-perfil`,
      {},
    )
    expect([antes.status, (antes.body as { erro: string }).erro]).toEqual([
      409,
      'importacao_nao_concluida',
    ])

    // o bloqueio liga de novo antes de importar "mesmo assim": a baixada continua de fora
    await noTenant(
      c.d.tenantId,
      (tx) =>
        tx`UPDATE tenant_configuracoes SET bloquear_empresa_nao_ativa = true WHERE tenant_id = ${c.d.tenantId}`,
    )
    const linhas = await linhasApi(c.d.cookie, c.lote.id)
    const r = await chamar(
      'post',
      c.d.cookie,
      `/v1/importacao/lotes/${c.lote.id}/importar-fora-do-perfil`,
      {
        linhaIds: [linhas.itens[0]?.id, linhas.itens[2]?.id],
      },
    )
    expect(r.status).toBe(200)
    await descartarEventos(c.d.tenantId)
    expect((r.body as LoteDeImportacao).situacao).toBe('em_andamento')
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual([
      'pendente',
      'fora_do_perfil',
      'pendente',
    ])
    // a decisão de "importar mesmo assim" mora na linha (no banco), não no evento nem no job
    const marcadas = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ numero: number }[]>`
      SELECT numero FROM importacao_linhas
      WHERE importacao_id = ${c.lote.id} AND motivo = ${MOTIVO_IMPORTAR_MESMO_ASSIM} ORDER BY numero`,
    )
    expect(marcadas).toHaveLength(2)
    // dois cliques: o segundo já encontra o lote em andamento
    const de2 = await chamar(
      'post',
      c.d.cookie,
      `/v1/importacao/lotes/${c.lote.id}/importar-fora-do-perfil`,
      {},
    )
    expect([de2.status, (de2.body as { erro: string }).erro]).toEqual([
      409,
      'importacao_nao_concluida',
    ])

    expect(await executar(receita, c.d.tenantId, c.lote.id)).toBe('concluida')
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual([
      'criada_fora_do_perfil',
      'fora_do_perfil',
      'pulada_nao_ativa',
    ])
    const comTag = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ documento: string }[]>`
      SELECT e.documento FROM empresas e JOIN empresa_tags et ON et.empresa_id = e.id JOIN tags t ON t.id = et.tag_id
      WHERE t.chave_sistema = 'fora_do_perfil'`,
    )
    expect(comTag.map((e) => e.documento)).toEqual([x])

    // a Y segue fora do perfil e pode ser importada depois, sem lista de ids (todas as que restam)
    const resto = await chamar(
      'post',
      c.d.cookie,
      `/v1/importacao/lotes/${c.lote.id}/importar-fora-do-perfil`,
      {},
    )
    expect(resto.status).toBe(200)
    await descartarEventos(c.d.tenantId)
    await executar(receita, c.d.tenantId, c.lote.id)
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual([
      'criada_fora_do_perfil',
      'criada_fora_do_perfil',
      'pulada_nao_ativa',
    ])
    const nada = await chamar(
      'post',
      c.d.cookie,
      `/v1/importacao/lotes/${c.lote.id}/importar-fora-do-perfil`,
      {},
    )
    expect([nada.status, (nada.body as { erro: string }).erro]).toEqual([
      409,
      'sem_linhas_fora_do_perfil',
    ])
  })
})
