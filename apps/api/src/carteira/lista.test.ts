import type { Server } from 'node:http'

import {
  type ContagensDaLista,
  type EmpresaCarteira,
  type ListaDeEmpresas,
  type OpcoesDaLista,
  type TagGrupo,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'VITORIA', 'ES'), (3201308, 'CARIACICA', 'ES') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO portes (codigo, descricao) VALUES (0, 'Não informado'), (1, 'Micro Empresa'), (3, 'Empresa de Pequeno Porte'), (5, 'Demais') ON CONFLICT DO NOTHING`
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

const BASE = '/v1/carteira/empresas'
let ip = 0
const chamar = (
  metodo: 'get' | 'post',
  cookie: string | undefined,
  url: string,
  corpo?: unknown,
) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](`${BASE}${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.7.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const lista = async (cookie: string, consulta = '') =>
  (await chamar('get', cookie, `${consulta ? `?${consulta}` : ''}`)).body as ListaDeEmpresas
const nomes = (l: ListaDeEmpresas) => l.itens.map((i) => i.nome)

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

async function statusDe(cookie: string) {
  const grupos = (
    await request(app.getHttpServer())
      .get('/v1/configuracoes/tag-grupos')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', cookie)
  ).body as TagGrupo[]
  const todas = grupos.flatMap((g) => g.tags)
  const porNome = (n: string) => (todas.find((t) => t.nome === n) as { id: string }).id
  return {
    lead: porNome('Lead'),
    prospect: porNome('Prospect'),
    cliente: porNome('Cliente'),
    inativo: porNome('Inativo'),
    visitada: porNome('Visitada'),
    contactada: porNome('Contactada'),
  }
}

async function criar(cookie: string, razaoSocial: string, extra: Record<string, unknown> = {}) {
  const r = await chamar('post', cookie, '', { tipoDocumento: 'nenhum', razaoSocial, ...extra })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body as EmpresaCarteira
}
const ajustar = (tenantId: string, id: string, colunas: string) =>
  noTenant(tenantId, async (tx) => {
    await (tx as unknown as { unsafe: (q: string, p: unknown[]) => Promise<unknown> }).unsafe(
      `UPDATE empresas SET ${colunas} WHERE id = $1`,
      [id],
    )
  })

/** Uma atividade pendente de verdade (a FK de `proxima_atividade_id` exige que ela exista) como a próxima da empresa. */
const agendarProxima = (tenantId: string, empresaId: string, dias: number) =>
  noTenant(tenantId, async (tx) => {
    const sql = tx as unknown as {
      unsafe: (q: string, p: unknown[]) => Promise<{ id: string }[]>
    }
    const [a] = await sql.unsafe(
      `INSERT INTO atividades (id, tenant_id, tipo_atividade_id, titulo, empresa_id, responsavel_id, data_inicio)
       SELECT gen_random_uuid(), $1, (SELECT id FROM tipos_atividade WHERE chave_sistema = 'visita'),
              'Próxima', $2, (SELECT vendedor_id FROM empresas WHERE id = $2), now() + make_interval(days => $3)
       RETURNING id`,
      [tenantId, empresaId, dias],
    )
    await sql.unsafe(
      `UPDATE empresas SET proxima_atividade_id = $1, proxima_atividade_em = now() + make_interval(days => $3) WHERE id = $2`,
      [a?.id, empresaId, dias],
    )
  })

/** Equipe: o administrador, um gestor e dois vendedores. */
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
    status: await statusDe(d.cookie),
  }
}

describe('GET /v1/carteira/empresas: acesso e consulta', () => {
  it('sem sessão 401; consulta desconhecida, porPagina acima de 100 e ordem inválida são 400', async () => {
    const { d } = await cenario()
    expect((await chamar('get', undefined, '')).status).toBe(401)
    for (const ruim of [
      'x=1',
      'porPagina=101',
      'pagina=0',
      'ordem=cor',
      'chip=outro',
      'tags=abc',
    ]) {
      const r = await chamar('get', d.cookie, `?${ruim}`)
      expect(r.status, ruim).toBe(400)
      expect((r.body as RespostaDeErro).erro).toBe('validacao_invalida')
    }
    expect((await chamar('get', undefined, '/contagens')).status).toBe(401)
    expect((await chamar('get', undefined, '/opcoes')).status).toBe(401)
  })

  it('lista vazia: total 0, página 1', async () => {
    const { d } = await cenario()
    expect(await lista(d.cookie)).toEqual({ itens: [], total: 0, pagina: 1, porPagina: 25 })
  })
})

