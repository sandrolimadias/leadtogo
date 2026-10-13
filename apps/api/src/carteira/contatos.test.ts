import type { Server } from 'node:http'

import type { Contato, EmpresaCarteira, PapelDecisao } from '@leadtogo/shared'
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
    .set('X-Forwarded-For', `10.2.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const CONTATOS = '/v1/carteira/contatos'
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const contatoDe = (r: request.Response) => r.body as Contato

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

/** Empresa com o administrador, um gestor e dois vendedores. */
async function cenario() {
  const d = await novoDono(app)
  const pessoa = async (papel: 'gestor' | 'vendedor', nome: string) => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, papel, nome)
    await ativar(u.id, d.tenantId)
    return { ...u, membroId }
  }
  return {
    d,
    gestor: await pessoa('gestor', 'Gestor'),
    ana: await pessoa('vendedor', 'Ana'),
    bia: await pessoa('vendedor', 'Bia'),
  }
}
const empresa = async (cookie: string, nome: string, extra: Record<string, unknown> = {}) => {
  const r = await chamar('post', cookie, '/v1/carteira/empresas', {
    tipoDocumento: 'nenhum',
    razaoSocial: nome,
    ...extra,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as EmpresaCarteira
}
const criar = async (cookie: string, corpo: Record<string, unknown>) => {
  const r = await chamar('post', cookie, CONTATOS, corpo)
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return contatoDe(r)
}

describe('POST /v1/carteira/contatos', () => {
  it('sem sessão 401; administrador cria sem empresa, com telefones, e-mails, papel e aniversário', async () => {
    const { d } = await cenario()
    expect((await chamar('post', undefined, CONTATOS, { nome: 'Ana' })).status).toBe(401)
    const papeis = (await chamar('get', d.cookie, '/v1/configuracoes/papeis-decisao'))
      .body as PapelDecisao[]
    const decisor = papeis.find((p) => p.nome === 'Decisor') as PapelDecisao

    const c = await criar(d.cookie, {
      nome: '  Rogério Bindaco ',
      papelDecisaoId: decisor.id,
      aniversario: { dia: 29, mes: 2 },
      linkedinUrl: 'https://www.linkedin.com/in/rogerio',
      observacoes: 'Prefere ligação de manhã.',
      telefones: [
        { numero: '(27) 3243-1907' },
        { numero: '27 99847-2210', tipo: 'whatsapp', principal: true },
      ],
      emails: [
        { email: 'Rogerio@Exemplo.com.br' },
        { email: 'rogerio@exemplo.com.br' },
        { email: 'r@pessoal.com', tipo: 'pessoal' },
      ],
    })
    expect(c).toMatchObject({
      nome: 'Rogério Bindaco',
      papelDecisao: { id: decisor.id, nome: 'Decisor' },
      aniversario: { dia: 29, mes: 2 },
      linkedinUrl: 'https://www.linkedin.com/in/rogerio',
      observacoes: 'Prefere ligação de manhã.',
      aceitaWhatsapp: true,
      aceitaEmail: true,
      consentimentoEm: null,
      vinculos: [],
      permissoes: { editar: true, excluir: true },
    })
    expect(c.telefones.map((t) => [t.e164, t.tipo, t.principal])).toEqual([
      ['+552732431907', 'fixo', false],
      ['+5527998472210', 'whatsapp', true],
    ])
    expect(c.emails.map((e) => [e.email, e.tipo, e.principal])).toEqual([
      ['rogerio@exemplo.com.br', 'trabalho', true],
      ['r@pessoal.com', 'pessoal', false],
    ])
    const reg = (await auditoriaDe(d.tenantId)).find((a) => a.entidade === 'contato')
    expect(reg).toMatchObject({ acao: 'criar', entidade_id: c.id })
  })

  it('com o vínculo: o contato entra na empresa, com cargo e principal; outro principal tira o selo do anterior', async () => {
    const { d } = await cenario()
    const e = await empresa(d.cookie, 'Usidantec')
    const a = await criar(d.cookie, {
      nome: 'Ana',
      vinculo: { empresaId: e.id, cargo: 'Compradora', principal: true },
    })
    expect(a.vinculos).toMatchObject([
      {
        empresa: { id: e.id, nome: 'Usidantec' },
        cargo: 'Compradora',
        principal: true,
        ativo: true,
      },
    ])
    const b = await criar(d.cookie, { nome: 'Beto', vinculo: { empresaId: e.id, principal: true } })
    expect(b.vinculos[0]?.principal).toBe(true)
    expect(
      contatoDe(await chamar('get', d.cookie, `${CONTATOS}/${a.id}`)).vinculos[0]?.principal,
    ).toBe(false)
  })

  it('o vendedor precisa da empresa e só vincula a empresa da própria carteira', async () => {
    const { d, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const sem = await chamar('post', ana.cookie, CONTATOS, { nome: 'Sem empresa' })
    expect(sem.status).toBe(400)
    expect(erroDe(sem)).toBe('empresa_obrigatoria')
    expect(
      (
        await chamar('post', ana.cookie, CONTATOS, {
          nome: 'Fulano',
          vinculo: { empresaId: daBia.id },
        })
      ).status,
    ).toBe(400) // não a vê
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE tenant_configuracoes SET vendedor_ve_todas_empresas = true`,
    )
    const vendo = await chamar('post', ana.cookie, CONTATOS, {
      nome: 'Fulano',
      vinculo: { empresaId: daBia.id },
    })
    expect(vendo.status).toBe(403) // vê, mas não edita
    expect(erroDe(vendo)).toBe('acesso_negado')
    expect(
      (await criar(ana.cookie, { nome: 'Fulano', vinculo: { empresaId: daAna.id } })).vinculos,
    ).toHaveLength(1)
  })

  it('papel na decisão inexistente, inativo ou de outra empresa é 400; corpo ruim é 400', async () => {
    const { d } = await cenario()
    const papeis = (await chamar('get', d.cookie, '/v1/configuracoes/papeis-decisao'))
      .body as PapelDecisao[]
    const tecnico = papeis.find((p) => p.nome === 'Técnico') as PapelDecisao
    await chamar('patch', d.cookie, `/v1/configuracoes/papeis-decisao/${tecnico.id}`, {
      ativo: false,
    })
    for (const papelDecisaoId of [tecnico.id, '0199a000-0000-7000-8000-000000000001']) {
      const r = await chamar('post', d.cookie, CONTATOS, { nome: 'Ana', papelDecisaoId })
      expect(r.status).toBe(400)
      expect(erroDe(r)).toBe('papel_invalido')
    }
    for (const ruim of [
      { nome: 'A' },
      { nome: 'Ana', aniversario: { dia: 31, mes: 2 } },
      { nome: 'Ana', telefones: [{ numero: '123' }] },
      { nome: 'Ana', emails: [{ email: 'x' }] },
      { nome: 'Ana', extra: 1 },
    ]) {
      expect((await chamar('post', d.cookie, CONTATOS, ruim)).status, JSON.stringify(ruim)).toBe(
        400,
      )
    }
  })

  it('consentimento: desligar WhatsApp ou e-mail registra a data e a origem "manual"', async () => {
    const { d } = await cenario()
    const c = await criar(d.cookie, { nome: 'Ana', aceitaWhatsapp: false, aceitaEmail: false })
    expect(c).toMatchObject({
      aceitaWhatsapp: false,
      aceitaEmail: false,
      consentimentoOrigem: 'manual',
    })
    expect(c.consentimentoEm).toBeTruthy()
  })
})

