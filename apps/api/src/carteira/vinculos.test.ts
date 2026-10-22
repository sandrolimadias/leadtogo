import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { Contato, EmpresaCarteira, ContatoDaEmpresa } from '@leadtogo/shared'
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

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'
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

const auditoriaDoContato = async (tenantId: string, contatoId: string) =>
  (await auditoriaDe(tenantId)).filter(
    (a) => a.entidade === 'contato' && a.entidade_id === contatoId,
  )
const vinculos = (contatoId: string) => `${CONTATOS}/${contatoId}/vinculos`
const doContato = (c: Contato, empresaId: string) =>
  c.vinculos.find((v) => v.empresa.id === empresaId)

describe('POST /v1/carteira/contatos/:id/vinculos', () => {
  it('vincula a outra empresa com o cargo dela; o cargo é de cada vínculo', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const b = await empresa(d.cookie, 'Beta')
    const c = await criar(d.cookie, {
      nome: 'Rogério',
      vinculo: { empresaId: a.id, cargo: 'Sócio' },
    })
    expect((await chamar('post', undefined, vinculos(c.id), { empresaId: b.id })).status).toBe(401)

    const r = await chamar('post', d.cookie, vinculos(c.id), {
      empresaId: b.id,
      cargo: '  Contador ',
      principal: true,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const depois = contatoDe(r)
    expect(depois.vinculos).toHaveLength(2)
    expect(doContato(depois, a.id)).toMatchObject({
      cargo: 'Sócio',
      principal: false,
      ativo: true,
      editavel: true,
    })
    expect(doContato(depois, b.id)).toMatchObject({
      cargo: 'Contador',
      principal: true,
      ativo: true,
    })
    const auditoria = await auditoriaDoContato(d.tenantId, c.id)
    expect(auditoria.find((x) => x.acao === 'vincular')?.['alteracoes']).toEqual({
      empresa: 'Beta',
      cargo: 'Contador',
      principal: true,
    })
  })

  it('já vinculado e ativo: 409; empresa inexistente ou de outra conta: 400; corpo ruim: 400; contato inexistente: 404', async () => {
    const { d } = await cenario()
    const outro = await novoDono(app)
    const deles = await empresa(outro.cookie, 'Deles')
    const a = await empresa(d.cookie, 'Alfa')
    const c = await criar(d.cookie, { nome: 'Rogério', vinculo: { empresaId: a.id } })
    const repetido = await chamar('post', d.cookie, vinculos(c.id), { empresaId: a.id })
    expect(repetido.status).toBe(409)
    expect(erroDe(repetido)).toBe('vinculo_ja_existe')
    expect((await chamar('post', d.cookie, vinculos(c.id), { empresaId: deles.id })).status).toBe(
      400,
    )
    expect((await chamar('post', d.cookie, vinculos(c.id), { empresaId: novoId() })).status).toBe(
      400,
    )
    expect((await chamar('post', d.cookie, vinculos(c.id), {})).status).toBe(400)
    expect((await chamar('post', d.cookie, vinculos(c.id), { empresaId: a.id, x: 1 })).status).toBe(
      400,
    )
    expect((await chamar('post', d.cookie, vinculos(novoId()), { empresaId: a.id })).status).toBe(
      404,
    )
    expect((await chamar('post', d.cookie, vinculos('x'), { empresaId: a.id })).status).toBe(400)
    // o contato da outra conta não existe para esta
    const dele = await criar(outro.cookie, { nome: 'Dele' })
    expect((await chamar('post', d.cookie, vinculos(dele.id), { empresaId: a.id })).status).toBe(
      404,
    )
  })

  it('principal: marcar um tira o selo do anterior, na mesma empresa', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const primeiro = await criar(d.cookie, {
      nome: 'Primeiro',
      vinculo: { empresaId: a.id, principal: true },
    })
    const segundo = await criar(d.cookie, { nome: 'Segundo' })
    const r = await chamar('post', d.cookie, vinculos(segundo.id), {
      empresaId: a.id,
      principal: true,
    })
    expect(r.status).toBe(201)
    expect(doContato(contatoDe(r), a.id)?.principal).toBe(true)
    const antigo = (await chamar('get', d.cookie, `${CONTATOS}/${primeiro.id}`)).body as Contato
    expect(doContato(antigo, a.id)?.principal).toBe(false)
  })

  it('vínculo inativo é reativado com o cargo novo, sem criar outro', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const c = await criar(d.cookie, {
      nome: 'Rogério',
      vinculo: { empresaId: a.id, cargo: 'Antigo' },
    })
    expect(
      (await chamar('patch', d.cookie, `${vinculos(c.id)}/${a.id}`, { ativo: false })).status,
    ).toBe(200)
    const r = await chamar('post', d.cookie, vinculos(c.id), { empresaId: a.id, cargo: 'Novo' })
    expect(r.status).toBe(201)
    const v = contatoDe(r).vinculos
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ cargo: 'Novo', ativo: true, ate: null })
    const acoes = (await auditoriaDoContato(d.tenantId, c.id)).map((x) => x.acao)
    expect(acoes).toContain('reativar_vinculo')
  })

  it('carteira: o vendedor só vincula a empresa dele e só contato que vê', async () => {
    const { d, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daAna2 = await empresa(ana.cookie, 'Da Ana 2')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const meu = await criar(ana.cookie, { nome: 'Meu', vinculo: { empresaId: daAna.id } })
    const deBia = await criar(bia.cookie, { nome: 'De Bia', vinculo: { empresaId: daBia.id } })

    const ok = await chamar('post', ana.cookie, vinculos(meu.id), {
      empresaId: daAna2.id,
      cargo: 'Dono',
    })
    expect(ok.status).toBe(201)
    // empresa de outro vendedor: não vê → 400
    expect(
      (await chamar('post', ana.cookie, vinculos(meu.id), { empresaId: daBia.id })).status,
    ).toBe(400)
    // contato de outro vendedor: não vê → 404
    expect(
      (await chamar('post', ana.cookie, vinculos(deBia.id), { empresaId: daAna.id })).status,
    ).toBe(404)
    // com "ver todas": vê a empresa da Bia, mas não a edita → 403
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE perfil_permissoes SET alcance = 'todas' WHERE permissao IN ('empresas.ver', 'contatos.ver', 'oportunidades.ver', 'atividades.ver') AND perfil_id IN (SELECT id FROM perfis_acesso WHERE chave_sistema = 'vendedor')`,
    )
    const negado = await chamar('post', ana.cookie, vinculos(meu.id), { empresaId: daBia.id })
    expect(negado.status).toBe(403)
    expect(erroDe(negado)).toBe('acesso_negado')
    // contato que só vê (da Bia) pode ser ligado a empresa dela: passa a ser editável para ela
    const trazendo = await chamar('post', ana.cookie, vinculos(deBia.id), { empresaId: daAna.id })
    expect(trazendo.status).toBe(201)
    expect(contatoDe(trazendo).permissoes.editar).toBe(true)
  })
})

describe('PATCH /v1/carteira/contatos/:id/vinculos/:empresaId', () => {
  it('muda o cargo (e limpa com vazio), registra antes e depois e não mexe no resto', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const c = await criar(d.cookie, {
      nome: 'Rogério',
      vinculo: { empresaId: a.id, cargo: 'Compras', principal: true },
    })
    const url = `${vinculos(c.id)}/${a.id}`
    expect((await chamar('patch', undefined, url, { cargo: 'x' })).status).toBe(401)
    const r = await chamar('patch', d.cookie, url, { cargo: ' Diretor ' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(doContato(contatoDe(r), a.id)).toMatchObject({
      cargo: 'Diretor',
      principal: true,
      ativo: true,
    })
    const limpo = await chamar('patch', d.cookie, url, { cargo: '' })
    expect(doContato(contatoDe(limpo), a.id)?.cargo).toBeNull()
    const alt = (await auditoriaDoContato(d.tenantId, c.id)).filter(
      (x) => x.acao === 'alterar_vinculo',
    )
    expect(alt.map((x) => x.alteracoes)).toEqual(
      expect.arrayContaining([
        { empresa: 'Alfa', cargo: { de: 'Compras', para: 'Diretor' } },
        { empresa: 'Alfa', cargo: { de: 'Diretor', para: null } },
      ]),
    )
  })

  it('sem mudança real não grava auditoria; corpo vazio ou com campo estranho é 400', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const c = await criar(d.cookie, {
      nome: 'Rogério',
      vinculo: { empresaId: a.id, cargo: 'Compras' },
    })
    const url = `${vinculos(c.id)}/${a.id}`
    const antes = (await auditoriaDoContato(d.tenantId, c.id)).length
    expect((await chamar('patch', d.cookie, url, { cargo: 'Compras', ativo: true })).status).toBe(
      200,
    )
    expect((await auditoriaDoContato(d.tenantId, c.id)).length).toBe(antes)
    expect((await chamar('patch', d.cookie, url, {})).status).toBe(400)
    expect((await chamar('patch', d.cookie, url, { empresaId: novoId() })).status).toBe(400)
    expect((await chamar('patch', d.cookie, `${vinculos(c.id)}/x`, { cargo: 'a' })).status).toBe(
      400,
    )
  })

  it('principal: um só por empresa; só o vínculo ativo pode ser principal', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const um = await criar(d.cookie, { nome: 'Um', vinculo: { empresaId: a.id, principal: true } })
    const dois = await criar(d.cookie, { nome: 'Dois', vinculo: { empresaId: a.id } })
    const r = await chamar('patch', d.cookie, `${vinculos(dois.id)}/${a.id}`, { principal: true })
    expect(doContato(contatoDe(r), a.id)?.principal).toBe(true)
    const antigo = (await chamar('get', d.cookie, `${CONTATOS}/${um.id}`)).body as Contato
    expect(doContato(antigo, a.id)?.principal).toBe(false)
    // tirar o selo, sem marcar outro
    const tirou = await chamar('patch', d.cookie, `${vinculos(dois.id)}/${a.id}`, {
      principal: false,
    })
    expect(doContato(contatoDe(tirou), a.id)?.principal).toBe(false)
    // inativo não pode ser principal
    await chamar('patch', d.cookie, `${vinculos(um.id)}/${a.id}`, { ativo: false })
    const inativo = await chamar('patch', d.cookie, `${vinculos(um.id)}/${a.id}`, {
      principal: true,
    })
    expect(inativo.status).toBe(400)
    expect(erroDe(inativo)).toBe('vinculo_inativo')
    const junto = await chamar('patch', d.cookie, `${vinculos(dois.id)}/${a.id}`, {
      ativo: false,
      principal: true,
    })
    expect(junto.status).toBe(400)
    // reativar e marcar principal de uma vez
    const reativou = await chamar('patch', d.cookie, `${vinculos(um.id)}/${a.id}`, {
      ativo: true,
      principal: true,
    })
    expect(doContato(contatoDe(reativou), a.id)).toMatchObject({ ativo: true, principal: true })
  })

  it('inativar tira o selo de principal e guarda a data de saída; reativar limpa a data; o histórico fica', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const c = await criar(d.cookie, {
      nome: 'Rogério',
      vinculo: { empresaId: a.id, cargo: 'Gerente', principal: true },
    })
    const url = `${vinculos(c.id)}/${a.id}`
    const saiu = await chamar('patch', d.cookie, url, { ativo: false })
    expect(saiu.status).toBe(200)
    const v = doContato(contatoDe(saiu), a.id)
    expect(v).toMatchObject({ ativo: false, principal: false, cargo: 'Gerente' })
    expect(v?.ate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const voltou = await chamar('patch', d.cookie, url, { ativo: true })
    expect(doContato(contatoDe(voltou), a.id)).toMatchObject({
      ativo: true,
      principal: false,
      ate: null,
    })
    const alt = (await auditoriaDoContato(d.tenantId, c.id)).filter(
      (x) => x.acao === 'alterar_vinculo',
    )
    expect(alt.map((x) => x.alteracoes)).toEqual(
      expect.arrayContaining([
        { empresa: 'Alfa', principal: { de: true, para: false }, ativo: { de: true, para: false } },
        { empresa: 'Alfa', ativo: { de: false, para: true } },
      ]),
    )
  })

  it('vínculo inexistente ou com empresa que o usuário não vê é 404; contato inexistente é 404', async () => {
    const { d, ana, bia } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const b = await empresa(d.cookie, 'Beta')
    const c = await criar(d.cookie, { nome: 'Rogério', vinculo: { empresaId: a.id } })
    const semVinculo = await chamar('patch', d.cookie, `${vinculos(c.id)}/${b.id}`, { cargo: 'x' })
    expect(semVinculo.status).toBe(404)
    expect(erroDe(semVinculo)).toBe('vinculo_nao_encontrado')
    expect(
      (await chamar('patch', d.cookie, `${vinculos(novoId())}/${a.id}`, { cargo: 'x' })).status,
    ).toBe(404)
    // a Ana não vê a empresa da Bia: o vínculo "não existe" para ela
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const nasDuas = await criar(d.cookie, { nome: 'Nas duas', vinculo: { empresaId: daAna.id } })
    await chamar('post', d.cookie, vinculos(nasDuas.id), { empresaId: daBia.id })
    expect(
      (await chamar('patch', ana.cookie, `${vinculos(nasDuas.id)}/${daBia.id}`, { cargo: 'x' }))
        .status,
    ).toBe(404)
    expect(
      (await chamar('patch', ana.cookie, `${vinculos(nasDuas.id)}/${daAna.id}`, { cargo: 'Dona' }))
        .status,
    ).toBe(200)
  })

  it('o vendedor vê "editavel" só nos vínculos da própria carteira e não altera os outros', async () => {
    const { d, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const c = await criar(d.cookie, { nome: 'Nas duas', vinculo: { empresaId: daAna.id } })
    await chamar('post', d.cookie, vinculos(c.id), { empresaId: daBia.id })
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE perfil_permissoes SET alcance = 'todas' WHERE permissao IN ('empresas.ver', 'contatos.ver', 'oportunidades.ver', 'atividades.ver') AND perfil_id IN (SELECT id FROM perfis_acesso WHERE chave_sistema = 'vendedor')`,
    )
    const ficha = (await chamar('get', ana.cookie, `${CONTATOS}/${c.id}`)).body as Contato
    expect(doContato(ficha, daAna.id)?.editavel).toBe(true)
    expect(doContato(ficha, daBia.id)?.editavel).toBe(false)
    const negado = await chamar('patch', ana.cookie, `${vinculos(c.id)}/${daBia.id}`, {
      cargo: 'x',
    })
    expect(negado.status).toBe(403)
  })

  it('o vendedor que inativa o último vínculo recebe o contato, mas deixa de vê-lo; o gestor continua vendo', async () => {
    const { gestor, ana } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const c = await criar(ana.cookie, {
      nome: 'Saiu',
      vinculo: { empresaId: daAna.id, principal: true },
    })
    const r = await chamar('patch', ana.cookie, `${vinculos(c.id)}/${daAna.id}`, { ativo: false })
    expect(r.status).toBe(200)
    expect(contatoDe(r).nome).toBe('Saiu')
    expect((await chamar('get', ana.cookie, `${CONTATOS}/${c.id}`)).status).toBe(404)
    const lista = (await chamar('get', ana.cookie, CONTATOS)).body as { total: number }
    expect(lista.total).toBe(0)
    expect(
      ((await chamar('get', gestor.cookie, `${CONTATOS}/${c.id}`)).body as Contato).vinculos[0]
        ?.ativo,
    ).toBe(false)
  })
})

