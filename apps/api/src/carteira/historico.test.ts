import type { Server } from 'node:http'

import type { EmpresaCarteira, HistoricoDaEmpresa, Tag, TagGrupo } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'VITORIA', 'ES') ON CONFLICT DO NOTHING`
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

type Metodo = 'get' | 'post' | 'put' | 'patch'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.5.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const EMPRESAS = '/v1/carteira/empresas'
const historico = async (cookie: string, id: string, consulta = '') =>
  (await chamar('get', cookie, `${EMPRESAS}/${id}/historico${consulta}`)).body as HistoricoDaEmpresa

async function cenario() {
  const d = await novoDono(app)
  const u = await usuarioSimples(app)
  const anaId = await vincular(d.tenantId, u.id, 'vendedor', 'Ana Vendedora')
  await ativar(u.id, d.tenantId)
  const grupos = (await chamar('get', d.cookie, '/v1/configuracoes/tag-grupos')).body as TagGrupo[]
  const tag = (nome: string) => grupos.flatMap((g) => g.tags).find((t) => t.nome === nome) as Tag
  const vertical = (
    await chamar('post', d.cookie, '/v1/configuracoes/verticais', { nome: 'Metalmecânica' })
  ).body as { id: string }
  return { d, ana: { ...u, membroId: anaId }, tag, vertical }
}

describe('GET /v1/carteira/empresas/:id/historico', () => {
  it('conta a vida da empresa em português, do mais recente ao mais antigo, com nomes e não ids', async () => {
    const { d, ana, tag, vertical } = await cenario()
    const criada = (
      await chamar('post', d.cookie, EMPRESAS, {
        tipoDocumento: 'cpf',
        documento: '529.982.247-25',
        razaoSocial: 'Produtor Rural',
        observacoes: 'antiga',
      })
    ).body as EmpresaCarteira
    await chamar('patch', d.cookie, `${EMPRESAS}/${criada.id}`, {
      razaoSocial: 'Produtor Rural Ltda',
      mei: true,
      dataInicioAtividades: '2015-03-10',
      regimeTributario: 'simples_nacional',
      verticalId: vertical.id,
      observacoes: null,
      endereco: { municipioCodigo: 3205309 },
      telefones: [{ numero: '2730643021' }],
    })
    await chamar('patch', d.cookie, `${EMPRESAS}/${criada.id}`, { vendedorId: ana.membroId })
    await chamar('put', d.cookie, `${EMPRESAS}/${criada.id}/tags`, { tagIds: [tag('Cliente').id] })

    const h = await historico(d.cookie, criada.id)
    expect(h).toMatchObject({ total: 4, pagina: 1, porPagina: 20 })
    expect(h.itens.map((i) => i.titulo)).toEqual([
      'Tags alteradas',
      'Carteira transferida',
      'Dados alterados',
      'Empresa cadastrada',
    ])
    expect(h.itens.every((i) => i.por.nome === 'Dono de Teste' && !i.automatica)).toBe(true)

    const [tags, carteira, dados, cadastro] = h.itens
    expect(tags?.mudancas).toEqual([
      { campo: 'adicionadas', rotulo: 'Tags adicionadas', de: null, para: 'Cliente' },
      { campo: 'removidas', rotulo: 'Tags removidas', de: 'Lead', para: null },
    ])
    expect(carteira?.mudancas).toEqual([
      { campo: 'vendedorId', rotulo: 'Vendedor', de: 'Dono de Teste', para: 'Ana Vendedora' },
    ])
    const campo = (c: string) => dados?.mudancas.find((m) => m.campo === c)
    expect(campo('razaoSocial')).toMatchObject({
      rotulo: 'Razão social',
      de: 'Produtor Rural',
      para: 'Produtor Rural Ltda',
    })
    expect(campo('mei')).toMatchObject({ rotulo: 'MEI', de: 'Não', para: 'Sim' })
    expect(campo('dataInicioAtividades')).toMatchObject({ de: null, para: '10/03/2015' })
    expect(campo('regimeTributario')).toMatchObject({ para: 'Simples Nacional' })
    expect(campo('verticalId')).toMatchObject({
      rotulo: 'Vertical',
      de: null,
      para: 'Metalmecânica',
    })
    expect(campo('observacoes')).toMatchObject({ de: 'antiga', para: null })
    expect(campo('municipioCodigo')).toMatchObject({ rotulo: 'Cidade', para: 'VITORIA/ES' })
    expect(campo('telefones')).toMatchObject({ de: null, para: '(27) 3064-3021' })
    expect(JSON.stringify(dados)).not.toContain(vertical.id)
    expect(cadastro?.mudancas).toEqual([
      { campo: 'documento', rotulo: 'Documento', de: null, para: '529.982.247-25' },
      { campo: 'vendedorId', rotulo: 'Vendedor', de: null, para: 'Dono de Teste' },
      { campo: 'origemCadastro', rotulo: 'Origem do cadastro', de: null, para: 'Manual' },
    ])
  })

  it('o que o sistema fez sozinho aparece como "Sistema" (tag automática)', async () => {
    const { d, tag } = await cenario()
    const e = (
      await chamar('post', d.cookie, EMPRESAS, {
        tipoDocumento: 'nenhum',
        razaoSocial: 'Loja do Zé',
      })
    ).body as EmpresaCarteira
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`INSERT INTO empresa_tags_historico (id, tenant_id, empresa_id, tag_id, acao, por, automatica)
        VALUES (gen_random_uuid(), ${d.tenantId}, ${e.id}, ${tag('Visitada').id}, 'adicionada', NULL, true)`
    })
    const h = await historico(d.cookie, e.id)
    expect(h.itens.map((i) => i.titulo)).toEqual([
      'Tag Visitada aplicada pelo sistema',
      'Empresa cadastrada',
    ])
    expect(h.itens[0]).toMatchObject({ por: { id: null, nome: 'Sistema' }, automatica: true })
    // o Status inicial (manual) não aparece duas vezes: a auditoria já o cobre
    expect(h.total).toBe(2)
  })

  it('pagina e devolve vazio além do fim', async () => {
    const { d } = await cenario()
    const e = (
      await chamar('post', d.cookie, EMPRESAS, {
        tipoDocumento: 'nenhum',
        razaoSocial: 'Loja do Zé',
      })
    ).body as EmpresaCarteira
    for (const site of ['https://a.com', 'https://b.com', 'https://c.com']) {
      await chamar('patch', d.cookie, `${EMPRESAS}/${e.id}`, { website: site })
    }
    const p1 = await historico(d.cookie, e.id, '?porPagina=2')
    expect(p1).toMatchObject({ total: 4, pagina: 1, porPagina: 2 })
    expect(p1.itens.map((i) => i.mudancas[0]?.para)).toEqual(['https://c.com', 'https://b.com'])
    const p2 = await historico(d.cookie, e.id, '?porPagina=2&pagina=2')
    expect(p2.itens.map((i) => i.titulo)).toEqual(['Dados alterados', 'Empresa cadastrada'])
    expect((await historico(d.cookie, e.id, '?porPagina=2&pagina=9')).itens).toEqual([])
  })

  it('segue a regra de carteira: sem sessão 401, empresa de outro vendedor ou de outra empresa 404, consulta ruim 400', async () => {
    const { d, ana } = await cenario()
    const daAdmin = (
      await chamar('post', d.cookie, EMPRESAS, { tipoDocumento: 'nenhum', razaoSocial: 'Do admin' })
    ).body as EmpresaCarteira
    expect((await chamar('get', undefined, `${EMPRESAS}/${daAdmin.id}/historico`)).status).toBe(401)
    expect((await chamar('get', ana.cookie, `${EMPRESAS}/${daAdmin.id}/historico`)).status).toBe(
      404,
    )
    const outro = await novoDono(app)
    expect((await chamar('get', outro.cookie, `${EMPRESAS}/${daAdmin.id}/historico`)).status).toBe(
      404,
    )
    expect(
      (await chamar('get', d.cookie, `${EMPRESAS}/${daAdmin.id}/historico?porPagina=101`)).status,
    ).toBe(400)
    expect((await chamar('get', d.cookie, `${EMPRESAS}/nao-e-uuid/historico`)).status).toBe(400)
  })
})
