import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { type Me, criarApiClient, type ErroDaApi } from './index.js'

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

describe('cliente da API', () => {
  it('chama a rota certa, com cookie de sessão, e tipa a resposta (GET /v1/me)', async () => {
    const pedidos: Request[] = []
    const me: Me = {
      usuario: {
        id: '01a111e8-f08a-70b7-b5f3-52998ced0a3d',
        nome: 'Ana',
        email: 'ana@exemplo.com',
        emailVerificado: true,
        twoFactorEnabled: true,
      },
      empresas: [],
      empresaAtivaId: null,
      administradorDeConta: false,
      doisFatoresPendente: false,
      doisFatoresObrigatorio: false,
    }
    const cliente = criarApiClient('https://api.crm.exemplo.com', {
      fetch: (entrada) => {
        pedidos.push(entrada as Request)
        return Promise.resolve(json(me))
      },
    })
    const { data, error } = await cliente.GET('/v1/me')
    expect(error).toBeUndefined()
    expect(data?.usuario.email).toBe('ana@exemplo.com') // tipado: data.usuario.email existe
    expect(pedidos[0]?.url).toBe('https://api.crm.exemplo.com/v1/me')
    expect(pedidos[0]?.credentials).toBe('include')
  })

  it('manda o corpo tipado e devolve o erro padrão da API (POST /v1/sessao/empresa-ativa)', async () => {
    const erro: ErroDaApi = {
      statusCode: 403,
      erro: 'empresa_nao_permitida',
      mensagem: 'Você não é membro desta empresa.',
    }
    let corpoEnviado = ''
    const cliente = criarApiClient('http://localhost:3000', {
      fetch: async (entrada) => {
        corpoEnviado = await (entrada as Request).text()
        return json(erro, 403)
      },
    })
    const { data, error, response } = await cliente.POST('/v1/sessao/empresa-ativa', {
      body: { empresaId: '01a111e8-f08a-70b7-b5f3-52998ced0a3d' },
    })
    expect(data).toBeUndefined()
    expect(response.status).toBe(403)
    expect(error?.erro).toBe('empresa_nao_permitida')
    expect(JSON.parse(corpoEnviado)).toEqual({ empresaId: '01a111e8-f08a-70b7-b5f3-52998ced0a3d' })
  })

  it('o schema gerado está em dia com o apps/api/openapi.json (rode o `generate` se este teste falhar)', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'api-client-'))
    try {
      const saida = join(pasta, 'schema.ts')
      const raiz = fileURLToPath(new URL('..', import.meta.url))
      execFileSync(
        join(raiz, 'node_modules/.bin/openapi-typescript'),
        [join(raiz, '../../apps/api/openapi.json'), '-o', saida],
        { stdio: 'pipe' },
      )
      expect(readFileSync(saida, 'utf8')).toBe(
        readFileSync(join(raiz, 'src/gerado/schema.ts'), 'utf8'),
      )
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  })

  it('o OpenAPI documenta as rotas do CRM e o cookie de sessão, e nenhuma rota do Better Auth', () => {
    const raiz = fileURLToPath(new URL('..', import.meta.url))
    const doc = JSON.parse(readFileSync(join(raiz, '../../apps/api/openapi.json'), 'utf8')) as {
      paths: Record<string, Record<string, { security?: unknown[] }>>
      components: { securitySchemes: Record<string, unknown> }
    }
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/health',
        '/v1/me',
        '/v1/sessao/empresa-ativa',
        '/v1/me/preferencias',
        '/v1/membros',
        '/v1/convites',
        '/v1/primeiro-acesso',
      ]),
    )
    expect(Object.keys(doc.paths).some((p) => p.startsWith('/v1/auth'))).toBe(false)
    expect(doc.components.securitySchemes).toHaveProperty('sessao')
    expect(doc.paths['/health']?.['get']?.security).toEqual([]) // pública
    expect(doc.paths['/v1/me']?.['get']?.security).toBeUndefined() // usa a exigência global (cookie)
  })
})
