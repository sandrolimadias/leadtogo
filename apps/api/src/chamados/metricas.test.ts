import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { Chamado, MetricasDeChamados } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { criarAppComRotas, configuracaoDeTeste } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { dono } from '../testes/mundo.js'
import { chamarEm, empresaDeChamados, noTenant, PERMISSOES } from './teste-chamados.js'

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

// Segunda-feira 19/10/2026, 08:00 em São Paulo (UTC-3) = 11:00Z; expediente padrão de segunda a sexta, 8h às 18h
const z = (dia: string, hora: string) => `2026-10-${dia}T${hora}:00Z`

async function cenario() {
  const e = await empresaDeChamados(app)
  const juridico = await e.areaPadrao('juridico')
  const financeiro = await e.areaPadrao('financeiro')
  const solicitante = await e.pessoa('Solicitante', PERMISSOES.solicitante)
  const ana = await e.pessoa('Ana', { ...PERMISSOES.atendente, 'chamados.ver_metricas': 'propria' })
  const beto = await e.pessoa('Beto', {
    ...PERMISSOES.atendente,
    'chamados.ver_metricas': 'propria',
  })
  const gerente = await e.pessoa(
    'Gerente',
    {
      ...PERMISSOES.atendente,
      'chamados.ver_metricas': 'equipe',
      'chamados.exportar': null,
    },
    { gestorId: ana.membroId },
  )
  await chamar('patch', e.d.cookie, `/chamados/areas/${juridico}`, {
    metaRespostaMin: 60,
    metaResolucaoMin: 480,
  })
  const abrir = async (areaId: string, assunto: string) =>
    ((await chamar('post', solicitante.cookie, '/chamados', { assunto, areaId })).body as Chamado)
      .id

  /** Reescreve o histórico do chamado com datas fixas (a linha do tempo é a base das métricas). */
  const moldar = async (
    id: string,
    h: { abertoEm: string; respostaEm?: string; resolvidoEm?: string; responsavel?: string },
  ) =>
    noTenant(e.d.tenantId, async (tx) => {
      const status = h.resolvidoEm ? 'resolvido' : h.respostaEm ? 'em_atendimento' : 'pendente'
      await tx`DELETE FROM chamado_eventos WHERE chamado_id = ${id}`
      await tx`UPDATE chamados SET criado_em = ${h.abertoEm}, primeira_resposta_em = ${h.respostaEm ?? null},
        status = ${status}::status_chamado, resolvido_em = ${h.resolvidoEm ?? null}, responsavel_id = ${h.responsavel ?? null}
        WHERE id = ${id}`
      const evento = (em: string, para: string) =>
        tx`INSERT INTO chamado_eventos (id, tenant_id, chamado_id, tipo, ator_tipo, status_para, em)
          VALUES (${novoId()}, ${e.d.tenantId}, ${id}, 'status_alterado', 'sistema', ${para}::status_chamado, ${em})`
      await evento(h.abertoEm, 'pendente')
      if (h.respostaEm) await evento(h.respostaEm, 'em_atendimento')
      if (h.resolvidoEm) await evento(h.resolvidoEm, 'resolvido')
    })
  return { e, juridico, financeiro, solicitante, ana, beto, gerente, abrir, moldar }
}

