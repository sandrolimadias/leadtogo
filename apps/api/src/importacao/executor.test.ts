import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import {
  completarCnpj,
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
import {
  ESPERAS_DA_RECEITA_MS,
  ExecutorDaImportacao,
  LIMITE_DE_FALHAS_SEGUIDAS,
} from './executor.js'

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
const indisponivel = () => new ErroApi('receita_indisponivel', 'Receita fora do ar.', 503)

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

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

const iniciar = (cookie: string, id: string) =>
  chamar('post', cookie, `/v1/importacao/lotes/${id}/iniciar`)

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
const situacaoDe = async (tenantId: string, loteId: string) =>
  (
    await noTenant(
      tenantId,
      (tx) =>
        tx<
          { situacao: string }[]
        >`SELECT situacao::text AS situacao FROM importacoes WHERE id = ${loteId}`,
    )
  )[0]?.situacao

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

describe('ExecutorDaImportacao: o caminho completo', () => {
  it('cria as empresas válidas e pula o resto, com o lote registrado em cada uma', async () => {
    const [a, b, c, ja] = [cnpjNovo(), cnpjNovo(), cnpjNovo(), cnpjNovo()]
    const { d, membroId, lote, tag } = await cenario({
      linhas: [
        [a, 'Alfa', '', '', ''],
        [b, 'Beta', '', '', ''],
        ['123', 'CNPJ curto', '', '', ''],
        [a, 'Alfa repetida', '', '', ''],
        ['', 'Sem CNPJ', '', '', ''],
        [ja, 'Já existia', '', '', ''],
        [c, 'Gama', '', '', ''],
      ],
    })
    await noTenant(
      d.tenantId,
      (tx) => tx`
      INSERT INTO empresas (id, tenant_id, tipo_documento, documento, razao_social, vendedor_id)
      VALUES (gen_random_uuid(), ${d.tenantId}, 'cnpj', ${ja}, 'Empresa existente', ${membroId})`,
    )
    expect((await iniciar(d.cookie, lote.id)).status).toBe(200)

    const receita = new ReceitaFalsa()
    const esperas: number[] = []
    expect(await executor(receita, esperas).executar(d.tenantId, lote.id)).toBe('concluida')

    expect(await resultados(d.tenantId, lote.id)).toEqual([
      'criada',
      'criada',
      'pulada_sem_cnpj',
      'pulada_duplicada',
      'pulada_sem_cnpj',
      'pulada_duplicada',
      'criada',
    ])
    const linhas = await linhasDe(d.tenantId, lote.id)
    expect(linhas[3]?.motivo).toBe('CNPJ repetido na planilha: já está na linha 1.')
    expect(linhas[5]?.motivo).toBe('CNPJ já está na carteira; a empresa não foi alterada.')
    // só as 3 empresas novas foram à Receita, uma espera de 1,5 s depois de cada consulta de verdade
    expect(receita.chamadas).toEqual([a, b, c])
    expect(esperas).toEqual([1500, 1500, 1500])

    const empresas = await noTenant(
      d.tenantId,
      (tx) => tx<
        {
          documento: string
          origem: string
          importacao_id: string
          vendedor_id: string
          razao: string
          tel: string | null
        }[]
      >`
      SELECT e.documento, e.origem_cadastro::text AS origem, e.importacao_id, e.vendedor_id, e.razao_social AS razao,
             (SELECT numero_e164 FROM empresa_telefones t WHERE t.empresa_id = e.id LIMIT 1) AS tel
      FROM empresas e WHERE e.importacao_id = ${lote.id} ORDER BY e.documento`,
    )
    expect(empresas.map((e) => e.documento).sort()).toEqual([a, b, c].sort())
    for (const e of empresas) {
      expect(e).toMatchObject({
        origem: 'importacao',
        importacao_id: lote.id,
        vendedor_id: membroId,
      })
      expect(e.razao).toBe('METALURGICA EXEMPLO LTDA') // fonte "receita": o nome vem da Receita
      expect(e.tel).toBe('+552730643021')
    }
    // Status escolhido (Cliente), no histórico, e o lote fechado com totais e notificação
    const tags = await noTenant(
      d.tenantId,
      (tx) => tx<{ tag_id: string }[]>`
      SELECT et.tag_id FROM empresa_tags et JOIN empresas e ON e.id = et.empresa_id WHERE e.importacao_id = ${lote.id}`,
    )
    expect(tags.map((t) => t.tag_id)).toEqual([tag('cliente'), tag('cliente'), tag('cliente')])
    const [fim] = await noTenant(
      d.tenantId,
      (tx) => tx<{ situacao: string; totais: Record<string, number>; concluido_em: Date | null }[]>`
      SELECT situacao::text AS situacao, totais, concluido_em FROM importacoes WHERE id = ${lote.id}`,
    )
    expect(fim).toMatchObject({
      situacao: 'concluida',
      totais: { criada: 3, pulada_sem_cnpj: 2, pulada_duplicada: 2 },
    })
    expect(fim?.concluido_em).toBeTruthy()
    const [aviso] = await noTenant(
      d.tenantId,
      (tx) => tx<{ titulo: string; mensagem: string }[]>`
      SELECT titulo, mensagem FROM notificacoes WHERE id = ${lote.id}`,
    )
    expect(aviso).toEqual({
      titulo: 'Importação "teste" concluída',
      mensagem: '3 empresas importadas.',
    })

    // rodar de novo não faz nada: o lote já está concluído
    expect(await executor(receita).executar(d.tenantId, lote.id)).toBe('ignorada')
    expect(receita.chamadas).toHaveLength(3)
  })

  it('consulta que veio do cache não espera o intervalo', async () => {
    const { d, lote } = await cenario({
      linhas: [
        [cnpjNovo(), 'A', '', '', ''],
        [cnpjNovo(), 'B', '', '', ''],
      ],
    })
    await iniciar(d.cookie, lote.id)
    const receita = new ReceitaFalsa()
    receita.doCache = true
    const esperas: number[] = []
    await executor(receita, esperas).executar(d.tenantId, lote.id)
    expect(esperas).toEqual([])
  })
})

describe('ExecutorDaImportacao: perfil e bloqueio de empresa não ativa', () => {
  it('PRECEDÊNCIA: com o bloqueio ligado, empresa não ativa não entra, mesmo com "situação ativa" desligada no perfil e a ação "importar com a tag"', async () => {
    const [ativa, inativa] = [cnpjNovo(), cnpjNovo()]
    const { d, lote } = await cenario({
      linhas: [
        [ativa, 'Ativa', '', '', ''],
        [inativa, 'Baixada', '', '', ''],
      ],
      perfil: { exigeSituacaoAtiva: false, acaoForaDoPerfil: 'importar_com_tag' },
    })
    await iniciar(d.cookie, lote.id)
    const receita = new ReceitaFalsa()
    receita.respostas.set(inativa, () => baixada(inativa))
    await executor(receita).executar(d.tenantId, lote.id)
    expect(await resultados(d.tenantId, lote.id)).toEqual(['criada', 'pulada_nao_ativa'])
    expect((await linhasDe(d.tenantId, lote.id))[1]?.motivo).toBe(
      'Situação na Receita: BAIXADA (EXTINCAO).',
    )
    expect(
      await noTenant(d.tenantId, (tx) => tx`SELECT 1 FROM empresas WHERE documento = ${inativa}`),
    ).toHaveLength(0)
  })

  it('com o bloqueio desligado, quem decide é o perfil: "situação ativa" desligada deixa a baixada entrar', async () => {
    const inativa = cnpjNovo()
    const { d, lote } = await cenario({
      linhas: [[inativa, 'Baixada', '', '', '']],
      perfil: { exigeSituacaoAtiva: false },
      bloquear: false,
    })
    await iniciar(d.cookie, lote.id)
    const receita = new ReceitaFalsa()
    receita.respostas.set(inativa, () => baixada(inativa))
    await executor(receita).executar(d.tenantId, lote.id)
    expect(await resultados(d.tenantId, lote.id)).toEqual(['criada'])
  })

  it('fora do perfil: "pular" lista e não cadastra; "importar com a tag" cadastra com a tag Fora do perfil (criada na hora)', async () => {
    const [x, y] = [cnpjNovo(), cnpjNovo()]
    for (const [acao, esperado] of [
      ['pular', 'fora_do_perfil'],
      ['importar_com_tag', 'criada_fora_do_perfil'],
    ] as const) {
      const { d, lote } = await cenario({
        linhas: [
          [x, 'X', '', '', ''],
          [y, 'Y', '', '', ''],
        ],
        perfil: { cnaes: [CNAE_DO_PERFIL], acaoForaDoPerfil: acao },
      })
      await iniciar(d.cookie, lote.id)
      await executor(new ReceitaFalsa()).executar(d.tenantId, lote.id) // o CNAE principal é 2539001: fora da lista
      expect(await resultados(d.tenantId, lote.id)).toEqual([esperado, esperado])
      const motivo = (await linhasDe(d.tenantId, lote.id))[0]?.motivo ?? ''
      expect(motivo).toContain('CNAE principal 2539-0/01 fora da lista')
      const comTag = await noTenant(
        d.tenantId,
        (tx) => tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
        WHERE t.chave_sistema = 'fora_do_perfil'`,
      )
      expect(comTag[0]?.n).toBe(acao === 'pular' ? 0 : 2)
      if (acao === 'importar_com_tag') {
        const [grupo] = await noTenant(
          d.tenantId,
          (tx) => tx<{ nome: string; sistema: boolean }[]>`
          SELECT nome, sistema FROM tag_grupos WHERE chave_sistema = 'importacao'`,
        )
        expect(grupo).toEqual({ nome: 'Importação', sistema: true })
      }
    }
  })
})

describe('ExecutorDaImportacao: Receita com problema', () => {
  it('CNPJ que a Receita não conhece vira erro daquela linha; as outras seguem', async () => {
    const [a, b] = [cnpjNovo(), cnpjNovo()]
    const { d, lote } = await cenario({
      linhas: [
        [a, 'A', '', '', ''],
        [b, 'B', '', '', ''],
      ],
    })
    await iniciar(d.cookie, lote.id)
    const receita = new ReceitaFalsa()
    receita.respostas.set(a, () => new ErroApi('cnpj_nao_encontrado', 'não existe', 404))
    expect(await executor(receita).executar(d.tenantId, lote.id)).toBe('concluida')
    expect(await resultados(d.tenantId, lote.id)).toEqual(['erro', 'criada'])
    expect((await linhasDe(d.tenantId, lote.id))[0]?.motivo).toBe('A Receita não tem este CNPJ.')
  })

  it('fora do ar: tenta de novo com as esperas combinadas e, voltando, a linha entra', async () => {
    const a = cnpjNovo()
    const { d, lote } = await cenario({ linhas: [[a, 'A', '', '', '']] })
    await iniciar(d.cookie, lote.id)
    const receita = new ReceitaFalsa()
    receita.respostas.set(a, (tentativa) => (tentativa < 3 ? indisponivel() : respostaDaReceita(a)))
    const esperas: number[] = []
    await executor(receita, esperas).executar(d.tenantId, lote.id)
    expect(await resultados(d.tenantId, lote.id)).toEqual(['criada'])
    expect(esperas).toEqual([ESPERAS_DA_RECEITA_MS[0], ESPERAS_DA_RECEITA_MS[1], 1500])
  })

  it('fora do ar por muito tempo: a linha vira erro, e 3 linhas seguidas param o lote (falhou); retomar faz só as pendentes', async () => {
    const cnpjs = [cnpjNovo(), cnpjNovo(), cnpjNovo(), cnpjNovo()]
    const { d, lote } = await cenario({ linhas: cnpjs.map((c, i) => [c, `E${i}`, '', '', '']) })
    await iniciar(d.cookie, lote.id)
    const receita = new ReceitaFalsa()
    for (const c of cnpjs.slice(0, LIMITE_DE_FALHAS_SEGUIDAS))
      receita.respostas.set(c, () => indisponivel())
    const esperas: number[] = []
    expect(await executor(receita, esperas).executar(d.tenantId, lote.id)).toBe('falhou')
    expect(await resultados(d.tenantId, lote.id)).toEqual(['erro', 'erro', 'erro', 'pendente'])
    expect(await situacaoDe(d.tenantId, lote.id)).toBe('falhou')
    expect(esperas.filter((e) => ESPERAS_DA_RECEITA_MS.includes(e))).toHaveLength(
      ESPERAS_DA_RECEITA_MS.length * LIMITE_DE_FALHAS_SEGUIDAS,
    )
    const [aviso] = await noTenant(
      d.tenantId,
      (tx) => tx<{ titulo: string }[]>`SELECT titulo FROM notificacoes WHERE id = ${lote.id}`,
    )
    expect(aviso?.titulo).toBe('Importação "teste" parou')

    // a Receita volta: retomar faz só a linha pendente (as com erro ficam no relatório)
    expect((await iniciar(d.cookie, lote.id)).status).toBe(200)
    const volta = new ReceitaFalsa()
    expect(await executor(volta).executar(d.tenantId, lote.id)).toBe('concluida')
    expect(volta.chamadas).toEqual([cnpjs[3]])
    expect(await resultados(d.tenantId, lote.id)).toEqual(['erro', 'erro', 'erro', 'criada'])
  })
})

describe('ExecutorDaImportacao: cancelar e retomar', () => {
  it('cancelar para antes da próxima linha; retomar termina o que faltava sem repetir', async () => {
    const cnpjs = [cnpjNovo(), cnpjNovo(), cnpjNovo()]
    const { d, lote } = await cenario({ linhas: cnpjs.map((c, i) => [c, `E${i}`, '', '', '']) })
    await iniciar(d.cookie, lote.id)
    const receita = new ReceitaFalsa()
    // o usuário cancela no meio da segunda consulta
    receita.aoConsultar = async (cnpj) => {
      if (cnpj === cnpjs[1]) {
        const r = await chamar('post', d.cookie, `/v1/importacao/lotes/${lote.id}/cancelar`)
        expect(r.status).toBe(200)
      }
    }
    expect(await executor(receita).executar(d.tenantId, lote.id)).toBe('cancelada')
    expect(await resultados(d.tenantId, lote.id)).toEqual(['criada', 'criada', 'pendente'])
    expect(await situacaoDe(d.tenantId, lote.id)).toBe('cancelada')

    await iniciar(d.cookie, lote.id)
    const resto = new ReceitaFalsa()
    expect(await executor(resto).executar(d.tenantId, lote.id)).toBe('concluida')
    expect(resto.chamadas).toEqual([cnpjs[2]])
    expect(await resultados(d.tenantId, lote.id)).toEqual(['criada', 'criada', 'criada'])
  })
})

describe('ExecutorDaImportacao: os dados da planilha', () => {
  it('"planilha" sem perfil e sem bloqueio: não consulta a Receita; usa nome, telefone e cidade da planilha', async () => {
    const a = cnpjNovo()
    const { d, lote } = await cenario({
      linhas: [[a, 'Metalúrgica da Planilha', '(27) 99847-2210', 'Vitória', 'ES']],
      fonte: 'planilha',
      bloquear: false,
    })
    await iniciar(d.cookie, lote.id)
    const receita = new ReceitaFalsa()
    expect(await executor(receita).executar(d.tenantId, lote.id)).toBe('concluida')
    expect(receita.chamadas).toEqual([])
    const [e] = await noTenant(
      d.tenantId,
      (tx) => tx<
        {
          razao: string
          municipio: number | null
          tel: string | null
          origem: string
          nao_verificada: boolean
        }[]
      >`
      SELECT razao_social AS razao, municipio_codigo AS municipio, origem_cadastro::text AS origem,
             situacao_nao_verificada AS nao_verificada,
             (SELECT numero_e164 FROM empresa_telefones t WHERE t.empresa_id = empresas.id LIMIT 1) AS tel
      FROM empresas WHERE documento = ${a}`,
    )
    expect(e).toEqual({
      razao: 'Metalúrgica da Planilha',
      municipio: 3205309,
      tel: '+5527998472210',
      origem: 'importacao',
      nao_verificada: false,
    })
  })

  it('"completar": a planilha manda e a Receita preenche o que está vazio; sem razão social e fonte "planilha" a linha dá erro', async () => {
    const [a, b] = [cnpjNovo(), cnpjNovo()]
    const completar = await cenario({ linhas: [[a, '', '', '', '']], fonte: 'completar' })
    await iniciar(completar.d.cookie, completar.lote.id)
    await executor(new ReceitaFalsa()).executar(completar.d.tenantId, completar.lote.id)
    const [e] = await noTenant(
      completar.d.tenantId,
      (tx) =>
        tx<{ razao: string }[]>`SELECT razao_social AS razao FROM empresas WHERE documento = ${a}`,
    )
    expect(e?.razao).toBe('METALURGICA EXEMPLO LTDA')

    const semNome = await cenario({ linhas: [[b, '', '', '', '']], fonte: 'planilha' })
    await iniciar(semNome.d.cookie, semNome.lote.id)
    await executor(new ReceitaFalsa()).executar(semNome.d.tenantId, semNome.lote.id)
    expect(await resultados(semNome.d.tenantId, semNome.lote.id)).toEqual(['erro'])
    expect((await linhasDe(semNome.d.tenantId, semNome.lote.id))[0]?.motivo).toContain(
      'Razão social em branco',
    )
  })

  it('quem iniciou a importação deixou de poder importar: o lote falha sem tocar na carteira', async () => {
    const { d, lote } = await cenario({ linhas: [[cnpjNovo(), 'A', '', '', '']] })
    await iniciar(d.cookie, lote.id)
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE membros SET ativo = false WHERE usuario_id = ${d.usuarioId}`,
    )
    expect(await executor(new ReceitaFalsa()).executar(d.tenantId, lote.id)).toBe('falhou')
    expect(await resultados(d.tenantId, lote.id)).toEqual(['pendente'])
  })
})
