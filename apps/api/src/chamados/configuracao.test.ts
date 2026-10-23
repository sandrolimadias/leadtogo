import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type {
  AreaDeAtendimento,
  ConfiguracaoDeTriagem,
  Expediente,
  Feriado,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { criarAppComRotas, configuracaoDeTeste } from '../testes/app-teste.js'
import { limparLimitesAuth } from '../testes/auth-teste.js'
import { auditoriaDe, dono } from '../testes/mundo.js'
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

describe('padrões da empresa nova', () => {
  it('quatro áreas sem metas, triagem desligada, expediente de segunda a sexta e feriados nacionais', async () => {
    const e = await empresaDeChamados(app)
    const areas = (await chamar('get', e.d.cookie, '/chamados/areas')).body as AreaDeAtendimento[]
    expect(areas.map((a) => a.nome)).toEqual([
      'Jurídico',
      'Financeiro',
      'Comercial',
      'Administrativo',
    ])
    expect(areas.every((a) => a.metaRespostaMin === null && a.metaResolucaoMin === null)).toBe(true)
    expect(areas.every((a) => a.membros.length === 0)).toBe(true)

    const triagem = (await chamar('get', e.d.cookie, '/chamados/triagem'))
      .body as ConfiguracaoDeTriagem
    expect(triagem).toEqual({ ativa: false, perfilId: null, perfilNome: null, membros: [] })

    const exp = (await chamar('get', e.d.cookie, '/chamados/expediente')).body as Expediente
    expect(exp.fusoHorario).toBe('America/Sao_Paulo')
    expect(exp.faixas).toEqual(
      [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicio: '08:00', fim: '18:00' })),
    )
    const natal = exp.feriados.find((f) => f.nome === 'Natal')
    expect(natal).toMatchObject({ recorrente: true })
    expect(exp.feriados.map((f) => f.nome)).toEqual(
      expect.arrayContaining(['Tiradentes', 'Sexta-feira Santa', 'Corpus Christi']),
    )
  })
})

