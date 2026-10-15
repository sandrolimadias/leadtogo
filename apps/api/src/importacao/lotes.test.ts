import type { Server } from 'node:http'

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  completarCnpj,
  type LoteDeImportacao,
  type PerfilDeImportacao,
  type PreviaDaImportacao,
  type TagGrupo,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

// Todas as planilhas são geradas aqui, com dados inventados: nenhum dado real de cliente.

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const config = configuracaoDeTeste()
const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
})
afterAll(async () => {
  s3.destroy()
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

const enviar = (
  cookie: string | undefined,
  arquivo: string,
  corpo: Buffer | string,
  extra = '',
) => {
  let r = request(app.getHttpServer())
    .post(`/v1/importacao/lotes?arquivo=${encodeURIComponent(arquivo)}${extra}`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Content-Type', 'application/octet-stream')
  if (cookie) r = r.set('Cookie', cookie)
  return r.send(corpo)
}
const ver = (cookie: string, id: string) =>
  request(app.getHttpServer())
    .get(`/v1/importacao/lotes/${id}`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('Cookie', cookie)
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const loteDe = (r: request.Response) => r.body as LoteDeImportacao

async function planilha(linhas: unknown[][]): Promise<Buffer> {
  const livro = new ExcelJS.Workbook()
  const folha = livro.addWorksheet('Empresas')
  for (const l of linhas) folha.addRow(l)
  return Buffer.from(await livro.xlsx.writeBuffer())
}
const CSV =
  'CNPJ;Razão social;Cidade\n11222333000181;Metalúrgica Teste;Vitória\n11222333000262;Usinagem Fictícia;Serra\n'

async function equipe() {
  const d = await novoDono(app)
  const gestor = await usuarioSimples(app)
  await vincular(d.tenantId, gestor.id, 'gestor')
  await ativar(gestor.id, d.tenantId)
  const vendedor = await usuarioSimples(app)
  await vincular(d.tenantId, vendedor.id, 'vendedor')
  await ativar(vendedor.id, d.tenantId)
  return { d, gestor, vendedor }
}

const contar = async (tenantId: string, tabela: 'importacoes' | 'importacao_linhas' | 'arquivos') =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    const [l] = await tx.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${tabela}`)
    return l?.n ?? 0
  })

describe('POST /v1/importacao/lotes', () => {
  it('sem sessão 401; o vendedor não importa (403); administrador e gestor sim', async () => {
    const { d, gestor, vendedor } = await equipe()
    expect((await enviar(undefined, 'a.csv', CSV)).status).toBe(401)
    const proibido = await enviar(vendedor.cookie, 'a.csv', CSV)
    expect(proibido.status).toBe(403)
    expect(erroDe(proibido)).toBe('acesso_negado')
    expect(await contar(d.tenantId, 'importacoes')).toBe(0)
    for (const cookie of [d.cookie, gestor.cookie]) {
      expect((await enviar(cookie, 'a.csv', CSV)).status).toBe(201)
    }
  })

  it('CSV: cria o lote em rascunho com as linhas, a amostra e o original no Garage', async () => {
    const { d } = await equipe()
    const r = await enviar(d.cookie, 'Carteira 2026.csv', CSV)
    expect(r.status).toBe(201)
    const lote = loteDe(r)
    expect(lote).toMatchObject({
      nome: 'Carteira 2026',
      tipo: 'empresas',
      nomeArquivo: 'Carteira 2026.csv',
      situacao: 'rascunho',
      totalLinhas: 2,
      colunas: ['CNPJ', 'Razão social', 'Cidade'],
    })
    expect(lote.amostra).toEqual([
      { CNPJ: '11222333000181', 'Razão social': 'Metalúrgica Teste', Cidade: 'Vitória' },
      { CNPJ: '11222333000262', 'Razão social': 'Usinagem Fictícia', Cidade: 'Serra' },
    ])
    expect(await contar(d.tenantId, 'importacao_linhas')).toBe(2)
    expect(await contar(d.tenantId, 'arquivos')).toBe(1)

    // O original está no Garage, sob a chave da empresa, e a linha de arquivos aponta para o lote
    const [arquivo] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<
        {
          chave_arquivo: string
          nome: string
          mime: string
          tamanho: string
          entidade_id: string
        }[]
      >`
        SELECT chave_arquivo, nome, mime, tamanho, entidade_id FROM arquivos`
    })
    expect(arquivo).toMatchObject({
      nome: 'Carteira 2026.csv',
      mime: 'text/csv',
      entidade_id: lote.id,
    })
    expect(arquivo?.chave_arquivo.startsWith(`${d.tenantId}/importacao/`)).toBe(true)
    const objeto = await s3.send(
      new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: arquivo?.chave_arquivo ?? '' }),
    )
    expect(await objeto.Body?.transformToString()).toBe(CSV)

    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'importacao')
    expect(reg.map((x) => x.acao)).toEqual(['criar'])
    expect(reg[0]?.alteracoes).toMatchObject({ nomeArquivo: 'Carteira 2026.csv', linhas: 2 })
  })

  it('Excel: lê o .xlsx, usa o nome escolhido e a amostra traz só as primeiras linhas', async () => {
    const { d } = await equipe()
    const linhas = Array.from({ length: 8 }, (_, i) => [
      `1122233300${String(i).padStart(4, '0')}`,
      `Empresa ${i + 1}`,
    ])
    const r = await enviar(
      d.cookie,
      'lote.xlsx',
      await planilha([['CNPJ', 'Nome'], ...linhas]),
      `&nome=${encodeURIComponent('Leads de outubro')}`,
    )
    expect(r.status).toBe(201)
    const lote = loteDe(r)
    expect(lote).toMatchObject({ nome: 'Leads de outubro', totalLinhas: 8 })
    expect(lote.amostra).toHaveLength(5)
    expect(lote.amostra[4]).toEqual({ CNPJ: '11222333000004', Nome: 'Empresa 5' })
    expect(await contar(d.tenantId, 'importacao_linhas')).toBe(8)
  })

  it('detalhar devolve o mesmo lote; lote de outra empresa e id que não é UUID dão 404 e 400', async () => {
    const a = await equipe()
    const b = await equipe()
    const lote = loteDe(await enviar(a.d.cookie, 'a.csv', CSV))
    const visto = await ver(a.d.cookie, lote.id)
    expect(visto.status).toBe(200)
    expect(loteDe(visto)).toEqual(lote)
    const alheio = await ver(b.d.cookie, lote.id)
    expect(alheio.status).toBe(404)
    expect(erroDe(alheio)).toBe('importacao_nao_encontrada')
    expect((await ver(a.d.cookie, 'nao-e-uuid')).status).toBe(400)
    expect((await ver(a.vendedor.cookie, lote.id)).status).toBe(403)
  })

  it('arquivo ruim: nada é gravado (banco nem Garage) e o erro tem código estável', async () => {
    const { d } = await equipe()
    const casos: [string, Buffer | string, number, string][] = [
      ['vazio.csv', Buffer.alloc(0), 400, 'arquivo_vazio'],
      ['so-titulo.csv', 'CNPJ;Nome\n', 400, 'arquivo_sem_linhas'],
      ['repetido.csv', 'CNPJ;CNPJ\n1;2\n', 400, 'colunas_repetidas'],
      [
        'antigo.xls',
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        415,
        'formato_nao_suportado',
      ],
      ['falso.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), 400, 'arquivo_invalido'],
      [
        'grande.csv',
        `CNPJ\n${Array.from({ length: 10_001 }, (_, i) => i + 1).join('\n')}\n`,
        413,
        'limite_de_linhas',
      ],
    ]
    for (const [nome, corpo, status, codigo] of casos) {
      const r = await enviar(d.cookie, nome, corpo)
      expect([nome, r.status, erroDe(r)]).toEqual([nome, status, codigo])
    }
    expect(await contar(d.tenantId, 'importacoes')).toBe(0)
    expect(await contar(d.tenantId, 'importacao_linhas')).toBe(0)
    expect(await contar(d.tenantId, 'arquivos')).toBe(0)
  })

  it('passa de 10 MB: 413 antes de ler; corpo que não são bytes, sem nome do arquivo ou tipo desconhecido: 400', async () => {
    const { d } = await equipe()
    const grande = await enviar(d.cookie, 'g.csv', Buffer.alloc(10 * 1024 * 1024 + 1, 0x41))
    expect(grande.status).toBe(413)
    expect(erroDe(grande)).toBe('corpo_grande_demais')
    const json = await request(app.getHttpServer())
      .post('/v1/importacao/lotes?arquivo=a.csv')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
      .send({ x: 1 })
    expect(json.status).toBe(400)
    expect(erroDe(json)).toBe('arquivo_vazio')
    const semNome = await request(app.getHttpServer())
      .post('/v1/importacao/lotes')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
      .set('Content-Type', 'application/octet-stream')
      .send(CSV)
    expect(semNome.status).toBe(400)
    expect((await enviar(d.cookie, 'a.csv', CSV, '&tipo=contatos')).status).toBe(400)
  })
})

describe('GET /v1/importacao/modelo', () => {
  it('baixa um .xlsx só com os títulos; vendedor 403 e sem sessão 401', async () => {
    const { d, vendedor } = await equipe()
    const baixar = (cookie?: string) => {
      let r = request(app.getHttpServer())
        .get('/v1/importacao/modelo')
        .set('Origin', ORIGEM_DO_FRONT)
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = []
          res.on('data', (p: Buffer) => partes.push(p))
          res.on('end', () => cb(null, Buffer.concat(partes)))
        })
      if (cookie) r = r.set('Cookie', cookie)
      return r
    }
    expect((await baixar()).status).toBe(401)
    expect((await baixar(vendedor.cookie)).status).toBe(403)
    const r = await baixar(d.cookie)
    expect(r.status).toBe(200)
    expect(r.headers['content-disposition']).toContain('modelo-importacao-empresas.xlsx')
    const livro = new ExcelJS.Workbook()
    const bytes: Buffer = Buffer.from(r.body as Uint8Array)
    await livro.xlsx.load(bytes as unknown as Parameters<typeof livro.xlsx.load>[0])
    const folha = livro.getWorksheet('Empresas')
    expect(folha?.getRow(1).values).toEqual([
      undefined,
      'CNPJ',
      'Razão social',
      'Nome fantasia',
      'Telefone',
      'Site',
      'CEP',
      'Logradouro',
      'Número',
      'Complemento',
      'Bairro',
      'Município',
      'UF',
      'Observações',
    ])
    expect(folha?.rowCount).toBe(1)
    expect(livro.getWorksheet('Como preencher')).toBeTruthy()
  })
})

const alterar = (cookie: string | undefined, id: string, corpo: unknown) => {
  let r = request(app.getHttpServer())
    .patch(`/v1/importacao/lotes/${id}`)
    .set('Origin', ORIGEM_DO_FRONT)
  if (cookie) r = r.set('Cookie', cookie)
  return r.send(corpo as object)
}

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

/** Os ids que o passo Carteira escolhe: o administrador (vendedor), as tags de Status, uma origem e uma vertical. */
async function escolhas(d: { tenantId: string; usuarioId: string; cookie: string }) {
  const membroId = await noTenant(d.tenantId, async (tx) => {
    const [m] = await tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${d.usuarioId}`
    return (m as { id: string }).id
  })
  const grupos = (
    await request(app.getHttpServer())
      .get('/v1/configuracoes/tag-grupos')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
  ).body as TagGrupo[]
  const tag = (chave: string) =>
    (grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === chave) as { id: string }).id
  const origens = (
    await request(app.getHttpServer())
      .get('/v1/configuracoes/origens')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
  ).body as { id: string }[]
  const vertical = (
    await request(app.getHttpServer())
      .post('/v1/configuracoes/verticais')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
      .send({ nome: 'Indústria' })
  ).body as { id: string }
  return {
    membroId,
    lead: tag('lead'),
    cliente: tag('cliente'),
    visitada: tag('visitada'),
    origemId: (origens[0] as { id: string }).id,
    verticalId: vertical.id,
  }
}

