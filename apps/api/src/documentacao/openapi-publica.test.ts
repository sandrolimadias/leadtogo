import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { fileURLToPath } from 'node:url'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { gerarDocumentoPublico, quebrasDeContrato } from './gerar-documento-publico.js'
import { servirDocumentacaoPublica } from './openapi.js'
import { listarRotas } from './rotas.js'

// Contrato da API pública (docs/plano_api_aberta.md, seção 5.3): o retrato versionado está em dia, a checagem de
// mudança não aditiva funciona e o documento é servido sem login.
const arquivo = fileURLToPath(
  new URL('../../../../docs/api/publica-v1.openapi.json', import.meta.url),
)
type Doc = Parameters<typeof quebrasDeContrato>[0]

let app: INestApplication<Server>
beforeAll(async () => {
  app = await criarApp(configuracaoDeTeste())
  servirDocumentacaoPublica(app)
  await app.init()
})
afterAll(async () => {
  await app.close()
})

describe('API pública: contrato', () => {
  it('docs/api/publica-v1.openapi.json está em dia (rode `pnpm --filter @leadtogo/api api:publica:atualizar` se falhar)', async () => {
    const gerado = JSON.parse(JSON.stringify(await gerarDocumentoPublico())) as unknown
    const commitado = JSON.parse(readFileSync(arquivo, 'utf8')) as unknown
    expect(gerado).toEqual(commitado)
  })

  it('só tem rotas /v1/publica, todas com a chave de API; o documento interno não as tem', () => {
    const doc = JSON.parse(readFileSync(arquivo, 'utf8')) as Doc & { security: unknown }
    expect(Object.keys(doc.paths).every((p) => p.startsWith('/v1/publica/'))).toBe(true)
    expect(doc.security).toEqual([{ chaveApi: [] }])
    const interno = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../openapi.json', import.meta.url)), 'utf8'),
    ) as Doc
    expect(Object.keys(interno.paths).filter((p) => p.startsWith('/v1/publica'))).toEqual([])
  })

  it('acusa mudança não aditiva e aceita a aditiva', () => {
    const base = JSON.parse(readFileSync(arquivo, 'utf8')) as Doc
    const copia = () => JSON.parse(JSON.stringify(base)) as Doc
    expect(quebrasDeContrato(base, copia())).toEqual([])

    const semCampo = copia()
    delete semCampo.components?.schemas?.['PublicaEmpresa']?.properties?.['razao_social']
    expect(quebrasDeContrato(base, semCampo).join('\n')).toMatch(/razao_social: campo removido/)

    const semRota = copia()
    delete semRota.paths['/v1/publica/eu']
    expect(quebrasDeContrato(base, semRota)).toContain('GET /v1/publica/eu: operação removida')

    const comCampoNovo = copia()
    const empresa = comCampoNovo.components?.schemas?.['PublicaEmpresa']
    if (empresa?.properties) empresa.properties['campo_novo'] = { type: 'string' }
    expect(quebrasDeContrato(base, comCampoNovo)).toEqual([])
  })

  it('toda rota da API pública está no documento dela, com resumo, sucesso e o 401', () => {
    const doc = JSON.parse(readFileSync(arquivo, 'utf8')) as {
      paths: Record<
        string,
        Record<string, { summary?: string; responses?: Record<string, unknown> }>
      >
    }
    const rotas = listarRotas(app).filter((r) => r.apiPublica)
    expect(rotas.length).toBeGreaterThanOrEqual(18)
    for (const r of rotas) {
      const operacao = doc.paths[r.caminhoOpenApi]?.[r.metodo]
      expect(operacao, `${r.rota} não está no documento público`).toBeDefined()
      expect(operacao?.summary?.length ?? 0, `${r.rota} sem resumo`).toBeGreaterThan(3)
      const status = Object.keys(operacao?.responses ?? {})
      expect(
        status.some((s) => s.startsWith('2')),
        `${r.rota} sem sucesso`,
      ).toBe(true)
      expect(status, `${r.rota} deveria documentar o 401`).toContain('401')
    }
  })

  it('o documento e a página são abertos (sem chave nem sessão)', async () => {
    const json = await request(app.getHttpServer()).get('/v1/publica/openapi.json')
    expect(json.status).toBe(200)
    expect((json.body as { info: { title: string } }).info.title).toBe('Leadtogo — API pública')
    const pagina = await request(app.getHttpServer()).get('/v1/publica/docs')
    expect(pagina.status).toBe(200)
    expect(pagina.text).toContain('swagger')
  })
})