describe('GET /v1/carteira/empresas/:id/contatos', () => {
  const daEmpresa = async (cookie: string, empresaId: string) => {
    const r = await chamar('get', cookie, `/v1/carteira/empresas/${empresaId}/contatos`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return r.body as ContatoDaEmpresa[]
  }

  it('lista os vínculos da empresa: ativos primeiro, principal antes, depois por nome; os inativos ficam no fim', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const b = await empresa(d.cookie, 'Beta')
    const papeis = (await chamar('get', d.cookie, '/v1/configuracoes/papeis-decisao')).body as {
      id: string
      nome: string
    }[]
    const decisor = papeis.find((p) => p.nome === 'Decisor')
    await criar(d.cookie, { nome: 'Zeca', vinculo: { empresaId: a.id, cargo: 'Compras' } })
    await criar(d.cookie, {
      nome: 'Érica',
      papelDecisaoId: decisor?.id,
      telefones: [{ numero: '27998472210', tipo: 'whatsapp' }],
      emails: [{ email: 'erica@exemplo.com' }],
      aceitaWhatsapp: false,
      aceitaEmail: false,
      vinculo: { empresaId: a.id, cargo: 'Diretora' },
    })
    await criar(d.cookie, { nome: 'Principal', vinculo: { empresaId: a.id, principal: true } })
    const saiu = await criar(d.cookie, {
      nome: 'Aaron',
      vinculo: { empresaId: a.id, cargo: 'Antigo' },
    })
    await chamar('patch', d.cookie, `${vinculos(saiu.id)}/${a.id}`, { ativo: false })
    await criar(d.cookie, { nome: 'De outra', vinculo: { empresaId: b.id } })

    const lista = await daEmpresa(d.cookie, a.id)
    expect(lista.map((c) => c.nome)).toEqual(['Principal', 'Érica', 'Zeca', 'Aaron'])
    expect(lista[0]).toMatchObject({ principal: true, ativo: true, telefone: null, email: null })
    expect(lista[1]).toEqual({
      id: lista[1]?.id,
      nome: 'Érica',
      papelDecisao: { id: decisor?.id, nome: 'Decisor' },
      cargo: 'Diretora',
      principal: false,
      ativo: true,
      telefone: '+5527998472210',
      temWhatsapp: true,
      email: 'erica@exemplo.com',
      naoQuerContato: true,
    })
    expect(lista[3]).toMatchObject({ nome: 'Aaron', ativo: false, cargo: 'Antigo' })
  })

  it('contato excluído não aparece; empresa sem contatos devolve lista vazia', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    expect(await daEmpresa(d.cookie, a.id)).toEqual([])
    const c = await criar(d.cookie, { nome: 'Some', vinculo: { empresaId: a.id } })
    await chamar('delete', d.cookie, `${CONTATOS}/${c.id}`)
    expect(await daEmpresa(d.cookie, a.id)).toEqual([])
  })

  it('carteira e isolamento: empresa que o usuário não vê ou de outra conta é 404; id ruim é 400', async () => {
    const { d, ana, bia } = await cenario()
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const outro = await novoDono(app)
    const deles = await empresa(outro.cookie, 'Deles')
    for (const alvo of [daBia.id, deles.id]) {
      const r = await chamar('get', ana.cookie, `/v1/carteira/empresas/${alvo}/contatos`)
      expect(r.status).toBe(404)
      expect(erroDe(r)).toBe('empresa_nao_encontrada')
    }
    expect(
      (await chamar('get', d.cookie, `/v1/carteira/empresas/${deles.id}/contatos`)).status,
    ).toBe(404)
    expect((await chamar('get', d.cookie, '/v1/carteira/empresas/x/contatos')).status).toBe(400)
    expect(
      (await chamar('get', undefined, `/v1/carteira/empresas/${daBia.id}/contatos`)).status,
    ).toBe(401)
    // com "ver todas", a Ana vê a lista da empresa da Bia (só leitura)
    await criar(bia.cookie, { nome: 'Da carteira da Bia', vinculo: { empresaId: daBia.id } })
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE perfil_permissoes SET alcance = 'todas' WHERE permissao IN ('empresas.ver', 'contatos.ver', 'oportunidades.ver', 'atividades.ver') AND perfil_id IN (SELECT id FROM perfis_acesso WHERE chave_sistema = 'vendedor')`,
    )
    expect((await daEmpresa(ana.cookie, daBia.id)).map((c) => c.nome)).toEqual([
      'Da carteira da Bia',
    ])
  })
})