const perfil = async (cookie: string, nome: string, extra: Record<string, unknown> = {}) =>
  (
    await request(app.getHttpServer())
      .post('/v1/importacao/perfis')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', cookie)
      .send({ nome, ...extra })
  ).body as PerfilDeImportacao

describe('PATCH /v1/importacao/lotes/:id', () => {
  const CAMPOS = { documento: 'CNPJ', razaoSocial: 'Razão social', municipio: 'Cidade' }

  it('o detalhe já traz a sugestão do mapeamento e o que falta (pendências)', async () => {
    const { d } = await equipe()
    const lote = loteDe(await enviar(d.cookie, 'a.csv', CSV))
    expect(lote.sugestao).toEqual({
      documento: 'CNPJ',
      razaoSocial: 'Razão social',
      municipio: 'Cidade',
    })
    expect(lote).toMatchObject({
      campos: {},
      fonteDados: 'planilha',
      intervaloMs: 3000,
      perfilId: null,
      situacao: 'rascunho',
    })
    expect(lote.pendencias).toEqual([
      'Indique a coluna do CNPJ.',
      'Indique a coluna da razão social (ou busque os dados na Receita).',
      'Escolha o vendedor responsável pelas empresas.',
      'Escolha o Status das empresas (Cliente ou Lead, por exemplo).',
    ])
  })

  it('salva o mapeamento e as escolhas da carteira; com tudo preenchido o lote fica pronta', async () => {
    const { d } = await equipe()
    const e = await escolhas(d)
    const lote = loteDe(await enviar(d.cookie, 'a.csv', CSV))
    const r = await alterar(d.cookie, lote.id, {
      nome: 'Carteira de outubro',
      campos: CAMPOS,
      intervaloMs: 1500,
      vendedorId: e.membroId,
      statusTagId: e.cliente,
      origemId: e.origemId,
      verticalId: e.verticalId,
    })
    expect(r.status).toBe(200)
    expect(loteDe(r)).toMatchObject({
      nome: 'Carteira de outubro',
      campos: CAMPOS,
      intervaloMs: 1500,
      vendedorId: e.membroId,
      statusTagId: e.cliente,
      origemId: e.origemId,
      verticalId: e.verticalId,
      pendencias: [],
      situacao: 'pronta',
    })
    expect(loteDe(await ver(d.cookie, lote.id))).toEqual(loteDe(r))

    // tirar o CNPJ do mapeamento volta o lote a rascunho
    const sem = await alterar(d.cookie, lote.id, { campos: { razaoSocial: 'Razão social' } })
    expect(loteDe(sem)).toMatchObject({
      situacao: 'rascunho',
      pendencias: ['Indique a coluna do CNPJ.'],
    })

    const reg = (await auditoriaDe(d.tenantId)).filter(
      (x) => x.entidade === 'importacao' && x.acao === 'alterar',
    )
    expect(reg).toHaveLength(2)
    expect(reg[0]?.alteracoes).toMatchObject({ nome: { para: 'Carteira de outubro' } })
  })

  it('buscar na Receita dispensa a coluna da razão social; coluna em branco ou nula é "não mapear"', async () => {
    const { d } = await equipe()
    const e = await escolhas(d)
    const lote = loteDe(await enviar(d.cookie, 'a.csv', CSV))
    const r = await alterar(d.cookie, lote.id, {
      fonteDados: 'receita',
      campos: { documento: 'CNPJ', razaoSocial: null, municipio: '  ' },
      vendedorId: e.membroId,
      statusTagId: e.lead,
    })
    expect(loteDe(r)).toMatchObject({
      fonteDados: 'receita',
      campos: { documento: 'CNPJ' },
      situacao: 'pronta',
    })
  })

  it('mapeamento errado: coluna que não existe, coluna em dois campos e campo desconhecido (400)', async () => {
    const { d } = await equipe()
    const lote = loteDe(await enviar(d.cookie, 'a.csv', CSV))
    for (const campos of [
      { documento: 'CNPJ', telefone: 'Celular' },
      { documento: 'CNPJ', razaoSocial: 'CNPJ' },
      { documento: 'CNPJ', cor: 'Cidade' },
    ]) {
      const r = await alterar(d.cookie, lote.id, { campos })
      expect([JSON.stringify(campos), r.status, erroDe(r)]).toEqual([
        JSON.stringify(campos),
        400,
        'mapeamento_invalido',
      ])
    }
    expect(loteDe(await ver(d.cookie, lote.id)).campos).toEqual({})
  })

  it('o perfil vira cópia das regras no lote; "Sem regras" limpa; perfil inativo ou de outra empresa é recusado', async () => {
    const a = await equipe()
    const b = await equipe()
    const p = await perfil(a.d.cookie, 'Metalurgia', {
      estabelecimento: 'matriz',
      excluirMei: true,
    })
    const lote = loteDe(await enviar(a.d.cookie, 'a.csv', CSV))
    const r = await alterar(a.d.cookie, lote.id, { perfilId: p.id })
    expect(loteDe(r).perfilId).toBe(p.id)
    const regras = async () =>
      (
        await noTenant(
          a.d.tenantId,
          (tx) => tx<{ regras: unknown }[]>`SELECT regras FROM importacoes WHERE id = ${lote.id}`,
        )
      )[0]?.regras
    expect(await regras()).toEqual({
      exigeSituacaoAtiva: true,
      estabelecimento: 'matriz',
      excluirMei: true,
      cnaes: [],
      aceitarCnaeSecundario: false,
      acaoForaDoPerfil: 'pular',
    })

    // mexer no perfil depois não muda a cópia que o lote guarda
    await request(app.getHttpServer())
      .patch(`/v1/importacao/perfis/${p.id}`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', a.d.cookie)
      .send({ estabelecimento: 'filial' })
    expect(await regras()).toMatchObject({ estabelecimento: 'matriz' })

    expect(loteDe(await alterar(a.d.cookie, lote.id, { perfilId: null })).perfilId).toBeNull()
    expect(await regras()).toBeNull()

    await request(app.getHttpServer())
      .patch(`/v1/importacao/perfis/${p.id}`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', a.d.cookie)
      .send({ ativo: false })
    for (const perfilId of [p.id, (await perfil(b.d.cookie, 'Da outra empresa')).id]) {
      const ruim = await alterar(a.d.cookie, lote.id, { perfilId })
      expect([ruim.status, erroDe(ruim)]).toEqual([400, 'perfil_invalido'])
    }
  })

  it('vendedor, Status, origem e vertical precisam existir, estar ativos e ser da empresa (400)', async () => {
    const a = await equipe()
    const b = await equipe()
    const ea = await escolhas(a.d)
    const eb = await escolhas(b.d)
    const lote = loteDe(await enviar(a.d.cookie, 'a.csv', CSV))
    for (const [corpo, campo] of [
      [{ vendedorId: eb.membroId }, 'vendedorId'],
      [{ statusTagId: ea.visitada }, 'statusTagId'], // tag de outro grupo (Visitação)
      [{ statusTagId: eb.cliente }, 'statusTagId'],
      [{ origemId: eb.origemId }, 'origemId'],
      [{ verticalId: eb.verticalId }, 'verticalId'],
    ] as const) {
      const r = await alterar(a.d.cookie, lote.id, corpo)
      expect([campo, r.status, erroDe(r)]).toEqual([campo, 400, 'escolha_invalida'])
    }
    expect(
      (await alterar(a.d.cookie, lote.id, { vendedorId: ea.membroId, statusTagId: ea.lead }))
        .status,
    ).toBe(200)
  })

  it('validação do corpo, permissão, outra empresa e lote já iniciado', async () => {
    const a = await equipe()
    const b = await equipe()
    const lote = loteDe(await enviar(a.d.cookie, 'a.csv', CSV))
    for (const ruim of [
      {},
      { intervaloMs: 499 },
      { intervaloMs: 60_001 },
      { fonteDados: 'tudo' },
      { extra: 1 },
    ]) {
      expect((await alterar(a.d.cookie, lote.id, ruim)).status, JSON.stringify(ruim)).toBe(400)
    }
    expect((await alterar(undefined, lote.id, { nome: 'X' })).status).toBe(401)
    expect((await alterar(a.vendedor.cookie, lote.id, { nome: 'X' })).status).toBe(403)
    expect((await alterar(a.gestor.cookie, lote.id, { nome: 'Do gestor' })).status).toBe(200)
    const alheio = await alterar(b.d.cookie, lote.id, { nome: 'Invasor' })
    expect([alheio.status, erroDe(alheio)]).toEqual([404, 'importacao_nao_encontrada'])
    expect((await alterar(a.d.cookie, 'nao-e-uuid', { nome: 'X' })).status).toBe(400)

    await noTenant(
      a.d.tenantId,
      (tx) => tx`UPDATE importacoes SET situacao = 'em_andamento' WHERE id = ${lote.id}`,
    )
    const iniciado = await alterar(a.d.cookie, lote.id, { nome: 'Tarde demais' })
    expect([iniciado.status, erroDe(iniciado)]).toEqual([409, 'importacao_nao_editavel'])
  })
})

describe('GET /v1/importacao/lotes/:id/previa', () => {
  const cnpj = (n: number) => completarCnpj(`7${String(n).padStart(7, '0')}0001`)
  const usados: string[] = []
  afterAll(async () => {
    if (usados.length > 0) await dono`DELETE FROM receita_consultas WHERE cnpj = ANY(${usados})`
  })
  const previa = (cookie: string | undefined, id: string) => {
    let r = request(app.getHttpServer())
      .get(`/v1/importacao/lotes/${id}/previa`)
      .set('Origin', ORIGEM_DO_FRONT)
    if (cookie) r = r.set('Cookie', cookie)
    return r
  }

  /** Planilha com 8 linhas: 4 boas, 1 repetida, 1 em branco, 1 inválida e 1 que já está na carteira. */
  async function cenario() {
    const eq = await equipe()
    const e = await escolhas(eq.d)
    const [a, b, c, ja, d1] = [cnpj(1), cnpj(2), cnpj(3), cnpj(4), cnpj(5)]
    const linhas = [
      `CNPJ;Razão social`,
      `${a};Alfa`,
      `${b};Beta`,
      `${a};Alfa de novo`, // repetida
      `;Sem CNPJ`, // em branco
      `123;CNPJ curto`, // inválido
      `${ja};Já na carteira`,
      `${c};Gama`,
      `${d1};Delta`,
    ]
    const lote = loteDe(await enviar(eq.d.cookie, 'p.csv', `${linhas.join('\n')}\n`))
    await noTenant(eq.d.tenantId, async (tx) => {
      await tx`INSERT INTO empresas (id, tenant_id, tipo_documento, documento, razao_social, vendedor_id)
               VALUES (gen_random_uuid(), ${eq.d.tenantId}, 'cnpj', ${ja}, 'Empresa existente', ${e.membroId})`
    })
    return { ...eq, e, lote, cnpjs: { a, b, c, ja, d1 } }
  }

  it('conta o que vale, o que é pulado e lista os problemas por linha', async () => {
    const { d, lote } = await cenario()
    const sem = await previa(d.cookie, lote.id)
    expect([sem.status, erroDe(sem)]).toEqual([409, 'mapeamento_incompleto'])

    await alterar(d.cookie, lote.id, { campos: { documento: 'CNPJ', razaoSocial: 'Razão social' } })
    const r = await previa(d.cookie, lote.id)
    expect(r.status).toBe(200)
    const p = r.body as PreviaDaImportacao
    expect(p).toMatchObject({
      totalLinhas: 8,
      aImportar: 4,
      semCnpjValido: 2,
      repetidasNaPlanilha: 1,
      jaNaCarteira: 1,
      consultaAReceita: true, // o bloqueio de empresa não ativa vem ligado por padrão
    })
    expect(p.problemas).toEqual([
      { numero: 3, motivo: 'CNPJ repetido (já está na linha 1)' },
      { numero: 4, motivo: 'CNPJ em branco' },
      { numero: 5, motivo: 'CNPJ inválido: 123' },
      { numero: 6, motivo: 'CNPJ já está na carteira (a empresa não será alterada)' },
    ])
  })

  it('a estimativa só conta as consultas fora do cache de 30 dias e usa o intervalo escolhido', async () => {
    const { d, lote, cnpjs } = await cenario()
    await alterar(d.cookie, lote.id, {
      campos: { documento: 'CNPJ', razaoSocial: 'Razão social' },
      intervaloMs: 2000,
    })
    expect((await previa(d.cookie, lote.id)).body).toMatchObject({
      consultasNecessarias: 4,
      estimativaSegundos: 8,
    })
    // duas já estão no cache (uma recente e uma vencida: só a recente poupa a consulta)
    usados.push(cnpjs.a, cnpjs.b)
    await dono`INSERT INTO receita_consultas (cnpj, dados, consultado_em, fonte) VALUES (${cnpjs.a}, '{}'::jsonb, now(), 'minhareceita')`
    await dono`INSERT INTO receita_consultas (cnpj, dados, consultado_em, fonte) VALUES (${cnpjs.b}, '{}'::jsonb, now() - interval '31 days', 'minhareceita')`
    try {
      expect((await previa(d.cookie, lote.id)).body).toMatchObject({
        consultasNecessarias: 3,
        estimativaSegundos: 6,
      })
    } finally {
      // o cache é global: tira o que este teste pôs, para os outros não verem
      await dono`DELETE FROM receita_consultas WHERE cnpj = ANY(${[cnpjs.a, cnpjs.b]})`
    }
  })

  it('sem perfil, sem bloqueio e com os dados da planilha, não consulta a Receita (estimativa zero)', async () => {
    const { d, lote } = await cenario()
    await alterar(d.cookie, lote.id, { campos: { documento: 'CNPJ', razaoSocial: 'Razão social' } })
    await noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE tenant_configuracoes SET bloquear_empresa_nao_ativa = false WHERE tenant_id = ${d.tenantId}`,
    )
    expect((await previa(d.cookie, lote.id)).body).toMatchObject({
      consultaAReceita: false,
      consultasNecessarias: 0,
      estimativaSegundos: 0,
    })
    // buscar os dados na Receita volta a consultar
    await alterar(d.cookie, lote.id, { fonteDados: 'receita' })
    expect((await previa(d.cookie, lote.id)).body).toMatchObject({
      consultaAReceita: true,
      consultasNecessarias: 4,
    })
  })

  it('permissão e isolamento: vendedor 403, sem sessão 401, outra empresa 404', async () => {
    const { d, vendedor, lote } = await cenario()
    const outra = await equipe()
    await alterar(d.cookie, lote.id, { campos: { documento: 'CNPJ', razaoSocial: 'Razão social' } })
    expect((await previa(undefined, lote.id)).status).toBe(401)
    expect((await previa(vendedor.cookie, lote.id)).status).toBe(403)
    const alheio = await previa(outra.d.cookie, lote.id)
    expect([alheio.status, erroDe(alheio)]).toEqual([404, 'importacao_nao_encontrada'])
    expect((await previa(d.cookie, 'nao-e-uuid')).status).toBe(400)
  })
})
