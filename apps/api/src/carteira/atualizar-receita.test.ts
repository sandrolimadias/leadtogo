import type { Server } from 'node:http'

import {
  completarCnpj,
  type ConsultaDaReceitaDaEmpresa,
  type Contato,
  type EmpresaCarteira,
  type HistoricoDaEmpresa,
} from '@leadtogo/shared'
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
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const usados: string[] = []
afterAll(async () => {
  if (usados.length > 0) await dono`DELETE FROM receita_consultas WHERE cnpj = ANY(${usados})`
  await valkey.quit()
  await dono.end()
})
beforeAll(async () => {
  await dono`INSERT INTO estados (uf, nome, regiao) VALUES ('ES', 'Espírito Santo', 'Sudeste') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO municipios (codigo_ibge, nome, uf) VALUES (3205309, 'VITORIA', 'ES'), (3201308, 'CARIACICA', 'ES') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO portes (codigo, descricao) VALUES (3, 'Empresa de Pequeno Porte'), (5, 'Demais') ON CONFLICT DO NOTHING`
  await dono`INSERT INTO qualificacoes_socio (codigo, descricao) VALUES (49, 'Sócio-Administrador'), (22, 'Sócio') ON CONFLICT DO NOTHING`
  await dono`
    INSERT INTO cnaes (codigo, descricao, secao, divisao, grupo, classe) VALUES
      (2539001, 'Serviços de usinagem, tornearia e solda', 'C', '25', '253', '25390'),
      (2543800, 'Fabricação de ferramentas', 'C', '25', '254', '25438')
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

let seq = 0
function cnpjNovo(): string {
  seq += 1
  const base = `R${Date.now().toString(36).slice(-5).toUpperCase()}${String(seq).padStart(2, '0')}`
    .replace(/[^0-9A-Z]/g, '0')
    .padEnd(8, '0')
    .slice(0, 8)
  const cnpj = completarCnpj(`${base}0001`)
  usados.push(cnpj)
  return cnpj
}
const receitaTem = (cnpj: string, extra: Record<string, unknown> = {}) =>
  primaria.responder({ status: 200, corpo: respostaDaReceita(cnpj, extra) })

const EMPRESAS = '/v1/carteira/empresas'
type Metodo = 'get' | 'post' | 'patch'
let ip = 0
const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  ip += 1
  let r = request(app.getHttpServer())
    [metodo](url)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.4.${Math.floor(ip / 250)}.${ip % 250}`)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const empresaDe = (r: request.Response) => r.body as EmpresaCarteira

/** Empresa cadastrada pela Receita (como o front faz) e a pessoa que a vê. */
async function cadastrada(extraReceita: Record<string, unknown> = {}) {
  const d = await novoDono(app)
  const cnpj = cnpjNovo()
  receitaTem(cnpj, extraReceita)
  const r = await chamar('post', d.cookie, EMPRESAS, {
    tipoDocumento: 'cnpj',
    documento: cnpj,
    razaoSocial: 'METALURGICA EXEMPLO LTDA',
    nomeFantasia: 'EXEMPLO USINAGEM',
    mei: false,
    porteCodigo: 3,
    regimeTributario: 'simples_nacional',
    dataInicioAtividades: '2015-03-10',
    telefones: [{ numero: '2730643021' }],
    cnaes: { principal: 2539001, secundarios: [2543800] },
    endereco: {
      cep: '29100001',
      tipoLogradouro: 'RUA',
      logradouro: 'DAS FLORES',
      numero: '567',
      complemento: 'GALPAO 2',
      bairro: 'CENTRO',
      municipioCodigo: 3205309,
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return { d, cnpj, empresa: empresaDe(r) }
}
const consultar = (cookie: string | undefined, id: string) =>
  chamar('post', cookie, `${EMPRESAS}/${id}/receita/consultar`)
const aplicar = (cookie: string, id: string, corpo: unknown = {}) =>
  chamar('post', cookie, `${EMPRESAS}/${id}/receita/aplicar`, corpo)

describe('POST /v1/carteira/empresas/:id/receita/consultar', () => {
  it('sem mudança na Receita: reconsulta sem cache, atualiza a data e devolve a comparação vazia', async () => {
    const { d, cnpj, empresa } = await cadastrada()
    expect(primaria.chamadas).toEqual([`/${cnpj}`])
    const antes = empresa.receitaAtualizadoEm
    await new Promise((r) => setTimeout(r, 20))

    const r = await consultar(d.cookie, empresa.id)
    expect(r.status).toBe(200)
    const c = r.body as ConsultaDaReceitaDaEmpresa
    expect(c).toMatchObject({
      fonte: 'minhareceita',
      situacao: { descricao: 'ATIVA', ativa: true },
      situacaoAnterior: 'ATIVA',
      mudancas: [],
    })
    expect(primaria.chamadas).toHaveLength(2) // ignorou o cache
    const depois = empresaDe(await chamar('get', d.cookie, `${EMPRESAS}/${empresa.id}`))
    expect(new Date(depois.receitaAtualizadoEm as string).getTime()).toBeGreaterThan(
      new Date(antes as string).getTime(),
    )
  })

  it('a Receita mudou: aponta o que difere (atual × Receita) sem alterar o cadastro', async () => {
    const { d, cnpj, empresa } = await cadastrada()
    receitaTem(cnpj, {
      razao_social: 'METALURGICA EXEMPLO S/A',
      nome_fantasia: '',
      opcao_pelo_mei: false,
      opcao_pelo_simples: false,
      regime_tributario: [{ ano: 2026, forma_de_tributacao: 'LUCRO PRESUMIDO' }],
      codigo_porte: 5,
      codigo_municipio_ibge: 3201308,
      municipio: 'CARIACICA',
      numero: '900',
      cnaes_secundarios: [],
      ddd_telefone_2: '2730640000',
      qsa: [
        {
          nome_socio: 'BELTRANA DA SILVA',
          codigo_qualificacao_socio: 22,
          qualificacao_socio: 'Sócio',
        },
      ],
    })
    const r = await consultar(d.cookie, empresa.id)
    const c = r.body as ConsultaDaReceitaDaEmpresa
    const por = (chave: string) => c.mudancas.find((m) => m.chave === chave)
    expect(c.mudancas.map((m) => m.chave).sort()).toEqual(
      [
        'razaoSocial',
        'nomeFantasia',
        'regimeTributario',
        'porteCodigo',
        'endereco',
        'cnaes',
        'telefones',
        'socios',
      ].sort(),
    )
    expect(por('razaoSocial')).toMatchObject({
      atual: 'METALURGICA EXEMPLO LTDA',
      receita: 'METALURGICA EXEMPLO S/A',
    })
    expect(por('nomeFantasia')).toMatchObject({ atual: 'EXEMPLO USINAGEM', receita: null })
    expect(por('regimeTributario')).toMatchObject({
      atual: 'Simples Nacional',
      receita: 'Lucro Presumido',
    })
    expect(por('porteCodigo')).toMatchObject({
      atual: 'Empresa de Pequeno Porte',
      receita: 'Demais',
    })
    expect(por('endereco')).toMatchObject({
      atual: 'RUA DAS FLORES, 567, GALPAO 2, CENTRO, VITORIA/ES, CEP 29100-001',
      receita: 'RUA DAS FLORES, 900, GALPAO 2, CENTRO, CARIACICA/ES, CEP 29100-001',
    })
    expect(por('cnaes')).toMatchObject({
      atual: '2539001 (principal), 2543800',
      receita: '2539001 (principal)',
    })
    expect(por('socios')).toMatchObject({ atual: 'FULANO DE TAL', receita: 'BELTRANA DA SILVA' })

    // consultar não mexe no cadastro
    const igual = empresaDe(await chamar('get', d.cookie, `${EMPRESAS}/${empresa.id}`))
    expect(igual.razaoSocial).toBe('METALURGICA EXEMPLO LTDA')
    expect(igual.cnaes).toHaveLength(2)
  })

  it('empresa que deixou de ser ativa: mostra a nova situação e continua na carteira', async () => {
    const { d, cnpj, empresa } = await cadastrada()
    receitaTem(cnpj, {
      situacao_cadastral: 8,
      descricao_situacao_cadastral: 'BAIXADA',
      descricao_motivo_situacao_cadastral: 'EXTINCAO',
    })
    const c = (await consultar(d.cookie, empresa.id)).body as ConsultaDaReceitaDaEmpresa
    expect(c.situacao).toMatchObject({ descricao: 'BAIXADA', motivo: 'EXTINCAO', ativa: false })
    expect(c.situacaoAnterior).toBe('ATIVA')
    const ficha = empresaDe(await chamar('get', d.cookie, `${EMPRESAS}/${empresa.id}`))
    expect(ficha.receita).toMatchObject({ situacao: 'BAIXADA', ativa: false })
  })

  it('limpa o selo "situação não verificada"', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjNovo()
    primaria.responder({ status: 503, corpo: {} })
    alternativa.responder({ status: 503, corpo: {} })
    const nova = empresaDe(
      await chamar('post', d.cookie, EMPRESAS, {
        tipoDocumento: 'cnpj',
        documento: cnpj,
        razaoSocial: 'Sem Receita Ltda',
      }),
    )
    expect(nova.situacaoNaoVerificada).toBe(true)
    receitaTem(cnpj)
    expect((await consultar(d.cookie, nova.id)).status).toBe(200)
    const ficha = empresaDe(await chamar('get', d.cookie, `${EMPRESAS}/${nova.id}`))
    expect(ficha).toMatchObject({ situacaoNaoVerificada: false, receita: { ativa: true } })
  })

  it('as duas fontes fora do ar: 503 receita_indisponivel e nada muda (nem com cache vencido)', async () => {
    const { d, empresa } = await cadastrada()
    primaria.responder({ status: 503, corpo: {} })
    alternativa.responder({ status: 503, corpo: {} })
    const r = await consultar(d.cookie, empresa.id)
    expect(r.status).toBe(503)
    expect(erroDe(r)).toBe('receita_indisponivel')
  })

  it('só CNPJ (409 sem_cnpj); sem sessão 401; empresa inexistente 404', async () => {
    const d = await novoDono(app)
    const cpf = empresaDe(
      await chamar('post', d.cookie, EMPRESAS, {
        tipoDocumento: 'cpf',
        documento: '529.982.247-25',
        razaoSocial: 'Produtor Rural',
      }),
    )
    const r = await consultar(d.cookie, cpf.id)
    expect(r.status).toBe(409)
    expect(erroDe(r)).toBe('sem_cnpj')
    expect((await consultar(undefined, cpf.id)).status).toBe(401)
    expect((await consultar(d.cookie, '0199a000-0000-7000-8000-000000000001')).status).toBe(404)
  })

  it('segue a regra de carteira: o vendedor atualiza a própria; a de outro é 404, e se a vê, 403', async () => {
    const { d, cnpj, empresa } = await cadastrada()
    const u = await usuarioSimples(app)
    await vincular(d.tenantId, u.id, 'vendedor', 'Ana')
    await ativar(u.id, d.tenantId)
    receitaTem(cnpj)
    expect((await consultar(u.cookie, empresa.id)).status).toBe(404)
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`UPDATE perfil_permissoes SET alcance = 'todas' WHERE permissao IN ('empresas.ver', 'contatos.ver', 'oportunidades.ver', 'atividades.ver') AND perfil_id IN (SELECT id FROM perfis_acesso WHERE chave_sistema = 'vendedor')`
    })
    const r = await consultar(u.cookie, empresa.id)
    expect(r.status).toBe(403)
    expect(erroDe(r)).toBe('acesso_negado')
    expect((await aplicar(u.cookie, empresa.id)).status).toBe(403)
  })
})

describe('POST /v1/carteira/empresas/:id/receita/aplicar', () => {
  const mudou = {
    razao_social: 'METALURGICA EXEMPLO S/A',
    numero: '900',
    codigo_municipio_ibge: 3201308,
    municipio: 'CARIACICA',
    cnae_fiscal: 2543800,
    cnae_fiscal_descricao: 'Fabricação de ferramentas',
    cnaes_secundarios: [{ codigo: 2539001, descricao: 'Serviços de usinagem' }],
    ddd_telefone_2: '27998765432',
    qsa: [
      {
        nome_socio: 'BELTRANA DA SILVA',
        codigo_qualificacao_socio: 22,
        qualificacao_socio: 'Sócio',
      },
    ],
  }

  it('aplica tudo: dados, endereço, CNAEs, telefones (soma) e sócios, e a auditoria guarda o antes e o depois', async () => {
    const { d, cnpj, empresa } = await cadastrada()
    receitaTem(cnpj, mudou)
    await consultar(d.cookie, empresa.id)
    const chamadasAntes = primaria.chamadas.length

    const r = await aplicar(d.cookie, empresa.id)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const e = empresaDe(r)
    expect(primaria.chamadas).toHaveLength(chamadasAntes) // veio do cache renovado pelo passo 1
    expect(e).toMatchObject({
      razaoSocial: 'METALURGICA EXEMPLO S/A',
      endereco: { numero: '900', municipio: { nome: 'CARIACICA' } },
    })
    // o principal sempre primeiro, mesmo com código maior
    expect(e.cnaes).toMatchObject([
      { codigo: 2543800, principal: true },
      { codigo: 2539001, principal: false },
    ])
    expect(e.socios.map((s) => s.nome)).toEqual(['BELTRANA DA SILVA'])
    // o telefone digitado fica e o da Receita se soma (principal continua o primeiro)
    expect(e.telefones.map((t) => [t.e164, t.principal])).toEqual([
      ['+552730643021', true],
      ['+5527998765432', false],
    ])

    const reg = (await auditoriaDe(d.tenantId)).find((a) => a.acao === 'atualizar_receita')
    expect(reg?.alteracoes).toMatchObject({
      razaoSocial: { de: 'METALURGICA EXEMPLO LTDA', para: 'METALURGICA EXEMPLO S/A' },
      socios: { de: 'FULANO DE TAL', para: 'BELTRANA DA SILVA' },
    })
    // depois de aplicar, não sobra diferença
    expect(
      ((await consultar(d.cookie, empresa.id)).body as ConsultaDaReceitaDaEmpresa).mudancas,
    ).toEqual([])
  })

  it('aplica só os campos pedidos; o resto fica como está', async () => {
    const { d, cnpj, empresa } = await cadastrada()
    receitaTem(cnpj, mudou)
    await consultar(d.cookie, empresa.id)
    const r = await aplicar(d.cookie, empresa.id, { campos: ['razaoSocial'] })
    const e = empresaDe(r)
    expect(e.razaoSocial).toBe('METALURGICA EXEMPLO S/A')
    expect(e.endereco.numero).toBe('567')
    expect(e.socios.map((s) => s.nome)).toEqual(['FULANO DE TAL'])
    expect(e.telefones).toHaveLength(1)
    expect((await aplicar(d.cookie, empresa.id, { campos: ['inventado'] })).status).toBe(400)
  })

  it('sem diferença não grava nada; o histórico conta a consulta e a atualização em português', async () => {
    const { d, cnpj, empresa } = await cadastrada()
    await consultar(d.cookie, empresa.id)
    expect((await aplicar(d.cookie, empresa.id)).status).toBe(200)
    expect(
      (await auditoriaDe(d.tenantId)).filter((a) => a.acao === 'atualizar_receita'),
    ).toHaveLength(0)

    receitaTem(cnpj, {
      razao_social: 'METALURGICA EXEMPLO S/A',
      situacao_cadastral: 3,
      descricao_situacao_cadastral: 'SUSPENSA',
    })
    await consultar(d.cookie, empresa.id)
    await aplicar(d.cookie, empresa.id)
    const h = (await chamar('get', d.cookie, `${EMPRESAS}/${empresa.id}/historico`))
      .body as HistoricoDaEmpresa
    expect(h.itens.map((i) => i.titulo).slice(0, 3)).toEqual([
      'Atualizado pela Receita',
      'Consulta à Receita',
      'Consulta à Receita',
    ])
    expect(h.itens[0]?.mudancas).toEqual([
      {
        campo: 'razaoSocial',
        rotulo: 'Razão social',
        de: 'METALURGICA EXEMPLO LTDA',
        para: 'METALURGICA EXEMPLO S/A',
      },
    ])
    expect(h.itens[1]?.mudancas).toEqual([
      { campo: 'situacao', rotulo: 'Situação na Receita', de: 'ATIVA', para: 'SUSPENSA' },
    ])
    expect(h.itens[2]?.mudancas).toEqual([])
  })
})

describe('POST /v1/carteira/empresas/:id/socios/:socioId/converter', () => {
  const converter = (
    cookie: string | undefined,
    empresaId: string,
    socioId: string,
    corpo?: unknown,
  ) => chamar('post', cookie, `${EMPRESAS}/${empresaId}/socios/${socioId}/converter`, corpo)
  const ficha = async (cookie: string, id: string) =>
    empresaDe(await chamar('get', cookie, `${EMPRESAS}/${id}`))

  it('cria o contato com o nome do sócio e o vínculo (cargo = qualificação), sem telefone nem e-mail', async () => {
    const { d, empresa } = await cadastrada()
    const socio = empresa.socios[0]
    expect(socio).toMatchObject({ nome: 'FULANO DE TAL', contatoId: null })
    expect((await converter(undefined, empresa.id, socio?.id ?? '')).status).toBe(401)

    const r = await converter(d.cookie, empresa.id, socio?.id ?? '')
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const c = r.body as Contato
    expect(c).toMatchObject({ nome: 'FULANO DE TAL', telefones: [], emails: [] })
    expect(c.vinculos).toHaveLength(1)
    expect(c.vinculos[0]).toMatchObject({
      empresa: { id: empresa.id },
      cargo: 'Sócio-Administrador',
      principal: false,
      ativo: true,
    })
    expect((await ficha(d.cookie, empresa.id)).socios[0]?.contatoId).toBe(c.id)
    const daEmpresa = await chamar('get', d.cookie, `${EMPRESAS}/${empresa.id}/contatos`)
    expect((daEmpresa.body as { id: string }[]).map((x) => x.id)).toEqual([c.id])
    const reg = (await auditoriaDe(d.tenantId)).find(
      (a) => a.entidade === 'contato' && a.entidade_id === c.id,
    )
    expect(reg?.alteracoes).toMatchObject({ nome: 'FULANO DE TAL', origem: 'socio' })
  })

  it('com telefone e e-mail do diálogo, o contato já nasce com eles; em branco vale como sem', async () => {
    const { d, empresa } = await cadastrada()
    const socioId = empresa.socios[0]?.id ?? ''
    const r = await converter(d.cookie, empresa.id, socioId, {
      telefone: '(27) 99876-5432',
      email: ' Fulano@Exemplo.com.br ',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const c = r.body as Contato
    expect(c.telefones.map((t) => t.e164)).toEqual(['+5527998765432'])
    expect(c.emails.map((e) => e.email)).toEqual(['fulano@exemplo.com.br'])
    expect(c.vinculos[0]).toMatchObject({
      empresa: { id: empresa.id },
      cargo: 'Sócio-Administrador',
    })

    const outra = await cadastrada()
    const vazio = await converter(
      outra.d.cookie,
      outra.empresa.id,
      outra.empresa.socios[0]?.id ?? '',
      {
        telefone: '',
        email: '',
      },
    )
    expect(vazio.status, JSON.stringify(vazio.body)).toBe(201)
    expect(vazio.body as Contato).toMatchObject({ telefones: [], emails: [] })
  })

  it('e-mail ou telefone inválido: 400 e nada é criado', async () => {
    const { d, empresa } = await cadastrada()
    const socioId = empresa.socios[0]?.id ?? ''
    const email = await converter(d.cookie, empresa.id, socioId, { email: 'nao-e-email' })
    expect(email.status).toBe(400)
    const telefone = await converter(d.cookie, empresa.id, socioId, { telefone: '12' })
    expect(telefone.status).toBe(400)
    expect((await ficha(d.cookie, empresa.id)).socios[0]?.contatoId).toBeNull()
    const daEmpresa = await chamar('get', d.cookie, `${EMPRESAS}/${empresa.id}/contatos`)
    expect(daEmpresa.body as unknown[]).toHaveLength(0)
  })

  it('não converte duas vezes (409) e não duplica o contato', async () => {
    const { d, empresa } = await cadastrada()
    const socioId = empresa.socios[0]?.id ?? ''
    expect((await converter(d.cookie, empresa.id, socioId)).status).toBe(201)
    const de = await converter(d.cookie, empresa.id, socioId)
    expect(de.status).toBe(409)
    expect(erroDe(de)).toBe('socio_ja_convertido')
    const daEmpresa = await chamar('get', d.cookie, `${EMPRESAS}/${empresa.id}/contatos`)
    expect(daEmpresa.body as unknown[]).toHaveLength(1)
  })

  it('sócio inexistente ou de outra empresa: 404; outra empresa (tenant) não enxerga a empresa: 404', async () => {
    const a = await cadastrada()
    const b = await cadastrada()
    const socioDeA = a.empresa.socios[0]?.id ?? ''
    const semSocio = await converter(
      a.d.cookie,
      a.empresa.id,
      '0199a000-0000-7000-8000-000000000001',
    )
    expect(semSocio.status).toBe(404)
    expect(erroDe(semSocio)).toBe('socio_nao_encontrado')
    // o sócio de A pela empresa de B (mesmo tenant não: B é de outro tenant, então a empresa nem aparece)
    expect((await converter(b.d.cookie, a.empresa.id, socioDeA)).status).toBe(404)
    expect((await converter(b.d.cookie, b.empresa.id, socioDeA)).status).toBe(404)
    expect((await ficha(a.d.cookie, a.empresa.id)).socios[0]?.contatoId).toBeNull()
  })

  it('o vínculo do sócio sobrevive ao "Atualizar pela Receita": mesmo sócio, mesmo contato, sócios somados', async () => {
    const { d, cnpj, empresa } = await cadastrada()
    const socioId = empresa.socios[0]?.id ?? ''
    const contato = (await converter(d.cookie, empresa.id, socioId)).body as Contato

    // A Receita agora traz o mesmo sócio (nome com outra caixa e acento) com outra qualificação, e um novo
    receitaTem(cnpj, {
      qsa: [
        {
          nome_socio: 'Fulano de Tál',
          codigo_qualificacao_socio: 22,
          qualificacao_socio: 'Sócio',
        },
        {
          nome_socio: 'BELTRANA DA SILVA',
          codigo_qualificacao_socio: 22,
          qualificacao_socio: 'Sócio',
        },
      ],
    })
    expect((await consultar(d.cookie, empresa.id)).status).toBe(200)
    const r = await aplicar(d.cookie, empresa.id, { campos: ['socios'] })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const socios = empresaDe(r).socios
    expect(socios).toHaveLength(2)
    expect(socios.find((s) => s.id === socioId)).toMatchObject({
      nome: 'Fulano de Tál',
      qualificacao: 'Sócio',
      contatoId: contato.id,
    })
    expect(socios.find((s) => s.nome === 'BELTRANA DA SILVA')?.contatoId).toBeNull()

    // o contato e o vínculo continuam lá
    const depois = (await chamar('get', d.cookie, `/v1/carteira/contatos/${contato.id}`))
      .body as Contato
    expect(depois.vinculos).toHaveLength(1)
    expect(depois.vinculos[0]).toMatchObject({ empresa: { id: empresa.id }, ativo: true })
  })

  it('sócio convertido que saiu da Receita fica; o não convertido que saiu é removido', async () => {
    const { d, cnpj, empresa } = await cadastrada({
      qsa: [
        {
          nome_socio: 'FULANO DE TAL',
          codigo_qualificacao_socio: 49,
          qualificacao_socio: 'Sócio-Administrador',
        },
        { nome_socio: 'CICRANO SOUZA', codigo_qualificacao_socio: 22, qualificacao_socio: 'Sócio' },
        {
          nome_socio: 'BELTRANA DA SILVA',
          codigo_qualificacao_socio: 22,
          qualificacao_socio: 'Sócio',
        },
      ],
    })
    const idDe = (nome: string) => empresa.socios.find((s) => s.nome === nome)?.id ?? ''
    await converter(d.cookie, empresa.id, idDe('FULANO DE TAL'))

    receitaTem(cnpj, {
      qsa: [
        {
          nome_socio: 'BELTRANA DA SILVA',
          codigo_qualificacao_socio: 22,
          qualificacao_socio: 'Sócio',
        },
      ],
    })
    await consultar(d.cookie, empresa.id)
    const socios = empresaDe(await aplicar(d.cookie, empresa.id, { campos: ['socios'] })).socios
    expect(socios.map((s) => s.nome).sort()).toEqual(['BELTRANA DA SILVA', 'FULANO DE TAL'])
    expect(socios.find((s) => s.nome === 'FULANO DE TAL')?.contatoId).not.toBeNull()
  })
})