describe('regra de carteira na lista', () => {
  it('o vendedor vê só a própria carteira; com "ver todas" vê tudo; gestor e admin sempre veem tudo', async () => {
    const { d, gestor, ana, bia } = await cenario()
    await criar(ana.cookie, 'Da Ana')
    await criar(bia.cookie, 'Da Bia')
    expect(nomes(await lista(ana.cookie))).toEqual(['Da Ana'])
    expect(nomes(await lista(bia.cookie))).toEqual(['Da Bia'])
    expect(nomes(await lista(d.cookie))).toEqual(['Da Ana', 'Da Bia'])
    expect(nomes(await lista(gestor.cookie))).toEqual(['Da Ana', 'Da Bia'])
    expect((await chamar('get', ana.cookie, '/contagens')).body).toMatchObject({
      todas: 1,
      minha: 1,
    })

    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE perfil_permissoes SET alcance = 'todas' WHERE permissao IN ('empresas.ver', 'contatos.ver', 'oportunidades.ver', 'atividades.ver') AND perfil_id IN (SELECT id FROM perfis_acesso WHERE chave_sistema = 'vendedor')`,
    )
    const todas = await lista(ana.cookie)
    expect(nomes(todas)).toEqual(['Da Ana', 'Da Bia'])
    expect(todas.itens.map((i) => i.editavel)).toEqual([true, false]) // vê tudo, edita a própria
    expect((await chamar('get', ana.cookie, '/contagens')).body).toMatchObject({
      todas: 2,
      minha: 1,
    })
  })

  it('não mostra empresa excluída nem de outra empresa do grupo', async () => {
    const { d } = await cenario()
    const e = await criar(d.cookie, 'Vai sair')
    await criar(d.cookie, 'Fica')
    await ajustar(d.tenantId, e.id, 'excluido_em = now()')
    const outro = await novoDono(app)
    await criar(outro.cookie, 'De outra empresa')
    expect(nomes(await lista(d.cookie))).toEqual(['Fica'])
    expect((await chamar('get', d.cookie, '/contagens')).body).toMatchObject({ todas: 1 })
  })
})

describe('busca', () => {
  it('sem acento e sem diferença de caixa, por nome, razão social e cidade', async () => {
    const { d } = await cenario()
    await criar(d.cookie, 'Metalúrgica São João Ltda', {
      nomeFantasia: 'Usinagem Ágil',
      endereco: { municipioCodigo: 3205309 },
    })
    await criar(d.cookie, 'Padaria Central', { endereco: { municipioCodigo: 3201308 } })
    for (const termo of ['metalurgica sao joao', 'SÃO JOÃO', 'usinagem agil', 'ÁGIL', 'metal']) {
      expect(nomes(await lista(d.cookie, `busca=${encodeURIComponent(termo)}`)), termo).toEqual([
        'Usinagem Ágil',
      ])
    }
    expect(nomes(await lista(d.cookie, 'busca=vitoria'))).toEqual(['Usinagem Ágil'])
    expect(nomes(await lista(d.cookie, 'busca=CARIACICA'))).toEqual(['Padaria Central'])
    expect(nomes(await lista(d.cookie, 'busca=nada'))).toEqual([])
  })

  it('pelo CNPJ ou CPF, com ou sem máscara, inteiro ou em pedaço; % e _ valem como texto', async () => {
    const { d } = await cenario()
    await chamar('post', d.cookie, '', {
      tipoDocumento: 'cpf',
      documento: '529.982.247-25',
      razaoSocial: 'Produtor Rural',
    })
    await criar(d.cookie, '100% Tintas')
    await criar(d.cookie, 'Outra')
    for (const termo of ['529.982.247-25', '52998224725', '982247']) {
      expect(nomes(await lista(d.cookie, `busca=${encodeURIComponent(termo)}`)), termo).toEqual([
        'Produtor Rural',
      ])
    }
    expect(nomes(await lista(d.cookie, `busca=${encodeURIComponent('100%')}`))).toEqual([
      '100% Tintas',
    ])
    expect(nomes(await lista(d.cookie, `busca=${encodeURIComponent('%')}`))).toEqual([
      '100% Tintas',
    ])
    expect(nomes(await lista(d.cookie, `busca=${encodeURIComponent('_')}`))).toEqual([])
  })
})

describe('chips e contagens', () => {
  /**
   * A: Cliente, nunca visitada, sem próxima · B: Prospect, visitada há 100 dias, com próxima
   * C: Lead, nunca visitada, sem próxima · D: Cliente, visitada há 10 dias, sem próxima
   * E: Inativo, visitada há 200 dias, sem próxima
   */
  async function carteira() {
    const c = await cenario()
    const { d, status } = c
    const A = await criar(d.cookie, 'A cliente nunca', { statusTagId: status.cliente })
    const B = await criar(d.cookie, 'B prospect antigo', { statusTagId: status.prospect })
    const C = await criar(d.cookie, 'C lead novo')
    const D = await criar(d.cookie, 'D cliente recente', { statusTagId: status.cliente })
    const E = await criar(d.cookie, 'E inativo', { statusTagId: status.inativo })
    await ajustar(d.tenantId, B.id, `ultima_visita_em = now() - interval '100 days'`)
    await agendarProxima(d.tenantId, B.id, 3)
    await ajustar(d.tenantId, D.id, `ultima_visita_em = now() - interval '10 days'`)
    await ajustar(d.tenantId, E.id, `ultima_visita_em = now() - interval '200 days'`)
    return { ...c, A, B, C, D, E }
  }

  it('Cliente e Prospect valem pela chave do sistema: renomear "Cliente" para "Associado" não muda os chips', async () => {
    const { d } = await carteira()
    const status = await statusDe(d.cookie)
    const renomear = await request(app.getHttpServer())
      .patch(`/v1/configuracoes/tags/${status.cliente}`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
      .send({ nome: 'Associado' })
    expect(renomear.status).toBe(200)
    const contagens = (await chamar('get', d.cookie, '/contagens')).body as ContagensDaLista
    expect(contagens).toEqual({
      todas: 5,
      minha: 5,
      semVisita90: 1,
      nuncaVisitadas: 1,
      semProximaAtividade: 2,
    })
  })

  it('contagens: os três últimos chips só consideram Cliente e Prospect, salvo "incluir leads"', async () => {
    const { d } = await carteira()
    const contar = async (extra = '') =>
      (await chamar('get', d.cookie, `/contagens${extra}`)).body as ContagensDaLista
    expect(await contar()).toEqual({
      todas: 5,
      minha: 5,
      semVisita90: 1, // B (E é Inativo)
      nuncaVisitadas: 1, // A (C é Lead)
      semProximaAtividade: 2, // A e D (B tem; C e E fora)
    })
    expect(await contar('?incluirLeads=true')).toEqual({
      todas: 5,
      minha: 5,
      semVisita90: 2, // B e E
      nuncaVisitadas: 2, // A e C
      semProximaAtividade: 4, // A, C, D e E
    })
  })

  it('cada chip filtra a lista do mesmo jeito que a contagem', async () => {
    const { d } = await carteira()
    expect(nomes(await lista(d.cookie, 'chip=todas'))).toHaveLength(5)
    expect(nomes(await lista(d.cookie, 'chip=minha'))).toHaveLength(5)
    expect(nomes(await lista(d.cookie, 'chip=sem_visita_90'))).toEqual(['B prospect antigo'])
    expect(nomes(await lista(d.cookie, 'chip=nunca_visitadas'))).toEqual(['A cliente nunca'])
    expect(nomes(await lista(d.cookie, 'chip=sem_proxima_atividade'))).toEqual([
      'A cliente nunca',
      'D cliente recente',
    ])
    expect(nomes(await lista(d.cookie, 'chip=nunca_visitadas&incluirLeads=true'))).toEqual([
      'A cliente nunca',
      'C lead novo',
    ])
    expect(nomes(await lista(d.cookie, 'chip=sem_visita_90&incluirLeads=true'))).toEqual([
      'B prospect antigo',
      'E inativo',
    ])
  })

  it('"Minha carteira" é a do usuário logado', async () => {
    const { d, ana } = await cenario()
    await criar(ana.cookie, 'Da Ana')
    await criar(d.cookie, 'Do admin')
    expect(nomes(await lista(d.cookie, 'chip=minha'))).toEqual(['Do admin'])
    expect(nomes(await lista(ana.cookie, 'chip=minha'))).toEqual(['Da Ana'])
  })
})

describe('filtros', () => {
  it('tags (todas as pedidas), vendedor, cidade e última visita se somam', async () => {
    const { d, ana, status } = await cenario()
    const A = await criar(d.cookie, 'Alfa', {
      statusTagId: status.cliente,
      endereco: { municipioCodigo: 3205309 },
    })
    const B = await criar(ana.cookie, 'Beta', {
      statusTagId: status.cliente,
      endereco: { municipioCodigo: 3201308 },
    })
    await criar(d.cookie, 'Gama', { statusTagId: status.prospect })
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id) VALUES (${d.tenantId}, ${A.id}, ${status.visitada})`,
    )
    await ajustar(d.tenantId, A.id, `ultima_visita_em = now() - interval '5 days'`)
    await ajustar(d.tenantId, B.id, `ultima_visita_em = now() - interval '70 days'`)

    expect(nomes(await lista(d.cookie, `tags=${status.cliente}`))).toEqual(['Alfa', 'Beta'])
    expect(nomes(await lista(d.cookie, `tags=${status.cliente},${status.visitada}`))).toEqual([
      'Alfa',
    ])
    expect(nomes(await lista(d.cookie, `vendedorId=${ana.membroId}`))).toEqual(['Beta'])
    expect(nomes(await lista(d.cookie, 'municipio=3201308'))).toEqual(['Beta'])
    expect(nomes(await lista(d.cookie, 'ultimaVisita=30'))).toEqual(['Alfa'])
    expect(nomes(await lista(d.cookie, 'ultimaVisita=60'))).toEqual(['Beta', 'Gama']) // 70 dias e nunca
    expect(nomes(await lista(d.cookie, 'ultimaVisita=90'))).toEqual(['Gama'])
    expect(nomes(await lista(d.cookie, 'ultimaVisita=nunca'))).toEqual(['Gama'])
    expect(nomes(await lista(d.cookie, `tags=${status.cliente}&ultimaVisita=60`))).toEqual(['Beta'])
  })

  it('porte e regime tributário; "não informado" do porte inclui quem não tem porte', async () => {
    const { d } = await cenario()
    await criar(d.cookie, 'Micro', { porteCodigo: 1, regimeTributario: 'simples_nacional' })
    await criar(d.cookie, 'Demais', { porteCodigo: 5, regimeTributario: 'lucro_real' })
    await criar(d.cookie, 'Zero', { porteCodigo: 0 })
    await criar(d.cookie, 'Sem porte')

    expect(nomes(await lista(d.cookie, 'porte=1'))).toEqual(['Micro'])
    expect(nomes(await lista(d.cookie, 'porte=5'))).toEqual(['Demais'])
    expect(nomes(await lista(d.cookie, 'porte=0'))).toEqual(['Sem porte', 'Zero'])
    expect(nomes(await lista(d.cookie, 'regimeTributario=lucro_real'))).toEqual(['Demais'])
    expect(nomes(await lista(d.cookie, 'regimeTributario=nao_informado'))).toEqual([
      'Sem porte',
      'Zero',
    ])
    expect(nomes(await lista(d.cookie, 'porte=1&regimeTributario=lucro_real'))).toEqual([])
    expect((await chamar('get', d.cookie, '?regimeTributario=outro')).status).toBe(400)
  })
})