describe('contato duplicado (só avisa)', () => {
  it('mesmo e-mail ou telefone: 409 com o contato existente; "criar mesmo assim" cria', async () => {
    const { d } = await cenario()
    const original = await criar(d.cookie, {
      nome: 'Ana',
      emails: [{ email: 'ana@exemplo.com' }],
      telefones: [{ numero: '27998472210' }],
    })
    const porEmail = await chamar('post', d.cookie, CONTATOS, {
      nome: 'Outra Ana',
      emails: [{ email: 'ANA@exemplo.com' }],
    })
    expect(porEmail.status).toBe(409)
    expect(erroDe(porEmail)).toBe('contato_duplicado')
    expect((porEmail.body as RespostaDeErro).dados).toEqual({
      existentes: [{ visivel: true, id: original.id, nome: 'Ana', motivo: 'email' }],
    })
    const porTelefone = await chamar('post', d.cookie, CONTATOS, {
      nome: 'Outra',
      telefones: [{ numero: '(27) 99847-2210' }],
    })
    expect(porTelefone.status).toBe(409)
    expect(JSON.stringify((porTelefone.body as RespostaDeErro).dados)).toContain('telefone')
    const mesmoAssim = await criar(d.cookie, {
      nome: 'Outra Ana',
      emails: [{ email: 'ana@exemplo.com' }],
      ignorarDuplicado: true,
    })
    expect(mesmoAssim.id).not.toBe(original.id)
  })

  it('o vendedor que não vê o contato existente recebe o aviso sem id nem nome', async () => {
    const { ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    await criar(ana.cookie, {
      nome: 'Contato da Ana',
      emails: [{ email: 'x@exemplo.com' }],
      vinculo: { empresaId: daAna.id },
    })
    const r = await chamar('post', bia.cookie, CONTATOS, {
      nome: 'Outro',
      emails: [{ email: 'x@exemplo.com' }],
      vinculo: { empresaId: daBia.id },
    })
    expect(r.status).toBe(409)
    expect((r.body as RespostaDeErro).dados).toEqual({
      existentes: [{ visivel: false, motivo: 'email' }],
    })
    expect(JSON.stringify(r.body)).not.toContain('Contato da Ana')
  })

  it('na edição só o e-mail ou telefone NOVO conta (o que o contato já tinha não é duplicado de si mesmo)', async () => {
    const { d } = await cenario()
    await criar(d.cookie, { nome: 'Ana', emails: [{ email: 'ana@exemplo.com' }] })
    const outro = await criar(d.cookie, { nome: 'Beto', emails: [{ email: 'beto@exemplo.com' }] })
    expect(
      (
        await chamar('patch', d.cookie, `${CONTATOS}/${outro.id}`, {
          nome: 'Beto Silva',
          emails: [{ email: 'beto@exemplo.com' }],
        })
      ).status,
    ).toBe(200)
    const r = await chamar('patch', d.cookie, `${CONTATOS}/${outro.id}`, {
      emails: [{ email: 'beto@exemplo.com' }, { email: 'ana@exemplo.com' }],
    })
    expect(r.status).toBe(409)
    const ok = await chamar('patch', d.cookie, `${CONTATOS}/${outro.id}`, {
      emails: [{ email: 'beto@exemplo.com' }, { email: 'ana@exemplo.com' }],
      ignorarDuplicado: true,
    })
    expect(ok.status).toBe(200)
  })
})

describe('regra de carteira dos contatos', () => {
  it('o vendedor só vê o contato ligado a empresa dele; admin e gestor veem todos, até o sem empresa', async () => {
    const { d, gestor, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const cAna = await criar(ana.cookie, {
      nome: 'Contato da Ana',
      vinculo: { empresaId: daAna.id },
    })
    const cBia = await criar(bia.cookie, {
      nome: 'Contato da Bia',
      vinculo: { empresaId: daBia.id },
    })
    const solto = await criar(d.cookie, { nome: 'Sem empresa' })
    const status = async (cookie: string, id: string) =>
      (await chamar('get', cookie, `${CONTATOS}/${id}`)).status
    expect([
      await status(ana.cookie, cAna.id),
      await status(ana.cookie, cBia.id),
      await status(ana.cookie, solto.id),
    ]).toEqual([200, 404, 404])
    for (const quem of [d, gestor]) {
      expect([
        await status(quem.cookie, cAna.id),
        await status(quem.cookie, cBia.id),
        await status(quem.cookie, solto.id),
      ]).toEqual([200, 200, 200])
    }
  })

  it('com "ver todas" o vendedor vê o contato da outra carteira, mas não edita nem exclui', async () => {
    const { d, ana, bia } = await cenario()
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const cBia = await criar(bia.cookie, {
      nome: 'Contato da Bia',
      vinculo: { empresaId: daBia.id },
    })
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE tenant_configuracoes SET vendedor_ve_todas_empresas = true`,
    )
    const visto = await chamar('get', ana.cookie, `${CONTATOS}/${cBia.id}`)
    expect(visto.status).toBe(200)
    expect(contatoDe(visto).permissoes).toEqual({ editar: false, excluir: false })
    const edicao = await chamar('patch', ana.cookie, `${CONTATOS}/${cBia.id}`, { observacoes: 'x' })
    expect(edicao.status).toBe(403)
    expect(erroDe(edicao)).toBe('acesso_negado')
    expect((await chamar('delete', ana.cookie, `${CONTATOS}/${cBia.id}`)).status).toBe(403)
  })

  it('o vendedor não vê, na ficha, os vínculos com empresas de outra carteira', async () => {
    const { d, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const c = await criar(d.cookie, { nome: 'Compartilhado', vinculo: { empresaId: daAna.id } })
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id) VALUES (gen_random_uuid(), ${d.tenantId}, ${daBia.id}, ${c.id})`,
    )
    expect(
      contatoDe(await chamar('get', ana.cookie, `${CONTATOS}/${c.id}`)).vinculos.map(
        (v) => v.empresa.nome,
      ),
    ).toEqual(['Da Ana'])
    expect(
      contatoDe(await chamar('get', d.cookie, `${CONTATOS}/${c.id}`)).vinculos.map(
        (v) => v.empresa.nome,
      ),
    ).toEqual(['Da Ana', 'Da Bia'])
  })

  it('o contato de outra empresa do grupo é 404 (isolamento)', async () => {
    const { d } = await cenario()
    const c = await criar(d.cookie, { nome: 'Isolado' })
    const outro = await novoDono(app)
    for (const [metodo, corpo] of [['get'], ['patch', { observacoes: 'x' }], ['delete']] as const) {
      expect((await chamar(metodo, outro.cookie, `${CONTATOS}/${c.id}`, corpo)).status).toBe(404)
    }
  })

  it('quando a empresa é excluída, o vínculo fica inativo e deixa de ser o principal; o vendedor deixa de ver o contato', async () => {
    const { d, ana } = await cenario()
    const e = await empresa(ana.cookie, 'Da Ana')
    const c = await criar(ana.cookie, {
      nome: 'Contato',
      vinculo: { empresaId: e.id, principal: true },
    })
    expect((await chamar('delete', d.cookie, `/v1/carteira/empresas/${e.id}`)).status).toBe(204)
    const [v] = await noTenant(
      d.tenantId,
      (tx) =>
        tx<
          { ativo: boolean; principal: boolean }[]
        >`SELECT ativo, principal FROM empresa_contatos WHERE contato_id = ${c.id}`,
    )
    expect(v).toEqual({ ativo: false, principal: false })
    expect((await chamar('get', ana.cookie, `${CONTATOS}/${c.id}`)).status).toBe(404)
    expect((await chamar('get', d.cookie, `${CONTATOS}/${c.id}`)).status).toBe(200) // admin ainda vê o contato solto
  })
})

describe('PATCH e DELETE /v1/carteira/contatos/:id', () => {
  it('muda só o que veio, registra o antes e o depois e atualiza o consentimento', async () => {
    const { d } = await cenario()
    const c = await criar(d.cookie, {
      nome: 'Ana',
      observacoes: 'antiga',
      telefones: [{ numero: '2732431907' }],
    })
    const r = await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, {
      nome: 'Ana Souza',
      observacoes: null,
      aniversario: { dia: 10, mes: 5 },
      telefones: [{ numero: '27998472210', tipo: 'whatsapp' }],
      emails: [{ email: 'ana@exemplo.com' }],
      aceitaWhatsapp: false,
      aceitaEmail: false,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(contatoDe(r)).toMatchObject({
      nome: 'Ana Souza',
      observacoes: null,
      aniversario: { dia: 10, mes: 5 },
      aceitaWhatsapp: false,
      aceitaEmail: false,
      consentimentoOrigem: 'manual',
    })
    expect(contatoDe(r).telefones.map((t) => t.e164)).toEqual(['+5527998472210'])
    const reg = (await auditoriaDe(d.tenantId)).filter(
      (a) => a.entidade === 'contato' && a.acao === 'alterar',
    )
    expect(reg).toHaveLength(1)
    expect(reg[0]?.alteracoes).toMatchObject({
      nome: { de: 'Ana', para: 'Ana Souza' },
      observacoes: { de: 'antiga', para: null },
      aceitaWhatsapp: { de: true, para: false },
      telefones: { de: ['+552732431907'], para: ['+5527998472210'] },
      emails: { de: [], para: ['ana@exemplo.com'] },
    })
    // limpar o papel e o aniversário; sem mudança real não grava auditoria
    const limpo = await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, { aniversario: null })
    expect(contatoDe(limpo).aniversario).toBeNull()
    await chamar('patch', d.cookie, `${CONTATOS}/${c.id}`, { nome: 'Ana Souza' })
    expect((await auditoriaDe(d.tenantId)).filter((a) => a.acao === 'alterar')).toHaveLength(2)
  })

  it('o vendedor edita o contato da própria carteira; corpo vazio e campo desconhecido são 400', async () => {
    const { ana } = await cenario()
    const e = await empresa(ana.cookie, 'Da Ana')
    const c = await criar(ana.cookie, { nome: 'Contato', vinculo: { empresaId: e.id } })
    expect(
      (await chamar('patch', ana.cookie, `${CONTATOS}/${c.id}`, { observacoes: 'ok' })).status,
    ).toBe(200)
    expect((await chamar('patch', ana.cookie, `${CONTATOS}/${c.id}`, {})).status).toBe(400)
    expect((await chamar('patch', ana.cookie, `${CONTATOS}/${c.id}`, { vinculo: {} })).status).toBe(
      400,
    )
    expect((await chamar('get', ana.cookie, `${CONTATOS}/abc`)).status).toBe(400)
  })

  it('excluir: vendedor 403; gestor e admin 204; depois some (404) e fica na auditoria', async () => {
    const { d, gestor, ana } = await cenario()
    const e = await empresa(ana.cookie, 'Da Ana')
    const c1 = await criar(ana.cookie, { nome: 'Um', vinculo: { empresaId: e.id } })
    const c2 = await criar(d.cookie, { nome: 'Dois' })
    expect((await chamar('delete', ana.cookie, `${CONTATOS}/${c1.id}`)).status).toBe(403)
    expect((await chamar('delete', gestor.cookie, `${CONTATOS}/${c1.id}`)).status).toBe(204)
    expect((await chamar('delete', d.cookie, `${CONTATOS}/${c2.id}`)).status).toBe(204)
    expect((await chamar('get', d.cookie, `${CONTATOS}/${c1.id}`)).status).toBe(404)
    expect((await chamar('delete', d.cookie, `${CONTATOS}/${c1.id}`)).status).toBe(404)
    expect(
      (await auditoriaDe(d.tenantId)).filter(
        (a) => a.acao === 'excluir' && a.entidade === 'contato',
      ),
    ).toHaveLength(2)
  })
})
