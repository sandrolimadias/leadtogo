import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { gerarDocumento } from './gerar-documento.js'
import { listarRotas } from './rotas.js'

type Operacao = { summary?: string; security?: unknown[]; responses?: Record<string, unknown> }
type Documento = {
  paths: Record<string, Record<string, Operacao>>
  components: { schemas: Record<string, unknown> }
}

const arquivo = fileURLToPath(new URL('../../openapi.json', import.meta.url))

let app: INestApplication
beforeAll(async () => {
  app = await criarApp(configuracaoDeTeste())
  await app.init()
})
afterAll(() => app.close())

describe('OpenAPI', () => {
  it('apps/api/openapi.json está em dia com o código (rode `pnpm --filter @leadtogo/api openapi` se falhar)', async () => {
    const gerado = JSON.parse(JSON.stringify(await gerarDocumento())) as unknown
    const commitado = JSON.parse(readFileSync(arquivo, 'utf8')) as unknown
    expect(gerado).toEqual(commitado)
  }, 30_000)

  it('toda rota do CRM está documentada, com resumo, resposta de sucesso e (se protegida) o 401', () => {
    const doc = JSON.parse(readFileSync(arquivo, 'utf8')) as Documento
    const doCrm = listarRotas(app).filter(
      (r) => !r.rota.includes('/v1/auth/') && r.metodo !== 'all',
    )
    expect(doCrm.length).toBeGreaterThanOrEqual(10)
    for (const r of doCrm) {
      const operacao = doc.paths[r.caminhoOpenApi]?.[r.metodo]
      expect(operacao, `${r.rota} não está no OpenAPI`).toBeDefined()
      expect(operacao?.summary?.length ?? 0, `${r.rota} sem resumo`).toBeGreaterThan(3)
      const status = Object.keys(operacao?.responses ?? {})
      expect(
        status.some((s) => s.startsWith('2')),
        `${r.rota} sem resposta de sucesso`,
      ).toBe(true)
      if (!r.publica) expect(status, `${r.rota} deveria documentar o 401`).toContain('401')
    }
  })

  it('as rotas públicas ficam sem exigência de cookie; as protegidas usam a global', () => {
    const doc = JSON.parse(readFileSync(arquivo, 'utf8')) as Documento
    for (const r of listarRotas(app).filter((x) => !x.rota.includes('/v1/auth/'))) {
      const operacao = doc.paths[r.caminhoOpenApi]?.[r.metodo]
      if (r.publica) expect(operacao?.security, r.rota).toEqual([])
      else if (r.portal) expect(operacao?.security, r.rota).toEqual([{ sessaoPortal: [] }])
      else expect(operacao?.security, r.rota).toBeUndefined()
    }
  })

  it('o Better Auth fica de fora (tem o cliente próprio) e o erro padrão é um componente', () => {
    const doc = JSON.parse(readFileSync(arquivo, 'utf8')) as Documento
    expect(Object.keys(doc.paths).filter((p) => p.startsWith('/v1/auth'))).toEqual([])
    expect(doc.components.schemas).toHaveProperty('Erro')
    expect(JSON.stringify(doc)).not.toContain('#/definitions/')
  })
})
