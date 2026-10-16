import type { Server } from 'node:http'

import { criarConexao } from '@leadtogo/db'
import {
  completarCnpj,
  type ListaDeLinhas,
  type LoteDeImportacao,
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
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'
import { ExecutorDaImportacao } from './executor.js'

// Importação de ATIVIDADES: planilhas e pessoas inventadas aqui; nenhum dado real.

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
  completarCnpj(`6${String(Date.now() % 1_000_000).padStart(6, '0')}${++seq % 10}0001`.slice(0, 12))

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
const chamar = (metodo: Metodo, cookie: string, url: string, corpo?: unknown) => {
  const r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}

const CABECALHO = [
  'CNPJ',
  'Tipo',
  'Título',
  'Data',
  'Hora',
  'Situação',
  'Resultado',
  'E-mail do contato',
  'E-mail do responsável',
  'Importante',
  'Urgente',
  'Obs',
]
const CAMPOS = {
  documento: 'CNPJ',
  tipo: 'Tipo',
  titulo: 'Título',
  data: 'Data',
  hora: 'Hora',
  situacao: 'Situação',
  resultado: 'Resultado',
  emailContato: 'E-mail do contato',
  emailResponsavel: 'E-mail do responsável',
  importante: 'Importante',
  urgente: 'Urgente',
  observacoes: 'Obs',
}
const linha = (cnpj: string, tipo: string, data: string, extra: Record<string, string> = {}) =>
  CABECALHO.map((c) =>
    c === 'CNPJ' ? cnpj : c === 'Tipo' ? tipo : c === 'Data' ? data : (extra[c] ?? ''),
  ).join(';')

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

type Empresa = { id: string; cnpj: string }
async function cenario(corpo: (a: { a: Empresa; b: Empresa }) => string[], mapear = true) {
  const d = await novoDono(app)
  const membroId = await noTenant(d.tenantId, async (tx) => {
    const [m] = await tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    return (m as { id: string }).id
  })
  const a = await criarEmpresa(d.tenantId, membroId, 'Empresa A')
  const b = await criarEmpresa(d.tenantId, membroId, 'Empresa B')
  const csv = [CABECALHO.join(';'), ...corpo({ a, b })].join('\n')
  const criado = await request(app.getHttpServer())
    .post('/v1/importacao/lotes?arquivo=atividades.csv&tipo=atividades')
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', d.cookie)
    .set('Content-Type', 'application/octet-stream')
    .send(csv)
  expect(criado.status, JSON.stringify(criado.body)).toBe(201)
  const lote = criado.body as LoteDeImportacao
  if (mapear) {
    const r = await chamar('patch', d.cookie, `/v1/importacao/lotes/${lote.id}`, { campos: CAMPOS })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((r.body as LoteDeImportacao).situacao).toBe('pronta')
  }
  const tipos = (
    (await chamar('get', d.cookie, '/v1/configuracoes/tipos-atividade')).body as {
      id: string
      nome: string
    }[]
  ).reduce<Record<string, string>>((m, t) => ({ ...m, [t.nome]: t.id }), {})
  return { d, membroId, lote, a, b, tipos }
}

const executar = async (d: { cookie: string; tenantId: string }, id: string) => {
  expect((await chamar('post', d.cookie, `/v1/importacao/lotes/${id}/iniciar`)).status).toBe(200)
  await descartarEventos(d.tenantId)
  return new ExecutorDaImportacao({
    banco,
    receita: { consultar: () => Promise.reject(new Error('atividades não consultam a Receita')) },
    log,
    esperar: () => Promise.resolve(),
  }).executar(d.tenantId, id)
}

const linhasDe = (tenantId: string, loteId: string) =>
  noTenant(
    tenantId,
    (tx) =>
      tx<{ numero: number; resultado: string; motivo: string | null; avisos: string[] }[]>`
        SELECT numero, resultado::text AS resultado, motivo, avisos
        FROM importacao_linhas WHERE importacao_id = ${loteId} ORDER BY numero`,
  )
const resultados = async (t: string, l: string) => (await linhasDe(t, l)).map((x) => x.resultado)

const carteiraDe = (tenantId: string, empresaId: string) =>
  noTenant(tenantId, async (tx) => {
    const [e] = await tx<
      { visita: string | null; contato: string | null; proxima: string | null }[]
    >`SELECT ultima_visita_em::text AS visita, ultimo_contato_em::text AS contato,
             proxima_atividade_em::text AS proxima FROM empresas WHERE id = ${empresaId}`
    const tags = await tx<{ nome: string }[]>`
      SELECT t.nome FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
      WHERE et.empresa_id = ${empresaId} AND t.chave_sistema IN ('visitada', 'contactada') ORDER BY t.nome`
    return {
      ...(e as { visita: string | null; contato: string | null; proxima: string | null }),
      tags: tags.map((t) => t.nome),
    }
  })

describe('importação de atividades: o caminho completo', () => {
  it('lê a planilha no fuso da empresa e importa, pula e avisa como combinado', async () => {
    const c = await cenario(({ a, b }) => [
      // 1 visita realizada, com hora (09:30 em São Paulo = 12:30 UTC)
      linha(a.cnpj, 'Visita', '05/03/2026', {
        Hora: '09:30',
        Situação: 'Realizada',
        Resultado: 'Boa conversa',
        Título: 'Visita 1',
      }),
      // 2 tipo que não existe e não foi apontado
      linha(a.cnpj, 'Visita técnica', '06/03/2026', { Resultado: 'ok' }),
      // 3 a mesma, que o mapeamento aponta para Visita (feito abaixo)
      linha(a.cnpj, 'Instalação', '07/03/2026', {
        Resultado: 'ok',
        Título: 'Instalação do sistema',
      }),
      // 4 sem situação, data passada: Realizada
      linha(a.cnpj, 'Ligação', '10/03/2026', { Resultado: 'Pediu proposta' }),
      // 5 sem situação, data futura: Pendente
      linha(a.cnpj, 'Ligação', '30/12/2030', { Hora: '14:00', Título: 'Retornar' }),
      // 6 realizada no futuro: pula
      linha(a.cnpj, 'Visita', '31/12/2030', { Situação: 'Realizada', Resultado: 'ok' }),
      // 7 realizada sem resultado: pula
      linha(a.cnpj, 'Visita', '08/03/2026', { Situação: 'Realizada' }),
      // 8 situação desconhecida: pula
      linha(a.cnpj, 'Visita', '08/03/2026', { Situação: 'adiada' }),
      // 9 CNPJ fora da carteira
      linha(cnpjNovo(), 'Visita', '08/03/2026', { Resultado: 'ok' }),
      // 10 idêntica à linha 1 (mesma empresa, tipo, data, hora e título)
      linha(a.cnpj, 'Visita', '05/03/2026', {
        Hora: '09:30',
        Situação: 'Realizada',
        Resultado: 'repetida',
        Título: 'Visita 1',
      }),
      // 11 cancelada guarda o resultado
      linha(b.cnpj, 'Reunião', '11/03/2026', {
        Situação: 'Cancelada',
        Resultado: 'Cliente desistiu',
      }),
      // 12 pendente com resultado: o resultado é ignorado, com aviso
      linha(b.cnpj, 'Reunião', '31/12/2030', { Resultado: 'combinar' }),
      // 13 e-mail do contato sem vínculo e responsável que não é usuário: avisos
      linha(b.cnpj, 'Ligação', '12/03/2026', {
        Resultado: 'ok',
        'E-mail do contato': 'ninguem@exemplo.com.br',
        'E-mail do responsável': 'fantasma@exemplo.com.br',
      }),
      // 14 dia inteiro às 22h e 00h30 (fuso): horas distintas no mesmo dia
      linha(b.cnpj, 'Ligação', '13/03/2026', {
        Hora: '22:00',
        Resultado: 'noite',
        Título: 'noite',
      }),
      linha(b.cnpj, 'Ligação', '13/03/2026', {
        Hora: '00:30',
        Resultado: 'madrugada',
        Título: 'madrugada',
      }),
      // 16 data inválida
      linha(b.cnpj, 'Ligação', '31/02/2026'),
    ])
    const instalacao = c.tipos['Visita'] as string
    const r = await chamar('patch', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}`, {
      tiposDeAtividade: { instalacao },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await executar(c.d, c.lote.id)).toBe('concluida')

    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual([
      'criada',
      'pulada_tipo_inexistente',
      'criada',
      'criada',
      'criada',
      'pulada_no_futuro',
      'pulada_invalida',
      'pulada_invalida',
      'pulada_empresa_inexistente',
      'pulada_duplicada',
      'criada',
      'criada',
      'criada',
      'criada',
      'criada',
      'pulada_invalida',
    ])
    const linhas = await linhasDe(c.d.tenantId, c.lote.id)
    expect(linhas[11]?.avisos).toEqual(['Resultado ignorado: a atividade está Pendente.'])
    expect(linhas[12]?.avisos).toHaveLength(2)
    expect(linhas[12]?.avisos.join(' ')).toContain('vínculo ativo')
    expect(linhas[12]?.avisos.join(' ')).toContain('fantasma@exemplo.com.br')

    const atividades = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<
          {
            titulo: string
            situacao: string
            origem: string
            lote: string
            inicio: string
            dia_inteiro: boolean
            realizada: string | null
            resultado: string | null
            responsavel: string
          }[]
        >`SELECT titulo, situacao::text AS situacao, origem::text AS origem, importacao_id::text AS lote,
               (data_inicio AT TIME ZONE 'America/Sao_Paulo')::text AS inicio, dia_inteiro,
               realizada_em::text AS realizada, resultado, responsavel_id::text AS responsavel
        FROM atividades WHERE importacao_id = ${c.lote.id} ORDER BY data_inicio, titulo`,
    )
    expect(atividades).toHaveLength(9)
    expect(atividades.every((x) => x.origem === 'importacao' && x.lote === c.lote.id)).toBe(true)
    const porTitulo = (t: string) => atividades.find((x) => x.titulo === t)
    // 09:30 de São Paulo, não de UTC; dia inteiro sem hora
    expect(porTitulo('Visita 1')?.inicio).toBe('2026-03-05 09:30:00')
    expect(porTitulo('Visita 1')).toMatchObject({ situacao: 'realizada', dia_inteiro: false })
    expect(porTitulo('Instalação do sistema')).toMatchObject({
      situacao: 'realizada',
      dia_inteiro: true,
    })
    // 22h e 00h30 do dia 13 ficam no dia 13 (no fuso), com 21h30 de diferença
    expect(porTitulo('noite')?.inicio).toBe('2026-03-13 22:00:00')
    expect(porTitulo('madrugada')?.inicio).toBe('2026-03-13 00:30:00')
    expect(porTitulo('Retornar')).toMatchObject({ situacao: 'pendente', realizada: null })
    expect(atividades.filter((x) => x.situacao === 'cancelada')).toHaveLength(1)
    expect(atividades.find((x) => x.situacao === 'cancelada')?.resultado).toBe('Cliente desistiu')
    expect(
      atividades.find((x) => x.titulo === 'Reunião' && x.situacao === 'pendente')?.resultado,
    ).toBeNull()
    // sem o e-mail do responsável (ou com um desconhecido), quem importou fica como responsável
    expect(new Set(atividades.map((x) => x.responsavel))).toEqual(new Set([c.membroId]))
  })

  it('a carteira da empresa fica igual à do registro pela tela (última visita, último contato, próxima e tags)', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, 'Visita', '01/09/2026', {
        Hora: '10:00',
        Situação: 'Realizada',
        Resultado: 'v1',
      }),
      linha(a.cnpj, 'Ligação', '01/10/2026', {
        Hora: '09:00',
        Situação: 'Realizada',
        Resultado: 'l1',
      }),
      linha(a.cnpj, 'Reunião', '01/01/2031', { Situação: 'Pendente' }),
      linha(a.cnpj, 'Ligação', '01/02/2031', { Hora: '08:00', Situação: 'Pendente' }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const importada = await carteiraDe(c.d.tenantId, c.a.id)

    // A mesma coisa registrada pela API, como a tela faz, em OUTRA empresa
    const manual = await criarEmpresa(c.d.tenantId, c.membroId, 'Empresa manual')
    const registrar = (corpo: Record<string, unknown>) =>
      chamar('post', c.d.cookie, '/v1/carteira/atividades', { empresaId: manual.id, ...corpo })
    const sp = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString()
    const feitas = [
      await registrar({
        tipoAtividadeId: c.tipos['Visita'],
        titulo: 'Visita',
        situacao: 'realizada',
        resultado: 'v1',
        dataInicio: sp('2026-09-01', '10:00'),
      }),
      await registrar({
        tipoAtividadeId: c.tipos['Ligação'],
        titulo: 'Ligação',
        situacao: 'realizada',
        resultado: 'l1',
        dataInicio: sp('2026-10-01', '09:00'),
      }),
      await registrar({
        tipoAtividadeId: c.tipos['Reunião'],
        titulo: 'Reunião',
        situacao: 'pendente',
        diaInteiro: true,
        dataInicio: sp('2031-01-01', '00:00'),
      }),
      await registrar({
        tipoAtividadeId: c.tipos['Ligação'],
        titulo: 'Ligação',
        situacao: 'pendente',
        dataInicio: sp('2031-02-01', '08:00'),
      }),
    ]
    for (const f of feitas) expect(f.status, JSON.stringify(f.body)).toBe(201)
    const manualCarteira = await carteiraDe(c.d.tenantId, manual.id)
    expect(importada).toEqual(manualCarteira)
    expect(importada.tags).toEqual(['Contactada', 'Visitada'])
    expect(importada.visita).not.toBeNull()
    expect(importada.proxima).not.toBeNull()
  })

  it('contato pelo e-mail (com vínculo) e responsável pelo e-mail de um usuário da empresa', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, 'Ligação', '10/03/2026', {
        Resultado: 'ok',
        'E-mail do contato': 'MARIA@exemplo.com.br',
        'E-mail do responsável': 'vendedora@exemplo.com.br',
      }),
    ])
    const vend = await usuarioSimples(app)
    const vendedorId = await vincular(c.d.tenantId, vend.id, 'vendedor', 'Vendedora')
    await ativar(vend.id, c.d.tenantId)
    await noTenant(c.d.tenantId, async (tx) => {
      await tx`UPDATE membros SET email = 'vendedora@exemplo.com.br' WHERE id = ${vendedorId}`
      const [x] = await tx<{ id: string }[]>`
        INSERT INTO contatos (id, tenant_id, nome) VALUES (gen_random_uuid(), ${c.d.tenantId}, 'Maria') RETURNING id`
      const id = (x as { id: string }).id
      await tx`INSERT INTO contato_emails (id, tenant_id, contato_id, email) VALUES (gen_random_uuid(), ${c.d.tenantId}, ${id}, 'maria@exemplo.com.br')`
      await tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id) VALUES (gen_random_uuid(), ${c.d.tenantId}, ${c.a.id}, ${id})`
    })
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const [a] = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ responsavel: string; nome: string }[]>`
        SELECT a.responsavel_id::text AS responsavel, c.nome FROM atividades a
        JOIN contatos c ON c.id = a.contato_id WHERE a.importacao_id = ${c.lote.id}`,
    )
    expect(a).toEqual({ responsavel: vendedorId, nome: 'Maria' })
    expect((await linhasDe(c.d.tenantId, c.lote.id))[0]?.avisos).toEqual([])
  })

  it('a prévia prevê o que o worker fez e não grava nada', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, 'Visita', '05/03/2026', { Resultado: 'ok' }),
      linha(a.cnpj, 'Visita', '05/03/2026', { Resultado: 'ok' }),
      linha(a.cnpj, 'Visita', '30/12/2030'),
      linha(a.cnpj, 'Estranha', '05/03/2026', { Resultado: 'ok' }),
      linha(a.cnpj, 'Visita', '31/12/2030', { Situação: 'Realizada', Resultado: 'ok' }),
      linha(cnpjNovo(), 'Visita', '05/03/2026', { Resultado: 'ok' }),
    ])
    const antes = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM atividades`,
    )
    const previa = (await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/previa`))
      .body as PreviaDaImportacao
    expect(previa).toMatchObject({
      totalLinhas: 6,
      aImportar: 2,
      previsao: {
        criada: 2,
        pulada_duplicada: 1,
        pulada_tipo_inexistente: 1,
        pulada_no_futuro: 1,
        pulada_empresa_inexistente: 1,
      },
    })
    expect(
      await noTenant(
        c.d.tenantId,
        (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM atividades`,
      ),
    ).toEqual(antes)
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const feitas = await resultados(c.d.tenantId, c.lote.id)
    for (const [r, n] of Object.entries(previa.previsao ?? {})) {
      if (r === 'ficam_com_voce') continue
      expect(feitas.filter((x) => x === r).length, r).toBe(n)
    }
  })

  it('dois executores no mesmo lote não duplicam atividade nem perdem linha', async () => {
    const c = await cenario(({ a, b }) =>
      Array.from({ length: 14 }, (_, i) =>
        linha(
          i % 2 ? a.cnpj : b.cnpj,
          'Ligação',
          `${String((i % 7) + 1).padStart(2, '0')}/03/2026`,
          { Resultado: 'ok', Título: `L${i}` },
        ),
      ),
    )
    expect(
      (await chamar('post', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/iniciar`)).status,
    ).toBe(200)
    await descartarEventos(c.d.tenantId)
    const novo = () =>
      new ExecutorDaImportacao({
        banco,
        receita: { consultar: () => Promise.reject(new Error('sem Receita')) },
        log,
        esperar: () => Promise.resolve(),
        limites: { linhas: 3, duracaoMs: 90_000 },
      })
    const desfechos = await Promise.all([
      novo().executar(c.d.tenantId, c.lote.id),
      novo().executar(c.d.tenantId, c.lote.id),
    ])
    expect(desfechos.every((x) => x === 'concluida' || x === 'ignorada')).toBe(true)
    const feitas = await resultados(c.d.tenantId, c.lote.id)
    expect(feitas).toHaveLength(14)
    expect(feitas.every((x) => x === 'criada')).toBe(true)
    const [n] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM atividades`,
    )
    expect(n?.n).toBe(14)
  })
})

describe('importação de atividades: valores da coluna Tipo e permissões', () => {
  it('lista cada valor distinto com o tipo que valerá (apontado, automático, pular ou sem correspondência)', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, 'visita', '01/03/2026'),
      linha(a.cnpj, 'VISITA', '02/03/2026'),
      linha(a.cnpj, 'Visita técnica', '03/03/2026'),
      linha(a.cnpj, 'Almoço', '04/03/2026'),
      linha(a.cnpj, 'Ligação', '05/03/2026'),
    ])
    const antes = (
      await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/valores-do-tipo`)
    ).body as ValoresDoTipo
    const porChave = Object.fromEntries(antes.itens.map((i) => [i.chave, i]))
    expect(Object.keys(porChave).sort()).toEqual(['almoco', 'ligacao', 'visita', 'visita tecnica'])
    expect(porChave['visita']).toMatchObject({
      linhas: 2,
      origem: 'automatico',
      tipoId: c.tipos['Visita'],
    })
    expect(porChave['visita tecnica']).toMatchObject({
      origem: 'sem_correspondencia',
      tipoId: null,
    })
    // apontar um e mandar pular outro
    const r = await chamar('patch', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}`, {
      tiposDeAtividade: { 'visita tecnica': c.tipos['Visita'], almoco: null },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const depois = (
      await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/valores-do-tipo`)
    ).body as ValoresDoTipo
    const p = Object.fromEntries(depois.itens.map((i) => [i.chave, i]))
    expect(p['visita tecnica']).toMatchObject({ origem: 'apontado', tipoId: c.tipos['Visita'] })
    expect(p['almoco']).toMatchObject({ origem: 'pular', tipoId: null })
    // um tipo que não existe não é aceito
    const ruim = await chamar('patch', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}`, {
      tiposDeAtividade: { almoco: '0199a000-0000-7000-8000-000000000001' },
    })
    expect(ruim.status).toBe(400)
  })

  it('só administrador e gestor; tipo da planilha de contatos não tem valores; relatório e CSV', async () => {
    const c = await cenario(({ a }) => [
      linha(a.cnpj, 'Visita', '05/03/2026', { Resultado: 'ok', Título: 'Entrou' }),
      linha(a.cnpj, 'Estranha', '05/03/2026', { Resultado: 'ok', Título: 'Não entrou' }),
    ])
    const vendedor = await usuarioSimples(app)
    await vincular(c.d.tenantId, vendedor.id, 'vendedor')
    await ativar(vendedor.id, c.d.tenantId)
    expect(
      (await chamar('get', vendedor.cookie, `/v1/importacao/lotes/${c.lote.id}/valores-do-tipo`))
        .status,
    ).toBe(403)
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    const lista = (await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/linhas`))
      .body as ListaDeLinhas
    expect(lista.itens[0]).toMatchObject({ resultado: 'criada', atividadeTitulo: 'Entrou' })
    const csv = await chamar('get', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/problemas.csv`)
    expect(csv.text).toContain('Não entrou')
    expect(csv.text).not.toContain('Entrou;')
    expect(csv.text).toContain('Pulada: tipo de atividade sem correspondência')
    expect((await chamar('get', c.d.cookie, '/v1/importacao/modelo?tipo=atividades')).status).toBe(
      200,
    )
  })

  it('uma empresa não importa atividades para a carteira de outra', async () => {
    const outra = await novoDono(app)
    const membroDaOutra = await noTenant(outra.tenantId, async (tx) => {
      const [m] = await tx<
        { id: string }[]
      >`SELECT id FROM membros WHERE usuario_id = ${outra.usuarioId}`
      return (m as { id: string }).id
    })
    const daOutra = await criarEmpresa(outra.tenantId, membroDaOutra, 'Empresa da outra')
    const c = await cenario(() => [
      linha(daOutra.cnpj, 'Visita', '05/03/2026', { Resultado: 'ok' }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    expect(await resultados(c.d.tenantId, c.lote.id)).toEqual(['pulada_empresa_inexistente'])
    const [n] = await noTenant(
      outra.tenantId,
      (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM atividades`,
    )
    expect(n?.n).toBe(0)
  })
})

