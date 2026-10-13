import type { Server } from 'node:http'

import { completarCnpj, type EmpresaCarteira, type TagGrupo } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import {
  respostaDaReceita,
  type ServidorFalso,
  subirServidorFalso,
} from '../receita/servidor-falso.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import {
  ativar,
  auditoriaDe,
  dono,
  empresaDeOutraConta,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const usados: string[] = []
afterAll(async () => {
  if (usados.length > 0) await dono`DELETE FROM receita_consultas WHERE cnpj = ANY(${usados})`
  await valkey.quit()
  await dono.end()
})

/** As tabelas de referência vêm vazias no banco de teste: só o que estes testes usam. */
beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'VITORIA', 'ES') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO portes (codigo, descricao) VALUES (3, 'Empresa de Pequeno Porte') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO qualificacoes_socio (codigo, descricao) VALUES (49, 'Sócio-Administrador') ON CONFLICT DO NOTHING`
  await dono`
    INSERT INTO cnaes (codigo, descricao, secao, divisao, grupo, classe)
    VALUES (2539001, 'Serviços de usinagem, tornearia e solda', 'C', '25', '253', '25390')
    ON CONFLICT DO NOTHING`
})

let app: INestApplication<Server>
let primaria: ServidorFalso
let alternativa: ServidorFalso
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  primaria = await subirServidorFalso({ status: 200 })
  alternativa = await subirServidorFalso({ status: 200 })
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({
      TRUST_PROXY: '1',
      MINHA_RECEITA_URL: primaria.url,
      BRASILAPI_URL: alternativa.url,
      RECEITA_TIMEOUT_MS: '700',
    }),
  )
})
afterEach(async () => {
  await app.close()
  await primaria.fechar()
  await alternativa.fechar()
})

/** CNPJ novo a cada chamada (o cache da Receita persiste no banco de teste). */
let seq = 0
function cnpjNovo(ordem = '0001', raiz?: string): string {
  seq += 1
  const base =
    raiz ??
    `E${Date.now().toString(36).slice(-5).toUpperCase()}${String(seq).padStart(2, '0')}`
      .replace(/[^0-9A-Z]/g, '0')
      .padEnd(8, '0')
      .slice(0, 8)
  const cnpj = completarCnpj(`${base}${ordem}`)
  usados.push(cnpj)
  return cnpj
}
/** A Receita (falsa) responde esta empresa; extra muda campos do JSON. */
const receitaTem = (cnpj: string, extra: Record<string, unknown> = {}) =>
  primaria.responder((caminho) =>
    caminho === `/${cnpj}`
      ? { status: 200, corpo: respostaDaReceita(cnpj, extra) }
      : { status: 404, corpo: {} },
  )

const BASE = '/v1/carteira/empresas'
type Metodo = 'get' | 'post' | 'patch' | 'delete'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1 // um IP por chamada: o limite de cadastros por minuto é por IP
  let r = request(app.getHttpServer())
    [metodo](`${BASE}${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.8.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const empresaDe = (r: request.Response) => r.body as EmpresaCarteira

/** Como o front monta o cadastro por CNPJ depois de consultar a Receita. */
const porCnpj = (cnpj: string, extra: Record<string, unknown> = {}) => ({
  tipoDocumento: 'cnpj',
  documento: cnpj,
  razaoSocial: 'METALURGICA EXEMPLO LTDA',
  nomeFantasia: 'EXEMPLO USINAGEM',
  telefones: [{ numero: '2730643021' }],
  cnaes: { principal: 2539001, secundarios: [2543800] },
  endereco: { cep: '29100001', logradouro: 'DAS FLORES', municipioCodigo: 3205309 },
  ...extra,
})
const semDocumento = (razaoSocial: string, extra: Record<string, unknown> = {}) => ({
  tipoDocumento: 'nenhum',
  razaoSocial,
  ...extra,
})

const membroDe = async (tenantId: string, usuarioId: string): Promise<string> => {
  const [m] = await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${usuarioId}`
  })
  return (m as { id: string }).id
}
const configurar = (tenantId: string, coluna: string, valor: boolean) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    await tx.unsafe(`UPDATE tenant_configuracoes SET ${coluna} = ${valor} WHERE tenant_id = $1`, [
      tenantId,
    ])
  })
const eventosDe = (tenantId: string, empresaId: string) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return tx<{ tipo: string; payload: { tentativa: number } }[]>`
      SELECT tipo, payload FROM eventos_outbox WHERE entidade_id = ${empresaId}`
  })

/** Empresa com o administrador, um gestor e dois vendedores (cada um com a própria carteira). */
async function cenario() {
  const d = await novoDono(app)
  const adminId = await membroDe(d.tenantId, d.usuarioId)
  const pessoa = async (papel: 'gestor' | 'vendedor') => {
    const u = await usuarioSimples(app)
    const membroId = await vincular(d.tenantId, u.id, papel, `Pessoa ${papel}`)
    await ativar(u.id, d.tenantId)
    return { ...u, membroId }
  }
  return {
    d,
    adminId,
    gestor: await pessoa('gestor'),
    ana: await pessoa('vendedor'),
    bia: await pessoa('vendedor'),
  }
}

describe('POST /v1/carteira/empresas: cadastro por CNPJ', () => {
  it('sem sessão 401; cria com os dados da Receita, Status Lead, telefone E.164 e auditoria', async () => {
    const { d, adminId } = await cenario()
    const cnpj = cnpjNovo()
    receitaTem(cnpj)
    expect((await chamar('post', undefined, '', porCnpj(cnpj))).status).toBe(401)

    const r = await chamar('post', d.cookie, '', porCnpj(cnpj))
    expect(r.status).toBe(201)
    const e = empresaDe(r)
    expect(e).toMatchObject({
      tipoDocumento: 'cnpj',
      documento: cnpj,
      matrizFilial: 'matriz',
      razaoSocial: 'METALURGICA EXEMPLO LTDA',
      nome: 'EXEMPLO USINAGEM',
      origemCadastro: 'receita',
      situacaoNaoVerificada: false,
      vendedor: { id: adminId },
      receita: { situacao: 'ATIVA', ativa: true },
      endereco: { cep: '29100001', municipio: { nome: 'VITORIA', uf: 'ES' } },
      permissoes: { editar: true, excluir: true, transferir: true },
    })
    expect(e.receitaAtualizadoEm).toBeTruthy()
    expect(e.telefones).toMatchObject([{ e164: '+552730643021', tipo: 'fixo', principal: true }])
    expect(e.cnaes).toMatchObject([
      { codigo: 2539001, principal: true },
      { codigo: 2543800, principal: false },
    ])
    expect(e.socios.map((x) => [x.nome, x.qualificacao])).toEqual([
      ['FULANO DE TAL', 'Sócio-Administrador'],
    ])
    expect(e.tags.map((t) => t.nome)).toEqual(['Lead'])
    expect(JSON.stringify(e)).not.toContain('***123456**') // CPF mascarado do sócio nunca é guardado

    const [reg] = (await auditoriaDe(d.tenantId)).filter((a) => a.entidade === 'empresa')
    expect(reg).toMatchObject({ acao: 'criar', entidade_id: e.id, membro_id: adminId })
    const [hist] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx`SELECT acao, por FROM empresa_tags_historico WHERE empresa_id = ${e.id}`
    })
    expect(hist).toEqual({ acao: 'adicionada', por: adminId })
  })

  it('aceita CNPJ com máscara; recusa dígito errado sem chamar a Receita', async () => {
    const { d } = await cenario()
    const cnpj = cnpjNovo()
    receitaTem(cnpj)
    const mascarado = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
    expect((await chamar('post', d.cookie, '', porCnpj(mascarado))).status).toBe(201)
    const ruim = await chamar('post', d.cookie, '', porCnpj('11222333000100'))
    expect(ruim.status).toBe(400)
    expect(erroDe(ruim)).toBe('validacao_invalida')
    expect(primaria.chamadas).toHaveLength(1)
  })

  it('CNPJ que a Receita não conhece: 404 cnpj_nao_encontrado e nada é gravado', async () => {
    const { d } = await cenario()
    const cnpj = cnpjNovo()
    primaria.responder({ status: 404, corpo: {} })
    const r = await chamar('post', d.cookie, '', porCnpj(cnpj))
    expect(r.status).toBe(404)
    expect(erroDe(r)).toBe('cnpj_nao_encontrado')
  })

  it('CNAE novo vem da Receita e é registrado; CNAE desconhecido sem a Receita é 400', async () => {
    const { d } = await cenario()
    const cnpj = cnpjNovo()
    receitaTem(cnpj, {
      cnae_fiscal: 6204000,
      cnaes_secundarios: [{ codigo: 9999999, descricao: 'Atividade inventada pela Receita' }],
    })
    const r = await chamar(
      'post',
      d.cookie,
      '',
      porCnpj(cnpj, { cnaes: { principal: 6204000, secundarios: [9999999] } }),
    )
    // 9999999 está na faixa do CNAE, mas a divisão 99 existe (seção U): registra
    expect(r.status).toBe(201)
    expect(empresaDe(r).cnaes.map((c) => c.codigo)).toEqual([6204000, 9999999])

    const outra = cnpjNovo()
    receitaTem(outra)
    const semReceita = await chamar(
      'post',
      d.cookie,
      '',
      porCnpj(outra, { cnaes: { principal: 2539001, secundarios: [1234567] } }),
    )
    expect(semReceita.status).toBe(400)
    expect(erroDe(semReceita)).toBe('cnae_desconhecido')
  })
})

describe('bloqueio de empresa não ativa', () => {
  const baixada = { situacao_cadastral: 8, descricao_situacao_cadastral: 'BAIXADA' }

  it('ligado (padrão): recusa baixada com 409 empresa_nao_ativa e não grava nada', async () => {
    const { d } = await cenario()
    const cnpj = cnpjNovo()
    receitaTem(cnpj, { ...baixada, descricao_motivo_situacao_cadastral: 'EXTINCAO' })
    const r = await chamar('post', d.cookie, '', porCnpj(cnpj))
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('empresa_nao_ativa')
    expect((r.body as RespostaDeErro).mensagem).toContain('BAIXADA')
    const [contagem] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<{ n: number }[]>`SELECT count(*)::int AS n FROM empresas`
    })
    expect(contagem?.n).toBe(0)
  })

  it.each([
    [3, 'SUSPENSA'],
    [4, 'INAPTA'],
    [1, 'NULA'],
  ])('recusa também a situação %i (%s)', async (codigo, descricao) => {
    const { d } = await cenario()
    const cnpj = cnpjNovo()
    receitaTem(cnpj, { situacao_cadastral: codigo, descricao_situacao_cadastral: descricao })
    expect(erroDe(await chamar('post', d.cookie, '', porCnpj(cnpj)))).toBe('empresa_nao_ativa')
  })

  it('desligado na empresa: cadastra a baixada, e a ficha mostra a situação', async () => {
    const { d } = await cenario()
    await configurar(d.tenantId, 'bloquear_empresa_nao_ativa', false)
    const cnpj = cnpjNovo()
    receitaTem(cnpj, baixada)
    const r = await chamar('post', d.cookie, '', porCnpj(cnpj))
    expect(r.status).toBe(201)
    expect(empresaDe(r).receita).toMatchObject({ situacao: 'BAIXADA', ativa: false })
  })

  it('CPF e sem documento não passam pela Receita nem pelo bloqueio', async () => {
    const { d } = await cenario()
    const cpf = await chamar('post', d.cookie, '', {
      tipoDocumento: 'cpf',
      documento: '529.982.247-25',
      razaoSocial: 'Ana Produtora Rural',
    })
    expect(cpf.status).toBe(201)
    expect(empresaDe(cpf)).toMatchObject({
      tipoDocumento: 'cpf',
      documento: '52998224725',
      matrizFilial: null,
      receita: null,
    })
    const nenhum = await chamar('post', d.cookie, '', semDocumento('Loja do Zé'))
    expect(nenhum.status).toBe(201)
    expect(empresaDe(nenhum).documento).toBeNull()
    expect(primaria.chamadas).toHaveLength(0)
  })

  it('Receita fora do ar: salva com o selo "situação não verificada" e agenda a reconsulta', async () => {
    const { d } = await cenario()
    const cnpj = cnpjNovo()
    primaria.responder({ status: 503, corpo: {} })
    alternativa.responder({ status: 503, corpo: {} })
    const r = await chamar(
      'post',
      d.cookie,
      '',
      porCnpj(cnpj, { cnaes: { principal: null, secundarios: [] } }),
    )
    expect(r.status).toBe(201)
    const e = empresaDe(r)
    expect(e).toMatchObject({
      situacaoNaoVerificada: true,
      origemCadastro: 'manual',
      receita: null,
      receitaAtualizadoEm: null,
      socios: [],
    })
    const eventos = await eventosDe(d.tenantId, e.id)
    expect(eventos).toEqual([
      { tipo: 'empresa.verificar_situacao', payload: { empresaId: e.id, tentativa: 1 } },
    ])
  })
})

describe('duplicado', () => {
  it('mesmo CNPJ na carteira: 409 empresa_ja_cadastrada com a empresa existente', async () => {
    const { d } = await cenario()
    const cnpj = cnpjNovo()
    receitaTem(cnpj)
    const primeira = empresaDe(await chamar('post', d.cookie, '', porCnpj(cnpj)))
    const r = await chamar('post', d.cookie, '', porCnpj(cnpj))
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('empresa_ja_cadastrada')
    expect((r.body as RespostaDeErro).dados).toEqual({
      existente: { visivel: true, id: primeira.id, nome: 'EXEMPLO USINAGEM' },
    })
  })

  it('o vendedor que não vê a empresa do outro recebe o 409 sem id nem nome', async () => {
    const { d, ana, bia } = await cenario()
    const cnpj = cnpjNovo()
    receitaTem(cnpj)
    expect((await chamar('post', ana.cookie, '', porCnpj(cnpj))).status).toBe(201)
    const r = await chamar('post', bia.cookie, '', porCnpj(cnpj))
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('empresa_ja_cadastrada')
    expect((r.body as RespostaDeErro).dados).toEqual({ existente: { visivel: false } })
    expect(JSON.stringify(r.body)).not.toContain('EXEMPLO')
    expect(d.tenantId).toBeTruthy()
  })

  it('CNPJ de empresa excluída pode ser cadastrado de novo; o mesmo CNPJ em outra empresa do grupo também', async () => {
    const { d } = await cenario()
    const cnpj = cnpjNovo()
    receitaTem(cnpj)
    const e = empresaDe(await chamar('post', d.cookie, '', porCnpj(cnpj)))
    expect((await chamar('delete', d.cookie, `/${e.id}`)).status).toBe(204)
    expect((await chamar('post', d.cookie, '', porCnpj(cnpj))).status).toBe(201)

    const outro = await novoDono(app)
    expect((await chamar('post', outro.cookie, '', porCnpj(cnpj))).status).toBe(201)
  })
})

describe('matriz e filial', () => {
  it('a filial cadastrada depois liga à matriz; a matriz cadastrada depois liga as filiais soltas', async () => {
    const { d } = await cenario()
    const matrizCnpj = cnpjNovo('0001')
    const raiz = matrizCnpj.slice(0, 8)
    const filialCnpj = cnpjNovo('0002', raiz)
    const outraFilialCnpj = cnpjNovo('0003', raiz)
    receitaTem(matrizCnpj)
    primaria.responder((caminho) => {
      const cnpj = caminho.slice(1)
      return { status: 200, corpo: respostaDaReceita(cnpj) }
    })

    // filiais primeiro: ficam soltas
    const f1 = empresaDe(await chamar('post', d.cookie, '', porCnpj(filialCnpj)))
    expect(f1).toMatchObject({ matrizFilial: 'filial', matriz: null })
    const matriz = empresaDe(await chamar('post', d.cookie, '', porCnpj(matrizCnpj)))
    expect(matriz.filiais.map((f) => f.documento)).toEqual([filialCnpj])
    expect((await chamar('get', d.cookie, `/${f1.id}`)).body).toMatchObject({
      matriz: { id: matriz.id },
    })

    // filial depois da matriz: liga direto
    const f2 = empresaDe(await chamar('post', d.cookie, '', porCnpj(outraFilialCnpj)))
    expect(f2.matriz?.id).toBe(matriz.id)
    const atualizada = empresaDe(await chamar('get', d.cookie, `/${matriz.id}`))
    expect(atualizada.filiais.map((f) => f.documento)).toEqual([filialCnpj, outraFilialCnpj])
    expect(atualizada.matrizFilial).toBe('matriz')
  })

  it('excluir a matriz solta as filiais; o vendedor só vê as filiais da própria carteira', async () => {
    const { d, ana, bia } = await cenario()
    const matrizCnpj = cnpjNovo('0001')
    const raiz = matrizCnpj.slice(0, 8)
    const filialCnpj = cnpjNovo('0002', raiz)
    primaria.responder((caminho) => ({ status: 200, corpo: respostaDaReceita(caminho.slice(1)) }))
    const matriz = empresaDe(
      await chamar('post', d.cookie, '', porCnpj(matrizCnpj, { vendedorId: ana.membroId })),
    )
    const filial = empresaDe(await chamar('post', bia.cookie, '', porCnpj(filialCnpj)))
    expect(filial.matriz).toBeNull() // a Bia não vê a matriz da Ana, mas o vínculo existe
    expect(empresaDe(await chamar('get', ana.cookie, `/${matriz.id}`)).filiais).toEqual([])
    expect(empresaDe(await chamar('get', d.cookie, `/${matriz.id}`)).filiais).toHaveLength(1)

    expect((await chamar('delete', d.cookie, `/${matriz.id}`)).status).toBe(204)
    expect(empresaDe(await chamar('get', d.cookie, `/${filial.id}`)).matriz).toBeNull()
  })
})

describe('regra de carteira por papel', () => {
  it('vendedor cadastra na própria carteira e não em nome de outro; admin e gestor escolhem', async () => {
    const { d, ana, bia, gestor } = await cenario()
    const propria = empresaDe(await chamar('post', ana.cookie, '', semDocumento('Da Ana')))
    expect(propria.vendedor.id).toBe(ana.membroId)
    const emNomeDeOutro = await chamar(
      'post',
      ana.cookie,
      '',
      semDocumento('Da Bia', { vendedorId: bia.membroId }),
    )
    expect(emNomeDeOutro.status).toBe(403)
    expect(erroDe(emNomeDeOutro)).toBe('acesso_negado')
    for (const quem of [d, gestor]) {
      const r = await chamar(
        'post',
        quem.cookie,
        '',
        semDocumento(`Para a Bia ${quem.cookie.length}`, { vendedorId: bia.membroId }),
      )
      expect(r.status).toBe(201)
      expect(empresaDe(r).vendedor.id).toBe(bia.membroId)
    }
  })

  it('vendedor não vê a empresa de outro (404); com "ver todas" vê, mas não edita', async () => {
    const { d, ana, bia, gestor } = await cenario()
    const daAna = empresaDe(await chamar('post', ana.cookie, '', semDocumento('Da Ana')))
    expect((await chamar('get', bia.cookie, `/${daAna.id}`)).status).toBe(404)
    expect(erroDe(await chamar('get', bia.cookie, `/${daAna.id}`))).toBe('empresa_nao_encontrada')
    expect(
      (await chamar('patch', bia.cookie, `/${daAna.id}`, { website: 'https://x.com' })).status,
    ).toBe(404)
    expect((await chamar('delete', bia.cookie, `/${daAna.id}`)).status).toBe(404)
    for (const quem of [d, gestor, ana]) {
      expect((await chamar('get', quem.cookie, `/${daAna.id}`)).status).toBe(200)
    }

    await configurar(d.tenantId, 'vendedor_ve_todas_empresas', true)
    const vista = await chamar('get', bia.cookie, `/${daAna.id}`)
    expect(vista.status).toBe(200)
    expect(empresaDe(vista).permissoes).toEqual({
      editar: false,
      excluir: false,
      transferir: false,
    })
    const edicao = await chamar('patch', bia.cookie, `/${daAna.id}`, { website: 'https://x.com' })
    expect(edicao.status).toBe(403)
    expect(erroDe(edicao)).toBe('acesso_negado')
    expect((await chamar('delete', bia.cookie, `/${daAna.id}`)).status).toBe(403)
  })

  it('só gestor e admin passam a carteira e excluem; o vendedor edita a própria', async () => {
    const { d, ana, bia, gestor } = await cenario()
    const e = empresaDe(await chamar('post', ana.cookie, '', semDocumento('Da Ana')))
    const proprio = await chamar('patch', ana.cookie, `/${e.id}`, { website: 'https://ana.com.br' })
    expect(proprio.status).toBe(200)
    expect(empresaDe(proprio).website).toBe('https://ana.com.br')
    expect(
      (await chamar('patch', ana.cookie, `/${e.id}`, { vendedorId: bia.membroId })).status,
    ).toBe(403)
    expect((await chamar('delete', ana.cookie, `/${e.id}`)).status).toBe(403)

    const passou = await chamar('patch', gestor.cookie, `/${e.id}`, { vendedorId: bia.membroId })
    expect(passou.status).toBe(200)
    expect(empresaDe(passou).vendedor.id).toBe(bia.membroId)
    expect((await chamar('get', ana.cookie, `/${e.id}`)).status).toBe(404) // saiu da carteira da Ana
    expect((await chamar('delete', d.cookie, `/${e.id}`)).status).toBe(204)
  })

  it('vendedor inexistente ou de outra empresa é recusado (400 vendedor_invalido)', async () => {
    const { d } = await cenario()
    const outra = await empresaDeOutraConta()
    const membroDeFora = await vincular(outra.tenantId, (await usuarioSimples(app)).id, 'vendedor')
    for (const vendedorId of [membroDeFora, '0199a000-0000-7000-8000-000000000001']) {
      const r = await chamar('post', d.cookie, '', semDocumento('Sem dono', { vendedorId }))
      expect(r.status).toBe(400)
      expect(erroDe(r)).toBe('vendedor_invalido')
    }
  })
})

describe('GET /v1/carteira/empresas/:id', () => {
  it('sem sessão 401; id que não é UUID 400; inexistente 404', async () => {
    const { d } = await cenario()
    expect((await chamar('get', undefined, '/0199a000-0000-7000-8000-000000000001')).status).toBe(
      401,
    )
    expect((await chamar('get', d.cookie, '/abc')).status).toBe(400)
    expect((await chamar('get', d.cookie, '/0199a000-0000-7000-8000-000000000001')).status).toBe(
      404,
    )
  })

  it('empresa de outra empresa do grupo é 404 (isolamento)', async () => {
    const { d } = await cenario()
    const e = empresaDe(await chamar('post', d.cookie, '', semDocumento('Isolada')))
    const outro = await novoDono(app)
    expect((await chamar('get', outro.cookie, `/${e.id}`)).status).toBe(404)
    expect(
      (await chamar('patch', outro.cookie, `/${e.id}`, { website: 'https://x.com' })).status,
    ).toBe(404)
    expect((await chamar('delete', outro.cookie, `/${e.id}`)).status).toBe(404)
  })
})

describe('PATCH /v1/carteira/empresas/:id', () => {
  it('muda só o que veio, registra o antes e o depois, e corpo vazio ou com documento é 400', async () => {
    const { d, adminId } = await cenario()
    const e = empresaDe(
      await chamar('post', d.cookie, '', semDocumento('Loja do Zé', { observacoes: 'antiga' })),
    )
    expect((await chamar('patch', d.cookie, `/${e.id}`, {})).status).toBe(400)
    expect((await chamar('patch', d.cookie, `/${e.id}`, { documento: '52998224725' })).status).toBe(
      400,
    )
    const r = await chamar('patch', d.cookie, `/${e.id}`, {
      razaoSocial: 'Loja do José Ltda',
      observacoes: null,
      website: 'https://loja.com.br',
    })
    expect(r.status).toBe(200)
    expect(empresaDe(r)).toMatchObject({
      razaoSocial: 'Loja do José Ltda',
      nome: 'Loja do José Ltda',
      observacoes: null,
      website: 'https://loja.com.br',
    })
    const registros = (await auditoriaDe(d.tenantId)).filter((a) => a.acao === 'alterar')
    expect(registros).toHaveLength(1)
    expect(registros[0]).toMatchObject({
      entidade: 'empresa',
      entidade_id: e.id,
      membro_id: adminId,
      alteracoes: {
        razaoSocial: { de: 'Loja do Zé', para: 'Loja do José Ltda' },
        observacoes: { de: 'antiga', para: null },
        website: { de: null, para: 'https://loja.com.br' },
      },
    })
  })

  it('sem mudança real não grava auditoria', async () => {
    const { d } = await cenario()
    const e = empresaDe(await chamar('post', d.cookie, '', semDocumento('Loja do Zé')))
    expect(
      (await chamar('patch', d.cookie, `/${e.id}`, { razaoSocial: 'Loja do Zé' })).status,
    ).toBe(200)
    expect((await auditoriaDe(d.tenantId)).filter((a) => a.acao === 'alterar')).toHaveLength(0)
  })

  it('telefones: normaliza para E.164, tira repetido, mantém um principal e recusa número inválido', async () => {
    const { d } = await cenario()
    const e = empresaDe(await chamar('post', d.cookie, '', semDocumento('Loja do Zé')))
    const r = await chamar('patch', d.cookie, `/${e.id}`, {
      telefones: [
        { numero: '(27) 3064-3021' },
        { numero: '+55 27 99876-5432', tipo: 'whatsapp', principal: true },
        { numero: '27 3064 3021' }, // repetido do primeiro
      ],
    })
    expect(r.status).toBe(200)
    expect(empresaDe(r).telefones).toMatchObject([
      { e164: '+552730643021', tipo: 'fixo', principal: false },
      { e164: '+5527998765432', tipo: 'whatsapp', principal: true },
    ])
    const ruim = await chamar('patch', d.cookie, `/${e.id}`, { telefones: [{ numero: '123' }] })
    expect(ruim.status).toBe(400)
    expect((ruim.body as RespostaDeErro).detalhes).toEqual([
      { campo: 'telefones.0.numero', mensagem: 'telefone inválido' },
    ])
    const limpa = await chamar('patch', d.cookie, `/${e.id}`, { telefones: [] })
    expect(empresaDe(limpa).telefones).toEqual([])
    const [alteracao] = (await auditoriaDe(d.tenantId)).filter((a) => a.acao === 'alterar')
    expect(alteracao?.alteracoes).toMatchObject({
      telefones: { de: [], para: ['+552730643021', '+5527998765432'] },
    })
  })

  it('vertical: precisa existir e estar ativa; null limpa; endereço substitui o todo', async () => {
    const { d } = await cenario()
    const e = empresaDe(
      await chamar(
        'post',
        d.cookie,
        '',
        semDocumento('Loja do Zé', {
          endereco: { cep: '29100001', bairro: 'Centro', logradouro: 'Rua A' },
        }),
      ),
    )
    const naoExiste = await chamar('patch', d.cookie, `/${e.id}`, {
      verticalId: '0199a000-0000-7000-8000-000000000001',
    })
    expect(naoExiste.status).toBe(400)
    expect(erroDe(naoExiste)).toBe('vertical_invalida')
    const vertical = (
      await request(app.getHttpServer())
        .post('/v1/configuracoes/verticais')
        .set('Origin', ORIGEM_DO_FRONT)
        .set('Cookie', d.cookie)
        .send({ nome: 'Metalmecânica' })
    ).body as { id: string }
    const com = await chamar('patch', d.cookie, `/${e.id}`, { verticalId: vertical.id })
    expect(empresaDe(com).vertical).toMatchObject({ id: vertical.id, nome: 'Metalmecânica' })
    const sem = await chamar('patch', d.cookie, `/${e.id}`, {
      verticalId: null,
      endereco: { bairro: 'Praia' },
    })
    expect(empresaDe(sem).vertical).toBeNull()
    expect(empresaDe(sem).endereco).toMatchObject({ cep: null, logradouro: null, bairro: 'Praia' })
  })

  it('município inexistente é 400 municipio_invalido', async () => {
    const { d } = await cenario()
    const r = await chamar(
      'post',
      d.cookie,
      '',
      semDocumento('Loja', { endereco: { municipioCodigo: 1 } }),
    )
    expect(r.status).toBe(400)
    expect(erroDe(r)).toBe('municipio_invalido')
  })
})

describe('Status inicial', () => {
  it('o padrão é Lead; aceita outra tag do grupo Status e recusa tag de outro grupo', async () => {
    const { d } = await cenario()
    const grupos = (
      await request(app.getHttpServer())
        .get('/v1/configuracoes/tag-grupos')
        .set('Origin', ORIGEM_DO_FRONT)
        .set('Cookie', d.cookie)
    ).body as TagGrupo[]
    const status = grupos.find((g) => g.nome === 'Status')
    const visitacao = grupos.find((g) => g.nome === 'Visitação')
    const cliente = status?.tags.find((t) => t.nome === 'Cliente')
    const visitada = visitacao?.tags.find((t) => t.nome === 'Visitada')
    const r = await chamar(
      'post',
      d.cookie,
      '',
      semDocumento('Já é cliente', { statusTagId: cliente?.id }),
    )
    expect(r.status).toBe(201)
    expect(empresaDe(r).tags.map((t) => t.nome)).toEqual(['Cliente'])
    const errada = await chamar(
      'post',
      d.cookie,
      '',
      semDocumento('Tag errada', { statusTagId: visitada?.id }),
    )
    expect(errada.status).toBe(400)
    expect(erroDe(errada)).toBe('status_invalido')
  })
})

describe('DELETE /v1/carteira/empresas/:id', () => {
  it('exclusão lógica: some da ficha, fica no banco com excluido_em e na auditoria', async () => {
    const { d, gestor } = await cenario()
    const e = empresaDe(await chamar('post', d.cookie, '', semDocumento('Loja do Zé')))
    expect((await chamar('delete', gestor.cookie, `/${e.id}`)).status).toBe(204)
    expect((await chamar('get', d.cookie, `/${e.id}`)).status).toBe(404)
    expect((await chamar('delete', d.cookie, `/${e.id}`)).status).toBe(404) // já excluída
    const [linha] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<
        { excluido: boolean }[]
      >`SELECT excluido_em IS NOT NULL AS excluido FROM empresas WHERE id = ${e.id}`
    })
    expect(linha).toEqual({ excluido: true })
    const [reg] = (await auditoriaDe(d.tenantId)).filter((a) => a.acao === 'excluir')
    expect(reg).toMatchObject({
      entidade: 'empresa',
      entidade_id: e.id,
      alteracoes: { nome: 'Loja do Zé' },
    })
  })
})