describe('áreas', () => {
  it('quem gere cria, altera, define os membros e exclui; tudo vai para a auditoria', async () => {
    const e = await empresaDeChamados(app)
    const atendente = await e.pessoa('Atendente', PERMISSOES.atendente)
    const gestor = await e.pessoa('Gestor da área', PERMISSOES.gestorDeArea)

    const criada = await chamar('post', e.d.cookie, '/chamados/areas', {
      nome: 'Suporte',
      metaRespostaMin: 60,
      metaResolucaoMin: 480,
    })
    expect(criada.status).toBe(201)
    const area = criada.body as AreaDeAtendimento
    expect(area).toMatchObject({
      nome: 'Suporte',
      metaRespostaMin: 60,
      metaResolucaoMin: 480,
      ativa: true,
    })

    const dup = await chamar('post', e.d.cookie, '/chamados/areas', { nome: 'suporte' })
    expect(dup.status).toBe(409)
    expect(erroDe(dup)).toBe('nome_duplicado')

    const alterada = await chamar('patch', e.d.cookie, `/chamados/areas/${area.id}`, {
      metaRespostaMin: null,
      pulaTriagem: true,
    })
    expect(alterada.status).toBe(200)
    expect(alterada.body).toMatchObject({
      metaRespostaMin: null,
      metaResolucaoMin: 480,
      pulaTriagem: true,
    })

    const membros = await chamar('put', e.d.cookie, `/chamados/areas/${area.id}/membros`, {
      membros: [{ membroId: gestor.membroId, gestor: true }, { membroId: atendente.membroId }],
      perfilIds: [atendente.perfilId],
    })
    expect(membros.status).toBe(200)
    const lida = (membros.body as AreaDeAtendimento).membros
    expect(lida).toHaveLength(3)
    expect(lida[0]).toMatchObject({ membroId: gestor.membroId, gestor: true })
    expect(lida.find((m) => m.perfilId === atendente.perfilId)).toMatchObject({
      membroId: null,
      gestor: false,
    })

    const invalido = await chamar('put', e.d.cookie, `/chamados/areas/${area.id}/membros`, {
      membros: [{ membroId: novoId() }],
      perfilIds: [],
    })
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido)).toBe('membro_invalido')

    expect((await chamar('delete', e.d.cookie, `/chamados/areas/${area.id}`)).status).toBe(204)
    expect((await chamar('get', e.d.cookie, '/chamados/areas')).body).toHaveLength(4)

    const aud = await auditoriaDe(e.d.tenantId)
    for (const acao of ['criar', 'alterar', 'definir_membros', 'excluir']) {
      expect(aud).toContainEqual(expect.objectContaining({ entidade: 'chamado_area', acao }))
    }
  })

  it('área que já teve chamado só se inativa; a inativa some para quem não gere', async () => {
    const e = await empresaDeChamados(app)
    const atendente = await e.pessoa('Atendente', PERMISSOES.atendente)
    const area = (await chamar('post', e.d.cookie, '/chamados/areas', { nome: 'Suporte' }))
      .body as AreaDeAtendimento
    await noTenant(
      e.d.tenantId,
      (
        tx,
      ) => tx`INSERT INTO chamados (id, tenant_id, numero, assunto, area_id, solicitante_membro_id)
        VALUES (${novoId()}, ${e.d.tenantId}, 1, 'Já usada', ${area.id}, ${e.adminId})`,
    )
    const excluir = await chamar('delete', e.d.cookie, `/chamados/areas/${area.id}`)
    expect(excluir.status).toBe(409)
    expect(erroDe(excluir)).toBe('area_em_uso')

    const inativa = await chamar('patch', e.d.cookie, `/chamados/areas/${area.id}`, {
      ativa: false,
    })
    expect((inativa.body as AreaDeAtendimento).ativa).toBe(false)
    const doAtendente = (
      await chamar('get', atendente.cookie, '/chamados/areas?incluirInativas=true')
    ).body as AreaDeAtendimento[]
    expect(doAtendente.map((a) => a.nome)).not.toContain('Suporte')
    const doAdmin = (await chamar('get', e.d.cookie, '/chamados/areas?incluirInativas=true'))
      .body as AreaDeAtendimento[]
    expect(doAdmin.map((a) => a.nome)).toContain('Suporte')
    expect(doAdmin.find((a) => a.nome === 'Suporte')?.chamadosAbertos).toBe(1)
  })

  it('só gerir_areas escreve; atendente lê as ativas sem a lista de membros; sem permissão nenhuma, 403', async () => {
    const e = await empresaDeChamados(app)
    const atendente = await e.pessoa('Atendente', PERMISSOES.atendente)
    const semNada = await e.pessoa('Sem chamados', {})
    const area = await e.areaPadrao('juridico')
    await chamar('put', e.d.cookie, `/chamados/areas/${area}/membros`, {
      membros: [{ membroId: atendente.membroId }],
      perfilIds: [],
    })

    const lidas = (await chamar('get', atendente.cookie, '/chamados/areas'))
      .body as AreaDeAtendimento[]
    expect(lidas).toHaveLength(4)
    expect(lidas.every((a) => a.membros.length === 0)).toBe(true)

    const negado = await chamar('post', atendente.cookie, '/chamados/areas', { nome: 'Nova' })
    expect(negado.status).toBe(403)
    expect(erroDe(negado)).toBe('acesso_negado')
    expect(
      (await chamar('patch', atendente.cookie, `/chamados/areas/${area}`, { ativa: false })).status,
    ).toBe(403)
    expect(
      (
        await chamar('put', atendente.cookie, `/chamados/areas/${area}/membros`, {
          membros: [],
          perfilIds: [],
        })
      ).status,
    ).toBe(403)
    expect((await chamar('delete', atendente.cookie, `/chamados/areas/${area}`)).status).toBe(403)

    for (const rota of ['/chamados/areas', '/chamados/triagem', '/chamados/expediente']) {
      const r = await chamar('get', semNada.cookie, rota)
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('acesso_negado')
    }
  })

  it('as opções de configuração (pessoas e perfis) são só de quem gere as áreas e só desta empresa', async () => {
    const e = await empresaDeChamados(app)
    const outra = await empresaDeChamados(app)
    const atendente = await e.pessoa('Atendente', PERMISSOES.atendente)
    const r = await chamar('get', e.d.cookie, '/chamados/opcoes-de-configuracao')
    expect(r.status).toBe(200)
    const o = r.body as { membros: { id: string; nome: string }[]; perfis: { id: string }[] }
    expect(o.membros.map((m) => m.id)).toContain(atendente.membroId)
    expect(o.perfis.map((p) => p.id)).toContain(atendente.perfilId)
    const deFora = (await chamar('get', outra.d.cookie, '/chamados/opcoes-de-configuracao'))
      .body as typeof o
    expect(deFora.membros.map((m) => m.id)).not.toContain(atendente.membroId)
    expect(deFora.perfis.map((p) => p.id)).not.toContain(atendente.perfilId)
    const negado = await chamar('get', atendente.cookie, '/chamados/opcoes-de-configuracao')
    expect(negado.status).toBe(403)
    expect(erroDe(negado)).toBe('acesso_negado')
  })

  it('outra empresa nunca vê nem altera as áreas desta', async () => {
    const a = await empresaDeChamados(app)
    const b = await empresaDeChamados(app)
    const areaDaA = await a.areaPadrao('juridico')
    const r = await chamar('patch', b.d.cookie, `/chamados/areas/${areaDaA}`, { nome: 'Invadida' })
    expect(r.status).toBe(404)
    expect(erroDe(r)).toBe('area_nao_encontrada')
    const daB = (await chamar('get', b.d.cookie, '/chamados/areas')).body as AreaDeAtendimento[]
    expect(daB.map((x) => x.id)).not.toContain(areaDaA)
  })
})