describe('importação de atividades: desfazer', () => {
  it('tira o que o lote criou, recalcula a carteira e mantém a atividade que mudou depois', async () => {
    const c = await cenario(({ a, b }) => [
      linha(a.cnpj, 'Visita', '01/09/2026', {
        Hora: '10:00',
        Situação: 'Realizada',
        Resultado: 'v1',
        Título: 'V1',
      }),
      linha(a.cnpj, 'Ligação', '01/10/2026', {
        Hora: '09:00',
        Situação: 'Realizada',
        Resultado: 'l1',
        Título: 'L1',
      }),
      linha(b.cnpj, 'Visita', '02/09/2026', {
        Hora: '10:00',
        Situação: 'Realizada',
        Resultado: 'v2',
        Título: 'V2',
      }),
      linha(b.cnpj, 'Ligação', '01/01/2031', { Título: 'Futura' }),
    ])
    expect(await executar(c.d, c.lote.id)).toBe('concluida')
    expect((await carteiraDe(c.d.tenantId, c.a.id)).tags).toEqual(['Contactada', 'Visitada'])

    // depois do lote, alguém conclui a atividade pendente da B (alteração: ela fica)
    const [futura] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM atividades WHERE titulo = 'Futura'`,
    )
    const concluida = await chamar(
      'post',
      c.d.cookie,
      `/v1/carteira/atividades/${futura?.id}/concluir`,
      { resultado: 'Fechei' },
    )
    expect(concluida.status, JSON.stringify(concluida.body)).toBe(200)

    const r = await chamar('post', c.d.cookie, `/v1/importacao/lotes/${c.lote.id}/desfazer`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const lote = r.body as LoteDeImportacao
    expect(lote.situacao).toBe('desfeita')
    expect(lote.desfeito).toEqual({ removidas: 3, mantidas: 1 })

    // A voltou ao que era antes: sem visita, sem contato, sem tags
    expect(await carteiraDe(c.d.tenantId, c.a.id)).toEqual({
      visita: null,
      contato: null,
      proxima: null,
      tags: [],
    })
    // B tem só a que foi concluída depois (a Ligação "Futura"): contato, sem visita
    const b = await carteiraDe(c.d.tenantId, c.b.id)
    expect(b.visita).toBeNull()
    expect(b.contato).not.toBeNull()
    expect(b.tags).toEqual(['Contactada'])
    const restantes = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ titulo: string }[]>`SELECT titulo FROM atividades WHERE excluido_em IS NULL`,
    )
    expect(restantes).toEqual([{ titulo: 'Futura' }])
  })
})

// Medida de desempenho (não roda no gate): MEDIR_IMPORTACAO=1 pnpm exec vitest run src/importacao/atividades.test.ts
describe.skipIf(!process.env['MEDIR_IMPORTACAO'])('importação de atividades: 10.000 linhas', () => {
  it('mede o lote inteiro, o recálculo da carteira e o desfazer', async () => {
    const empresas = 1000
    const c = await cenario(({ a }) => [linha(a.cnpj, 'Visita', '01/03/2026', { Resultado: 'ok' })])
    const cnpjs: string[] = []
    for (let i = 0; i < empresas; i++)
      cnpjs.push((await criarEmpresa(c.d.tenantId, c.membroId, `Empresa ${i}`)).cnpj)
    const linhas = Array.from({ length: 10_000 }, (_, i) =>
      linha(
        cnpjs[i % empresas] as string,
        i % 3 === 0 ? 'Visita' : 'Ligação',
        `${String((i % 28) + 1).padStart(2, '0')}/0${(i % 9) + 1}/2026`,
        {
          Hora: `${String(8 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
          Resultado: 'ok',
          Título: `T${i}`,
        },
      ),
    )
    const csv = [CABECALHO.join(';'), ...linhas].join('\n')
    const criado = await request(app.getHttpServer())
      .post('/v1/importacao/lotes?arquivo=dez-mil.csv&tipo=atividades')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', c.d.cookie)
      .set('Content-Type', 'application/octet-stream')
      .send(csv)
    const lote = criado.body as LoteDeImportacao
    await chamar('patch', c.d.cookie, `/v1/importacao/lotes/${lote.id}`, { campos: CAMPOS })
    const t0 = Date.now()
    expect(await executar(c.d, lote.id)).toBe('concluida')
    const total = Date.now() - t0
    const t1 = Date.now()
    await chamar('post', c.d.cookie, `/v1/importacao/lotes/${lote.id}/desfazer`)
    const desfazer = Date.now() - t1
    console.log(
      `MEDIDA 10.000 linhas / ${empresas} empresas: importar ${total} ms; desfazer ${desfazer} ms`,
    )
    expect(total).toBeLessThan(600_000)
  }, 900_000)
})