describe('métricas', () => {
  it('tempos em horas úteis, abertos, % dentro do prazo e quebra por área e por responsável', async () => {
    const c = await cenario()
    // A: respondido em 30 min e resolvido em 3 h (dentro das metas de 60 min e 8 h), da Ana
    const a = await c.abrir(c.juridico, 'A no prazo')
    await c.moldar(a, {
      abertoEm: z('19', '11:00'),
      respostaEm: z('19', '11:30'),
      resolvidoEm: z('19', '14:00'),
      responsavel: c.ana.membroId,
    })
    // B: respondido em 2 h (fora da meta de 60 min); resolvido em 4 h (dentro de 8 h), do Beto
    const b = await c.abrir(c.juridico, 'B atrasado')
    await c.moldar(b, {
      abertoEm: z('20', '11:00'),
      respostaEm: z('20', '13:00'),
      resolvidoEm: z('20', '15:00'),
      responsavel: c.beto.membroId,
    })
    // C: sem resposta desde o dia 21 (estourou a meta há muito), aberto, da Ana
    const cc = await c.abrir(c.juridico, 'C sem resposta')
    await c.moldar(cc, { abertoEm: z('21', '11:00'), responsavel: c.ana.membroId })
    // D: no Financeiro (sem meta), respondido em 90 min
    const d = await c.abrir(c.financeiro, 'D sem meta')
    await c.moldar(d, {
      abertoEm: z('21', '11:00'),
      respostaEm: z('21', '12:30'),
      responsavel: c.beto.membroId,
    })

    const r = await chamar('get', c.e.d.cookie, '/chamados/metricas?de=2026-10-19&ate=2026-10-23')
    expect(r.status).toBe(200)
    const m = r.body as MetricasDeChamados
    expect(m).toMatchObject({
      de: '2026-10-19',
      ate: '2026-10-23',
      alcance: 'todas',
      truncado: false,
    })
    expect(m.geral).toMatchObject({
      total: 4,
      abertos: 2,
      resolvidos: 2,
      // respostas: A 30, B 120, D 90 => média 80
      tempoPrimeiraRespostaMin: 80,
      // resoluções: A 180, B 240 => média 210
      tempoResolucaoMin: 210,
      // meta de resposta (só Jurídico): A sim, B não, C estourou => 1 de 3 = 33,3%
      respostaNoPrazoPct: 33.3,
      // meta de resolução: A e B dentro; C está aberto há dias úteis (os 480 min estouraram) => 2 de 3
      resolucaoNoPrazoPct: 66.7,
    })
    expect(m.geral.diasEmAberto).toBeGreaterThan(1)
    const juridico = m.porArea.find((x) => x.area.nome === 'Jurídico')
    expect(juridico).toMatchObject({
      total: 3,
      abertos: 1,
      resolvidos: 2,
      respostaNoPrazoPct: 33.3,
    })
    expect(m.porArea.find((x) => x.area.nome === 'Financeiro')).toMatchObject({
      total: 1,
      respostaNoPrazoPct: null,
    })
    expect(m.porResponsavel.find((x) => x.responsavel?.nome === 'Ana')).toMatchObject({
      total: 2,
      abertos: 1,
    })
    expect(m.porResponsavel.find((x) => x.responsavel?.nome === 'Beto')).toMatchObject({ total: 2 })
    expect(m.porStatus.find((s) => s.status === 'pendente')?.total).toBe(1)
    expect(m.porStatus.find((s) => s.status === 'resolvido')?.total).toBe(2)
  })

  it('período e filtros: só os abertos dentro das datas, da área ou do responsável pedido', async () => {
    const c = await cenario()
    const a = await c.abrir(c.juridico, 'Antigo')
    await c.moldar(a, {
      abertoEm: z('05', '11:00'),
      respostaEm: z('05', '11:10'),
      responsavel: c.ana.membroId,
    })
    const b = await c.abrir(c.financeiro, 'Recente')
    await c.moldar(b, {
      abertoEm: z('20', '11:00'),
      respostaEm: z('20', '11:20'),
      responsavel: c.beto.membroId,
    })
    const total = async (qs: string) =>
      ((await chamar('get', c.e.d.cookie, `/chamados/metricas?${qs}`)).body as MetricasDeChamados)
        .geral.total
    expect(await total('de=2026-10-01&ate=2026-10-10')).toBe(1)
    expect(await total('de=2026-10-15&ate=2026-10-23')).toBe(1)
    expect(await total('de=2026-10-01&ate=2026-10-23')).toBe(2)
    expect(await total(`de=2026-10-01&ate=2026-10-23&areaId=${c.financeiro}`)).toBe(1)
    expect(await total(`de=2026-10-01&ate=2026-10-23&responsavelId=${c.ana.membroId}`)).toBe(1)
    const invertido = await chamar(
      'get',
      c.e.d.cookie,
      '/chamados/metricas?de=2026-10-23&ate=2026-10-01',
    )
    expect(invertido.status).toBe(400)
    expect(erroDe(invertido)).toBe('periodo_invalido')
  })

  it('o alcance de ver_metricas vale sobre o responsável: própria só os dela, equipe os da equipe, sem permissão 403', async () => {
    const c = await cenario()
    for (const [assunto, resp] of [
      ['1', c.ana],
      ['2', c.ana],
      ['3', c.beto],
    ] as const) {
      await c.moldar(await c.abrir(c.juridico, `Chamado ${assunto}`), {
        abertoEm: z('20', '11:00'),
        respostaEm: z('20', '11:10'),
        responsavel: resp.membroId,
      })
    }
    const total = async (cookie: string) =>
      (await chamar('get', cookie, '/chamados/metricas?de=2026-10-15&ate=2026-10-23'))
        .body as MetricasDeChamados
    expect((await total(c.ana.cookie)).geral.total).toBe(2)
    expect((await total(c.ana.cookie)).alcance).toBe('propria')
    expect((await total(c.gerente.cookie)).geral.total).toBe(0)
    expect((await total(c.beto.cookie)).geral.total).toBe(1)
    // o gerente é subordinado da Ana (e não o contrário): a equipe dele é só ele, e ele não tem chamado
    expect((await total(c.gerente.cookie)).alcance).toBe('equipe')
    expect((await total(c.e.d.cookie)).geral.total).toBe(3)
    const semPermissao = await chamar('get', c.solicitante.cookie, '/chamados/metricas')
    expect(semPermissao.status).toBe(403)
    expect(erroDe(semPermissao)).toBe('acesso_negado')
    const outra = await empresaDeChamados(app)
    expect(
      (
        (await chamar('get', outra.d.cookie, '/chamados/metricas?de=2026-10-15&ate=2026-10-23'))
          .body as MetricasDeChamados
      ).geral.total,
    ).toBe(0)
  })
})