describe('triagem', () => {
  it('desligada por padrão; ligar exige alguém; pessoas e perfil são conferidos; a auditoria registra', async () => {
    const e = await empresaDeChamados(app)
    const triador = await e.pessoa('Triador', PERMISSOES.triador)

    const semAlguem = await chamar('put', e.d.cookie, '/chamados/triagem', {
      ativa: true,
      perfilId: null,
      membroIds: [],
    })
    expect(semAlguem.status).toBe(409)
    expect(erroDe(semAlguem)).toBe('triagem_sem_triador')

    const invalido = await chamar('put', e.d.cookie, '/chamados/triagem', {
      ativa: true,
      perfilId: null,
      membroIds: [novoId()],
    })
    expect(erroDe(invalido)).toBe('membro_invalido')
    const perfilInvalido = await chamar('put', e.d.cookie, '/chamados/triagem', {
      ativa: true,
      perfilId: novoId(),
      membroIds: [],
    })
    expect(erroDe(perfilInvalido)).toBe('perfil_invalido')

    const ligada = await chamar('put', e.d.cookie, '/chamados/triagem', {
      ativa: true,
      perfilId: triador.perfilId,
      membroIds: [triador.membroId],
    })
    expect(ligada.status).toBe(200)
    expect(ligada.body).toMatchObject({
      ativa: true,
      perfilId: triador.perfilId,
      membros: [{ membroId: triador.membroId, nome: 'Triador' }],
    })

    // desligar mantém as pessoas e o perfil guardados
    const desligada = (
      await chamar('put', e.d.cookie, '/chamados/triagem', {
        ativa: false,
        perfilId: triador.perfilId,
        membroIds: [triador.membroId],
      })
    ).body as ConfiguracaoDeTriagem
    expect(desligada.ativa).toBe(false)
    expect(desligada.membros).toHaveLength(1)

    expect(
      (
        await chamar('put', triador.cookie, '/chamados/triagem', {
          ativa: false,
          perfilId: null,
          membroIds: [],
        })
      ).status,
    ).toBe(403)
    expect(await auditoriaDe(e.d.tenantId)).toContainEqual(
      expect.objectContaining({ entidade: 'chamado_triagem', acao: 'alterar' }),
    )
  })
})