describe('itens, ordem e paginação', () => {
  it('as tags seguem a ordem dos grupos de Configurações > Tags, na lista e na ficha', async () => {
    const { d, status } = await cenario()
    const A = await criar(d.cookie, 'Alfa', { statusTagId: status.cliente })
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id) VALUES (${d.tenantId}, ${A.id}, ${status.visitada})`,
    )
    const tagsDaLista = async () => (await lista(d.cookie)).itens[0]?.tags.map((t) => t.nome)
    const tagsDaFicha = async () =>
      ((await chamar('get', d.cookie, `/${A.id}`)).body as EmpresaCarteira).tags.map((t) => t.nome)
    expect(await tagsDaLista()).toEqual(['Cliente', 'Visitada'])
    expect(await tagsDaFicha()).toEqual(['Cliente', 'Visitada'])

    // Visitação sobe para o topo: as tags dela passam a vir antes
    const grupos = (
      await request(app.getHttpServer())
        .get('/v1/configuracoes/tag-grupos')
        .set('Origin', ORIGEM_DO_FRONT)
        .set('Cookie', d.cookie)
    ).body as TagGrupo[]
    const visitacao = grupos.find((g) => g.tags.some((t) => t.id === status.visitada))
    const ids = [visitacao?.id, ...grupos.filter((g) => g !== visitacao).map((g) => g.id)]
    const r = await request(app.getHttpServer())
      .put('/v1/configuracoes/tag-grupos/ordem')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
      .send({ ids })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await tagsDaLista()).toEqual(['Visitada', 'Cliente'])
    expect(await tagsDaFicha()).toEqual(['Visitada', 'Cliente'])
  })

  it('cada item traz todas as tags, o telefone principal e o endereço para a rota', async () => {
    const { d, status } = await cenario()
    await criar(d.cookie, 'Completa', {
      statusTagId: status.cliente,
      telefones: [{ numero: '2730643021' }, { numero: '27998765432', principal: true }],
      endereco: {
        tipoLogradouro: 'RUA',
        logradouro: 'DAS FLORES',
        numero: '567',
        bairro: 'CENTRO',
        cep: '29100001',
        municipioCodigo: 3205309,
      },
    })
    await criar(d.cookie, 'Sem nada')
    const l = await lista(d.cookie)
    const completa = l.itens.find((i) => i.nome === 'Completa')
    expect(completa).toMatchObject({
      tipoDocumento: 'nenhum',
      cidade: { nome: 'VITORIA', uf: 'ES' },
      telefone: '+5527998765432',
      enderecoParaRota: 'RUA DAS FLORES, 567, CENTRO, VITORIA - ES, 29100001',
      editavel: true,
      situacaoNaoVerificada: false,
      ultimaVisitaEm: null,
    })
    expect(completa?.tags.map((t) => t.nome)).toEqual(['Cliente'])
    const semNada = l.itens.find((i) => i.nome === 'Sem nada')
    expect(semNada).toMatchObject({ telefone: null, enderecoParaRota: null, cidade: null })
  })

  it('ordena por nome sem acento (crescente e decrescente) e por última visita com nunca primeiro', async () => {
    const { d } = await cenario()
    const a = await criar(d.cookie, 'Álamo')
    await criar(d.cookie, 'bola')
    const c = await criar(d.cookie, 'Casa')
    await ajustar(d.tenantId, a.id, `ultima_visita_em = now() - interval '5 days'`)
    await ajustar(d.tenantId, c.id, `ultima_visita_em = now() - interval '50 days'`)
    expect(nomes(await lista(d.cookie))).toEqual(['Álamo', 'bola', 'Casa'])
    expect(nomes(await lista(d.cookie, 'sentido=desc'))).toEqual(['Casa', 'bola', 'Álamo'])
    expect(nomes(await lista(d.cookie, 'ordem=ultima_visita'))).toEqual(['bola', 'Casa', 'Álamo'])
    expect(nomes(await lista(d.cookie, 'ordem=ultima_visita&sentido=desc'))).toEqual([
      'Álamo',
      'Casa',
      'bola',
    ])
  })

  it('pagina: total é de tudo, a página traz só o seu pedaço, e além do fim vem vazia', async () => {
    const { d } = await cenario()
    for (const n of ['E1', 'E2', 'E3', 'E4', 'E5']) await criar(d.cookie, n)
    const p1 = await lista(d.cookie, 'porPagina=2')
    expect(p1).toMatchObject({ total: 5, pagina: 1, porPagina: 2 })
    expect(nomes(p1)).toEqual(['E1', 'E2'])
    expect(nomes(await lista(d.cookie, 'porPagina=2&pagina=3'))).toEqual(['E5'])
    const alem = await lista(d.cookie, 'porPagina=2&pagina=9')
    expect(alem).toMatchObject({ itens: [], total: 5 })
  })
})

describe('GET /v1/carteira/empresas/opcoes', () => {
  it('um único membro: unicoMembro true (o front esconde Vendedor e "Minha carteira")', async () => {
    const d = await novoDono(app)
    const r = (await chamar('get', d.cookie, '/opcoes')).body as OpcoesDaLista
    expect(r).toMatchObject({ unicoMembro: true, cidades: [], diasAlertaDeContato: 60 })
    expect(r.vendedores).toHaveLength(1)
  })

  it('equipe com mais gente: lista os membros ativos e só as cidades das empresas visíveis', async () => {
    const { d, ana, bia } = await cenario()
    await criar(ana.cookie, 'Da Ana', { endereco: { municipioCodigo: 3205309 } })
    await criar(bia.cookie, 'Da Bia', { endereco: { municipioCodigo: 3201308 } })
    const admin = (await chamar('get', d.cookie, '/opcoes')).body as OpcoesDaLista
    expect(admin.unicoMembro).toBe(false)
    expect(admin.vendedores.map((v) => v.nome).sort()).toEqual(
      ['Ana', 'Bia', 'Dono de Teste', 'Gestor'].sort(),
    )
    expect(admin.cidades.map((c) => c.nome)).toEqual(['CARIACICA', 'VITORIA'])
    const daAna = (await chamar('get', ana.cookie, '/opcoes')).body as OpcoesDaLista
    expect(daAna.cidades.map((c) => c.nome)).toEqual(['VITORIA'])

    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE tenant_configuracoes SET dias_sem_contato_alerta = 45`,
    )
    expect(
      ((await chamar('get', d.cookie, '/opcoes')).body as OpcoesDaLista).diasAlertaDeContato,
    ).toBe(45)
  })
})
