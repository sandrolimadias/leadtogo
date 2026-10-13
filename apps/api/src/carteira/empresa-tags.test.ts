import type { Server } from 'node:http'

import type { EmpresaCarteira, Tag, TagGrupo } from '@leadtogo/shared'
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

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete'
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
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const empresaDe = (r: request.Response) => r.body as EmpresaCarteira

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

async function cenario() {
  const d = await novoDono(app)
  const vendedor = async (nome: string) => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, 'vendedor', nome)
    await ativar(u.id, d.tenantId)
    return { ...u, membroId }
  }
  const grupos = (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
  const tag = (nome: string) => grupos.flatMap((g) => g.tags).find((t) => t.nome === nome) as Tag
  const status = grupos.find((g) => g.nome === 'Status') as TagGrupo
  // Um grupo manual de seleção múltipla (Interesse) com duas tags, e um de seleção única opcional
  const novoGrupo = async (nome: string, selecao: 'unica' | 'multipla', obrigatorio = false) =>
    (await chamar('post', d.cookie, '/v1/configuracoes/tag-grupos', { nome, selecao, obrigatorio }))
      .body as TagGrupo
  const novaTag = async (grupo: TagGrupo, nome: string) =>
    (await chamar('post', d.cookie, '/v1/configuracoes/tags', { tagGrupoId: grupo.id, nome }))
      .body as Tag
  const interesse = await novoGrupo('Interesse', 'multipla')
  const monitoramento = await novaTag(interesse, 'Monitoramento')
  const retrofit = await novaTag(interesse, 'Retrofit')
  const porte = await novoGrupo('Porte', 'unica')
  const pequeno = await novaTag(porte, 'Pequeno')
  const grande = await novaTag(porte, 'Grande')
  return {
    d,
    ana: await vendedor('Ana'),
    bia: await vendedor('Bia'),
    status,
    tag,
    interesse,
    monitoramento,
    retrofit,
    porte,
    pequeno,
    grande,
  }
}

async function criar(cookie: string, razaoSocial: string, extra: Record<string, unknown> = {}) {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    razaoSocial,
    ...extra,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return empresaDe(r)
}
const definir = (cookie: string, id: string, tagIds: string[]) =>
  chamar('put', cookie, `/v1/carteira/empresas/${id}/tags`, { tagIds })
const historico = (tenantId: string, empresaId: string) =>
  noTenant(
    tenantId,
    (tx) => tx<{ nome: string; acao: string; por: string | null }[]>`
    SELECT t.nome, h.acao, h.por FROM empresa_tags_historico h JOIN tags t ON t.id = h.tag_id
    WHERE h.empresa_id = ${empresaId} ORDER BY h.em, h.acao`,
  )

