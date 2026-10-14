import type { Server } from 'node:http'

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { LoteDeImportacao } from '@leadtogo/shared'
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
