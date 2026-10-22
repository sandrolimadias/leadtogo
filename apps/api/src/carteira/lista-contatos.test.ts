import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type {
  Contato,
  EmpresaCarteira,
  ListaDeContatos,
  OpcoesDaListaDeContatos,
  PapelDecisao,
  TagGrupo,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

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

const lista = async (cookie: string, consulta = '') => {
  const r = await chamar('get', cookie, `${CONTATOS}${consulta}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as ListaDeContatos
}
const nomes = (l: ListaDeContatos) => l.itens.map((i) => i.nome)

describe('GET /v1/carteira/contatos', () => {
  it('sem sessão 401; consulta inválida é 400; a rota /opcoes não é confundida com um id', async () => {
    const { d } = await cenario()
    expect((await chamar('get', undefined, CONTATOS)).status).toBe(401)
    expect((await chamar('get', d.cookie, `${CONTATOS}?porPagina=1000`)).status).toBe(400)
    expect((await chamar('get', d.cookie, `${CONTATOS}?empresaId=x`)).status).toBe(400)
    expect((await chamar('get', d.cookie, `${CONTATOS}?inventado=1`)).status).toBe(400)
    expect((await chamar('get', d.cookie, `${CONTATOS}/opcoes`)).status).toBe(200)
  })

  it('traz o item completo: papel, empresas com cargo e principal, telefone, e-mail e consentimento', async () => {
    const { d } = await cenario()
    const e = await empresa(d.cookie, 'Usidantec')
    const papeis = (await chamar('get', d.cookie, '/v1/configuracoes/papeis-decisao'))
      .body as PapelDecisao[]
    const decisor = papeis.find((p) => p.nome === 'Decisor') as PapelDecisao
    const c = await criar(d.cookie, {
      nome: 'Rogério Bindaco',
      papelDecisaoId: decisor.id,
      telefones: [
        { numero: '2732431907' },
        { numero: '27998472210', tipo: 'whatsapp', principal: true },
      ],
      emails: [{ email: 'Rogerio@Exemplo.com.br' }],
      vinculo: { empresaId: e.id, cargo: 'Diretor', principal: true },
    })
    await criar(d.cookie, { nome: 'Sem nada' })
    const l = await lista(d.cookie)
    expect(l).toMatchObject({ total: 2, pagina: 1, porPagina: 25 })
    expect(l.itens.find((i) => i.id === c.id)).toEqual({
      id: c.id,
      nome: 'Rogério Bindaco',
      papelDecisao: { id: decisor.id, nome: 'Decisor' },
      empresas: [{ id: e.id, nome: 'Usidantec', cargo: 'Diretor', principal: true, ativo: true }],
      telefone: '+5527998472210',
      temWhatsapp: true,
      email: 'rogerio@exemplo.com.br',
      naoQuerContato: false,
      editavel: true,
    })
    const vazio = l.itens.find((i) => i.nome === 'Sem nada')
    expect(vazio).toMatchObject({ empresas: [], telefone: null, email: null, temWhatsapp: false })
  })

  it('"Pediu para não receber contato" aparece como naoQuerContato; contato excluído some', async () => {
    const { d } = await cenario()
    const c = await criar(d.cookie, { nome: 'Calado', aceitaWhatsapp: false, aceitaEmail: false })
    const so = await criar(d.cookie, { nome: 'Só e-mail', aceitaWhatsapp: false })
    const apagado = await criar(d.cookie, { nome: 'Apagado' })
    expect((await chamar('delete', d.cookie, `${CONTATOS}/${apagado.id}`)).status).toBe(204)
    const l = await lista(d.cookie)
    expect(l.itens.find((i) => i.id === c.id)?.naoQuerContato).toBe(true)
    expect(l.itens.find((i) => i.id === so.id)?.naoQuerContato).toBe(false)
    expect(nomes(l)).not.toContain('Apagado')
    expect(l.total).toBe(2)
  })

  it('busca por nome sem acento e caixa, por e-mail e por pedaço do telefone (com ou sem máscara)', async () => {
    const { d } = await cenario()
    await criar(d.cookie, {
      nome: 'Rogério Bindaco',
      emails: [{ email: 'rogerio@usidantec.com.br' }],
      telefones: [{ numero: '(27) 99847-2210' }],
    })
    await criar(d.cookie, { nome: 'Ana Paula', telefones: [{ numero: '2732431907' }] })
    await criar(d.cookie, { nome: '100% Teste_' })
    const achados = async (busca: string) =>
      nomes(await lista(d.cookie, `?busca=${encodeURIComponent(busca)}`))
    expect(await achados('rogerio')).toEqual(['Rogério Bindaco'])
    expect(await achados('BINDAC')).toEqual(['Rogério Bindaco'])
    expect(await achados('usidantec.com')).toEqual(['Rogério Bindaco'])
    expect(await achados('99847')).toEqual(['Rogério Bindaco'])
    expect(await achados('(27) 99847-2210')).toEqual(['Rogério Bindaco'])
    expect(await achados('3243 1907')).toEqual(['Ana Paula'])
    expect(await achados('zzz')).toEqual([])
    // % e _ valem como texto, não como curinga
    expect(await achados('100%')).toEqual(['100% Teste_'])
    expect(await achados('%')).toEqual(['100% Teste_'])
  })

  it('filtros de empresa, cargo, papel e tag da empresa; empresa, cargo e tag valem para o mesmo vínculo ativo', async () => {
    const { d } = await cenario()
    const grupos = (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos'))
      .body as TagGrupo[]
    const cliente = grupos.flatMap((g) => g.tags).find((t) => t.nome === 'Cliente')
    const papeis = (await chamar('get', d.cookie, '/v1/configuracoes/papeis-decisao'))
      .body as PapelDecisao[]
    const decisor = papeis.find((p) => p.nome === 'Decisor') as PapelDecisao
    const a = await empresa(d.cookie, 'Alfa')
    const b = await empresa(d.cookie, 'Beta')
    expect(
      (
        await chamar('put', d.cookie, `/v1/carteira/empresas/${b.id}/tags`, {
          tagIds: [cliente?.id],
        })
      ).status,
    ).toBe(200)
    const ana = await criar(d.cookie, {
      nome: 'Ana',
      papelDecisaoId: decisor.id,
      vinculo: { empresaId: a.id, cargo: 'Diretora' },
    })
    await criar(d.cookie, { nome: 'Beto', vinculo: { empresaId: b.id, cargo: 'diretor' } })
    await criar(d.cookie, { nome: 'Caio', vinculo: { empresaId: b.id, cargo: 'Compras' } })
    const consulta = async (q: string) => nomes(await lista(d.cookie, `?${q}`))

    expect(await consulta(`empresaId=${a.id}`)).toEqual(['Ana'])
    expect(await consulta(`empresaId=${b.id}`)).toEqual(['Beto', 'Caio'])
    expect(await consulta('cargo=diretor')).toEqual(['Beto']) // igual, sem diferença de caixa
    expect(await consulta('cargo=Dire')).toEqual([]) // o cargo é o texto inteiro
    expect(await consulta(`papelDecisaoId=${decisor.id}`)).toEqual(['Ana'])
    expect(await consulta(`tagId=${cliente?.id}`)).toEqual(['Beto', 'Caio'])
    expect(await consulta(`tagId=${cliente?.id}&cargo=compras`)).toEqual(['Caio'])
    expect(await consulta(`empresaId=${a.id}&tagId=${cliente?.id}`)).toEqual([])
    expect(await consulta(`empresaId=${a.id}&cargo=diretora&busca=ana`)).toEqual(['Ana'])

    // vínculo inativo não conta para empresa, cargo nem tag, mas o contato continua na lista geral
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE empresa_contatos SET ativo = false, principal = false WHERE contato_id = ${ana.id}`,
    )
    expect(await consulta(`empresaId=${a.id}`)).toEqual([])
    expect(await consulta('cargo=diretora')).toEqual([])
    expect(await consulta('busca=ana')).toEqual(['Ana'])
    const ativo = (await lista(d.cookie, '?busca=ana')).itens[0]
    expect(ativo?.empresas).toEqual([
      { id: a.id, nome: 'Alfa', cargo: 'Diretora', principal: false, ativo: false },
    ])
  })

  it('várias empresas: as ativas vêm primeiro e o contato aparece uma vez só', async () => {
    const { d } = await cenario()
    const a = await empresa(d.cookie, 'Alfa')
    const b = await empresa(d.cookie, 'Beta')
    const c = await criar(d.cookie, { nome: 'Duas', vinculo: { empresaId: a.id, cargo: 'Sócia' } })
    await noTenant(
      d.tenantId,
      (
        tx,
      ) => tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id, cargo, principal)
        VALUES (${novoId()}, ${d.tenantId}, ${b.id}, ${c.id}, 'Contadora', true)`,
    )
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE empresa_contatos SET ativo = false, principal = false WHERE empresa_id = ${a.id}`,
    )
    const l = await lista(d.cookie, `?busca=duas`)
    expect(l.total).toBe(1)
    expect(l.itens[0]?.empresas.map((e) => [e.nome, e.ativo, e.principal])).toEqual([
      ['Beta', true, true],
      ['Alfa', false, false],
    ])
    expect(nomes(await lista(d.cookie, '?cargo=sócia'))).toEqual([])
    expect(nomes(await lista(d.cookie, '?cargo=socia'))).toEqual([]) // inativo: não conta
    expect(nomes(await lista(d.cookie, '?cargo=contadora'))).toEqual(['Duas'])
  })

  it('ordenação por nome (sem acento) e por cadastro, paginação com total', async () => {
    const { d } = await cenario()
    for (const n of ['Érica', 'Bruno', 'Ana', 'Dani', 'Carla']) await criar(d.cookie, { nome: n })
    expect(nomes(await lista(d.cookie))).toEqual(['Ana', 'Bruno', 'Carla', 'Dani', 'Érica'])
    expect(nomes(await lista(d.cookie, '?sentido=desc'))).toEqual([
      'Érica',
      'Dani',
      'Carla',
      'Bruno',
      'Ana',
    ])
    expect(nomes(await lista(d.cookie, '?ordem=criado_em&sentido=desc&porPagina=2'))).toEqual([
      'Carla',
      'Dani',
    ])
    const p2 = await lista(d.cookie, '?porPagina=2&pagina=2')
    expect(nomes(p2)).toEqual(['Carla', 'Dani'])
    expect(p2).toMatchObject({ total: 5, pagina: 2, porPagina: 2 })
    expect(nomes(await lista(d.cookie, '?porPagina=2&pagina=3'))).toEqual(['Érica'])
    expect(nomes(await lista(d.cookie, '?porPagina=2&pagina=9'))).toEqual([])
  })

  it('carteira: o vendedor só vê contatos ligados a empresas que vê, e só os vínculos que vê', async () => {
    const { d, gestor, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    const meu = await criar(ana.cookie, {
      nome: 'Contato da Ana',
      vinculo: { empresaId: daAna.id },
    })
    await criar(bia.cookie, { nome: 'Contato da Bia', vinculo: { empresaId: daBia.id } })
    await criar(d.cookie, { nome: 'Solto' })
    // um contato nas duas carteiras
    const dois = await criar(d.cookie, {
      nome: 'Nas duas',
      vinculo: { empresaId: daAna.id, cargo: 'Dono' },
    })
    await noTenant(
      d.tenantId,
      (tx) => tx`INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id, cargo)
        VALUES (${novoId()}, ${d.tenantId}, ${daBia.id}, ${dois.id}, 'Sócio')`,
    )

    const daAnaLista = await lista(ana.cookie)
    expect(nomes(daAnaLista)).toEqual(['Contato da Ana', 'Nas duas'])
    expect(daAnaLista.itens.every((i) => i.editavel)).toBe(true)
    // o vínculo com a empresa da Bia não aparece para a Ana
    expect(daAnaLista.itens.find((i) => i.id === dois.id)?.empresas.map((e) => e.nome)).toEqual([
      'Da Ana',
    ])
    expect(nomes(await lista(bia.cookie))).toEqual(['Contato da Bia', 'Nas duas'])
    // filtrar pela empresa que não vê não devolve nada
    expect(nomes(await lista(ana.cookie, `?empresaId=${daBia.id}`))).toEqual([])
    expect(nomes(await lista(gestor.cookie))).toEqual([
      'Contato da Ana',
      'Contato da Bia',
      'Nas duas',
      'Solto',
    ])
    expect((await lista(ana.cookie)).total).toBe(2)
    expect(meu.id).toBeTruthy()

    // com "ver todas", vê tudo que tem empresa, mas só edita o que é da carteira dela
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE perfil_permissoes SET alcance = 'todas' WHERE permissao IN ('empresas.ver', 'contatos.ver', 'oportunidades.ver', 'atividades.ver') AND perfil_id IN (SELECT id FROM perfis_acesso WHERE chave_sistema = 'vendedor')`,
    )
    const vendo = await lista(ana.cookie)
    expect(nomes(vendo)).toEqual(['Contato da Ana', 'Contato da Bia', 'Nas duas'])
    expect(vendo.itens.map((i) => [i.nome, i.editavel])).toEqual([
      ['Contato da Ana', true],
      ['Contato da Bia', false],
      ['Nas duas', true],
    ])
  })

  it('empresa excluída: o contato some para o vendedor e continua para o gestor, sem o vínculo', async () => {
    const { gestor, ana } = await cenario()
    const e = await empresa(ana.cookie, 'Fechou')
    await criar(ana.cookie, { nome: 'Pessoa', vinculo: { empresaId: e.id, cargo: 'Dono' } })
    expect((await chamar('delete', gestor.cookie, `/v1/carteira/empresas/${e.id}`)).status).toBe(
      204,
    )
    expect(nomes(await lista(ana.cookie))).toEqual([])
    const g = await lista(gestor.cookie)
    expect(nomes(g)).toEqual(['Pessoa'])
    expect(g.itens[0]?.empresas).toEqual([])
  })

  it('isolamento: o contato de outra empresa do grupo não aparece, nem nos filtros e nas opções', async () => {
    const { d } = await cenario()
    const outro = await novoDono(app)
    const eDeles = await empresa(outro.cookie, 'Deles')
    await criar(outro.cookie, { nome: 'Dele', vinculo: { empresaId: eDeles.id, cargo: 'Dono' } })
    await criar(d.cookie, { nome: 'Nosso' })
    expect(nomes(await lista(d.cookie))).toEqual(['Nosso'])
    expect(nomes(await lista(d.cookie, `?empresaId=${eDeles.id}`))).toEqual([])
    expect(nomes(await lista(d.cookie, '?busca=dele'))).toEqual([])
    const opcoes = (await chamar('get', d.cookie, `${CONTATOS}/opcoes`))
      .body as OpcoesDaListaDeContatos
    expect(opcoes.cargos).toEqual([])
  })
})

describe('GET /v1/carteira/contatos/opcoes', () => {
  it('lista os cargos dos vínculos ativos que o usuário vê, sem repetir', async () => {
    const { d, ana, bia } = await cenario()
    const daAna = await empresa(ana.cookie, 'Da Ana')
    const daBia = await empresa(bia.cookie, 'Da Bia')
    await criar(ana.cookie, { nome: 'A1', vinculo: { empresaId: daAna.id, cargo: 'Diretor' } })
    await criar(ana.cookie, { nome: 'A2', vinculo: { empresaId: daAna.id, cargo: 'Compras' } })
    await criar(ana.cookie, { nome: 'A3', vinculo: { empresaId: daAna.id, cargo: 'Compras' } })
    await criar(ana.cookie, { nome: 'A4', vinculo: { empresaId: daAna.id } })
    const b = await criar(bia.cookie, {
      nome: 'B1',
      vinculo: { empresaId: daBia.id, cargo: 'Financeiro' },
    })
    const cargosDe = async (cookie: string) =>
      ((await chamar('get', cookie, `${CONTATOS}/opcoes`)).body as OpcoesDaListaDeContatos).cargos
    expect(await cargosDe(ana.cookie)).toEqual(['Compras', 'Diretor'])
    expect(await cargosDe(d.cookie)).toEqual(['Compras', 'Diretor', 'Financeiro'])
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE empresa_contatos SET ativo = false WHERE contato_id = ${b.id}`,
    )
    expect(await cargosDe(d.cookie)).toEqual(['Compras', 'Diretor'])
  })
})