describe('PUT /v1/carteira/empresas/:id/tags', () => {
  it('troca o Status (Lead → Cliente), junta tags de seleção múltipla e guarda o histórico', async () => {
    const { d, tag, monitoramento, retrofit } = await cenario()
    const e = await criar(d.cookie, 'Loja do Zé')
    expect(e.tags.map((t) => t.nome)).toEqual(['Lead'])

    const r = await definir(d.cookie, e.id, [tag('Cliente').id, monitoramento.id, retrofit.id])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(
      empresaDe(r)
        .tags.map((t) => t.nome)
        .sort(),
    ).toEqual(['Cliente', 'Monitoramento', 'Retrofit'])

    const h = await historico(d.tenantId, e.id)
    expect(
      h
        .filter((x) => x.nome === 'Lead')
        .map((x) => x.acao)
        .sort(),
    ).toEqual(['adicionada', 'removida'])
    expect(h.filter((x) => x.nome === 'Cliente').map((x) => x.acao)).toEqual(['adicionada'])
    const reg = (await auditoriaDe(d.tenantId)).filter((a) => a.acao === 'alterar_tags')
    expect(reg).toHaveLength(1)
    const alteracoes = reg[0]?.alteracoes as { adicionadas: string[]; removidas: string[] }
    expect([...alteracoes.adicionadas].sort()).toEqual(['Cliente', 'Monitoramento', 'Retrofit'])
    expect(alteracoes.removidas).toEqual(['Lead'])
  })

  it('repetir o mesmo conjunto não muda nada nem grava histórico', async () => {
    const { d, tag } = await cenario()
    const e = await criar(d.cookie, 'Loja do Zé')
    expect((await definir(d.cookie, e.id, [tag('Lead').id])).status).toBe(200)
    expect(await historico(d.tenantId, e.id)).toHaveLength(1) // só o "adicionada" do cadastro
    expect((await auditoriaDe(d.tenantId)).filter((a) => a.acao === 'alterar_tags')).toHaveLength(0)
  })

  it('grupo de seleção única aceita uma tag só; grupo obrigatório (Status) exige uma', async () => {
    const { d, tag, pequeno, grande } = await cenario()
    const e = await criar(d.cookie, 'Loja do Zé')
    const duas = await definir(d.cookie, e.id, [tag('Lead').id, pequeno.id, grande.id])
    expect(duas.status).toBe(400)
    expect(erroDe(duas)).toBe('grupo_selecao_unica')
    const duasStatus = await definir(d.cookie, e.id, [tag('Lead').id, tag('Cliente').id])
    expect(erroDe(duasStatus)).toBe('grupo_selecao_unica')
    const semStatus = await definir(d.cookie, e.id, [pequeno.id])
    expect(semStatus.status).toBe(400)
    expect(erroDe(semStatus)).toBe('grupo_obrigatorio')
    const vazio = await definir(d.cookie, e.id, [])
    expect(erroDe(vazio)).toBe('grupo_obrigatorio')
    // nada mudou
    expect(
      empresaDe(await chamar('get', d.cookie, `/v1/carteira/empresas/${e.id}`)).tags.map(
        (t) => t.nome,
      ),
    ).toEqual(['Lead'])
  })

  it('tag de grupo automático (Visitação) não se aplica à mão, mas a que a empresa já tem fica', async () => {
    const { d, tag } = await cenario()
    const e = await criar(d.cookie, 'Loja do Zé')
    const r = await definir(d.cookie, e.id, [tag('Lead').id, tag('Visitada').id])
    expect(r.status).toBe(400)
    expect(erroDe(r)).toBe('tag_automatica')

    // o sistema aplicou Visitada; o usuário troca o Status e a Visitada continua
    await noTenant(
      d.tenantId,
      (tx) => tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id, automatica)
        VALUES (${d.tenantId}, ${e.id}, ${tag('Visitada').id}, true)`,
    )
    const ok = await definir(d.cookie, e.id, [tag('Prospect').id])
    expect(ok.status).toBe(200)
    expect(
      empresaDe(ok)
        .tags.map((t) => t.nome)
        .sort(),
    ).toEqual(['Prospect', 'Visitada'])
  })

  it('tag inativa não se aplica de novo, mas quem já a tem não é obrigado a perdê-la', async () => {
    const { d, tag, monitoramento, retrofit } = await cenario()
    const e = await criar(d.cookie, 'Loja do Zé')
    expect((await definir(d.cookie, e.id, [tag('Lead').id, monitoramento.id])).status).toBe(200)
    for (const t of [monitoramento, retrofit]) {
      await chamar('patch', d.cookie, `/v1/configuracoes/tags/${t.id}`, { ativo: false })
    }
    const nova = await definir(d.cookie, e.id, [tag('Lead').id, monitoramento.id, retrofit.id])
    expect(nova.status).toBe(400)
    expect(erroDe(nova)).toBe('tag_inativa')
    const mantem = await definir(d.cookie, e.id, [tag('Lead').id, monitoramento.id])
    expect(mantem.status).toBe(200)
    expect(
      empresaDe(mantem)
        .tags.map((t) => t.nome)
        .sort(),
    ).toEqual(['Lead', 'Monitoramento'])
  })

  it('tag inexistente, de outra empresa ou excluída é 400 tag_invalida; corpo errado é 400', async () => {
    const { d, tag } = await cenario()
    const outro = await novoDono(app)
    const deFora = (
      (await chamar('get', outro.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
    )[0]?.tags[0] as Tag
    const e = await criar(d.cookie, 'Loja do Zé')
    for (const id of [deFora.id, '0199a000-0000-7000-8000-000000000001']) {
      const r = await definir(d.cookie, e.id, [tag('Lead').id, id])
      expect(r.status).toBe(400)
      expect(erroDe(r)).toBe('tag_invalida')
    }
    expect((await definir(d.cookie, e.id, ['abc'])).status).toBe(400)
    expect((await chamar('put', d.cookie, `/v1/carteira/empresas/${e.id}/tags`, {})).status).toBe(
      400,
    )
  })

  it('o vendedor define as tags da própria empresa; a de outro é 404 e, se a vê, 403', async () => {
    const { d, ana, bia, tag } = await cenario()
    const daAna = await criar(ana.cookie, 'Da Ana')
    expect((await definir(ana.cookie, daAna.id, [tag('Prospect').id])).status).toBe(200)
    expect((await definir(bia.cookie, daAna.id, [tag('Cliente').id])).status).toBe(404)
    expect((await definir(undefined as unknown as string, daAna.id, [])).status).toBe(401)
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE tenant_configuracoes SET vendedor_ve_todas_empresas = true`,
    )
    const negado = await definir(bia.cookie, daAna.id, [tag('Cliente').id])
    expect(negado.status).toBe(403)
    expect(erroDe(negado)).toBe('acesso_negado')
  })
})