describe('exportação em CSV', () => {
  it('exige chamados.exportar, traz só o que a pessoa vê e protege as células contra fórmulas', async () => {
    const c = await cenario()
    await c.abrir(c.juridico, '=HYPERLINK("http://mal.com")')
    await c.abrir(c.financeiro, 'Boleto; com ponto e vírgula')
    const semPermissao = await chamar('get', c.ana.cookie, '/chamados/exportar.csv')
    expect(semPermissao.status).toBe(403)

    const r = await chamar('get', c.e.d.cookie, '/chamados/exportar.csv')
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toContain('text/csv')
    expect(r.headers['content-disposition']).toContain('chamados.csv')
    const texto = r.text ?? Buffer.from(r.body as Buffer).toString('utf8')
    expect(texto.startsWith('﻿')).toBe(true)
    const linhas = texto.replace('﻿', '').trim().split('\r\n')
    expect(linhas[0]).toContain('Número;Assunto;Área;Estado')
    expect(linhas).toHaveLength(3)
    expect(texto).toContain("'=HYPERLINK")
    expect(texto).toContain('"Boleto; com ponto e vírgula"')
    expect(texto).toContain('CH-0001')

    // o gerente exporta, mas só o que vê (nenhum: não é da área nem solicitante)
    const gerente = await chamar('get', c.gerente.cookie, '/chamados/exportar.csv')
    expect(gerente.status).toBe(200)
    expect(gerente.text.trim().split('\r\n')).toHaveLength(1)
    // filtro da lista vale na exportação
    const filtrado = await chamar(
      'get',
      c.e.d.cookie,
      `/chamados/exportar.csv?areaId=${c.financeiro}`,
    )
    expect(filtrado.text.trim().split('\r\n')).toHaveLength(2)
  })
})