describe('expediente e feriados', () => {
  it('troca as faixas (várias por dia), recusa sobreposição e aceita expediente vazio', async () => {
    const e = await empresaDeChamados(app)
    const faixas = [
      { diaSemana: 1, inicio: '08:00', fim: '12:00' },
      { diaSemana: 1, inicio: '13:00', fim: '17:00' },
      { diaSemana: 6, inicio: '08:00', fim: '12:00' },
    ]
    const ok = await chamar('put', e.d.cookie, '/chamados/expediente', { faixas })
    expect(ok.status).toBe(200)
    expect((ok.body as Expediente).faixas).toEqual(faixas)

    const sobre = await chamar('put', e.d.cookie, '/chamados/expediente', {
      faixas: [
        { diaSemana: 2, inicio: '08:00', fim: '12:00' },
        { diaSemana: 2, inicio: '11:00', fim: '13:00' },
      ],
    })
    expect(sobre.status).toBe(400)
    // a recusa não mexeu no que estava salvo
    expect(
      ((await chamar('get', e.d.cookie, '/chamados/expediente')).body as Expediente).faixas,
    ).toEqual(faixas)

    const vazio = await chamar('put', e.d.cookie, '/chamados/expediente', { faixas: [] })
    expect((vazio.body as Expediente).faixas).toEqual([])
    const atendente = await e.pessoa('Atendente', PERMISSOES.atendente)
    expect((await chamar('put', atendente.cookie, '/chamados/expediente', { faixas })).status).toBe(
      403,
    )
  })

  it('feriados: cadastra, recusa a data repetida, gera os móveis do ano sem repetir e exclui', async () => {
    const e = await empresaDeChamados(app)
    const criado = await chamar('post', e.d.cookie, '/chamados/feriados', {
      data: '2026-11-27',
      nome: 'Aniversário da cidade',
      recorrente: true,
    })
    expect(criado.status).toBe(201)
    const feriado = criado.body as Feriado
    expect(feriado).toMatchObject({ data: '2026-11-27', recorrente: true })

    const repetido = await chamar('post', e.d.cookie, '/chamados/feriados', {
      data: '2026-11-27',
      nome: 'Outro',
    })
    expect(repetido.status).toBe(409)
    expect(erroDe(repetido)).toBe('feriado_repetido')

    const g1 = await chamar('post', e.d.cookie, '/chamados/feriados/gerar', { ano: 2030 })
    expect(g1.body).toEqual({ criados: 4 })
    const g2 = await chamar('post', e.d.cookie, '/chamados/feriados/gerar', { ano: 2030 })
    expect(g2.body).toEqual({ criados: 0 })
    const datas = (
      (await chamar('get', e.d.cookie, '/chamados/expediente')).body as Expediente
    ).feriados.map((f) => f.data)
    expect(datas).toContain('2030-03-04') // Segunda-feira de Carnaval 2030
    expect(datas).toContain('2030-04-19') // Sexta-feira Santa 2030

    expect((await chamar('delete', e.d.cookie, `/chamados/feriados/${feriado.id}`)).status).toBe(
      204,
    )
    expect((await chamar('delete', e.d.cookie, `/chamados/feriados/${feriado.id}`)).status).toBe(
      404,
    )
    // a data liberada pode ser cadastrada de novo
    expect(
      (
        await chamar('post', e.d.cookie, '/chamados/feriados', {
          data: '2026-11-27',
          nome: 'De novo',
        })
      ).status,
    ).toBe(201)
    const semPermissao = await e.pessoa('Atendente', PERMISSOES.atendente)
    expect(
      (
        await chamar('post', semPermissao.cookie, '/chamados/feriados', {
          data: '2026-12-31',
          nome: 'X',
        })
      ).status,
    ).toBe(403)
  })
})