describe('excluir só o que nunca foi usado: tags, grupos e verticais', () => {
  it('tag aplicada a uma empresa não se exclui (só inativa), mesmo depois de removida: o histórico guarda', async () => {
    const { d, monitoramento, retrofit, tag } = await cenario()
    const e = await criar(d.cookie, 'Loja do Zé')
    await definir(d.cookie, e.id, [tag('Lead').id, monitoramento.id])

    const emUso = await chamar('delete', d.cookie, `/v1/configuracoes/tags/${monitoramento.id}`)
    expect(emUso.status).toBe(409)
    expect(erroDe(emUso)).toBe('tag_em_uso')

    // tirar a tag da empresa não apaga o histórico: continua só inativável
    await definir(d.cookie, e.id, [tag('Lead').id])
    const depois = await chamar('delete', d.cookie, `/v1/configuracoes/tags/${monitoramento.id}`)
    expect(erroDe(depois)).toBe('tag_em_uso')
    const inativar = await chamar('patch', d.cookie, `/v1/configuracoes/tags/${monitoramento.id}`, {
      ativo: false,
    })
    expect(inativar.status).toBe(200)

    // a que nunca foi usada continua excluível
    expect((await chamar('delete', d.cookie, `/v1/configuracoes/tags/${retrofit.id}`)).status).toBe(
      204,
    )
  })

  it('a empresa excluída continua contando como uso', async () => {
    const { d, monitoramento, tag } = await cenario()
    const e = await criar(d.cookie, 'Loja do Zé')
    await definir(d.cookie, e.id, [tag('Lead').id, monitoramento.id])
    expect((await chamar('delete', d.cookie, `/v1/carteira/empresas/${e.id}`)).status).toBe(204)
    const r = await chamar('delete', d.cookie, `/v1/configuracoes/tags/${monitoramento.id}`)
    expect(erroDe(r)).toBe('tag_em_uso')
  })

  it('grupo com tag usada não se exclui; grupo sem uso, sim', async () => {
    const { d, interesse, monitoramento, porte, tag } = await cenario()
    const e = await criar(d.cookie, 'Loja do Zé')
    await definir(d.cookie, e.id, [tag('Lead').id, monitoramento.id])
    const r = await chamar('delete', d.cookie, `/v1/configuracoes/tag-grupos/${interesse.id}`)
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('grupo_em_uso')
    expect(
      (await chamar('delete', d.cookie, `/v1/configuracoes/tag-grupos/${porte.id}`)).status,
    ).toBe(204)
  })

  it('vertical usada por uma empresa não se exclui (só inativa); a nunca usada, sim', async () => {
    const { d } = await cenario()
    const nova = async (nome: string) =>
      (await chamar('post', d.cookie, '/v1/configuracoes/verticais', { nome })).body as {
        id: string
      }
    const usada = await nova('Metalmecânica')
    const livre = await nova('Alimentos')
    await criar(d.cookie, 'Loja do Zé', { verticalId: usada.id })

    const r = await chamar('delete', d.cookie, `/v1/configuracoes/verticais/${usada.id}`)
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('vertical_em_uso')
    expect(
      (await chamar('patch', d.cookie, `/v1/configuracoes/verticais/${usada.id}`, { ativo: false }))
        .status,
    ).toBe(200)
    expect(
      (await chamar('delete', d.cookie, `/v1/configuracoes/verticais/${livre.id}`)).status,
    ).toBe(204)
  })
})
