import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// O cliente da API usa caminhos relativos (/v1/...), que o navegador resolve sozinho e o `Request` do
// jsdom não: este `Request` resolve contra http://localhost. Precisa valer ANTES de o cliente ser criado.
const RequestOriginal = globalThis.Request
globalThis.Request = class extends RequestOriginal {
  constructor(entrada: RequestInfo | URL, init?: RequestInit) {
    super(
      typeof entrada === 'string' && entrada.startsWith('/')
        ? `http://localhost${entrada}`
        : entrada,
      init,
    )
  }
}

const { servicosReais } = await import('./servicos')

interface Chamada {
  metodo: string
  caminho: string
  consulta: string
  corpo: unknown
}

let chamadas: Chamada[]
const original = globalThis.fetch

beforeEach(() => {
  chamadas = []
  globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const req = entrada instanceof Request ? entrada : new Request(entrada, init)
    const url = new URL(req.url, 'http://localhost')
    const texto = await req.clone().text()
    chamadas.push({
      metodo: req.method,
      caminho: url.pathname,
      consulta: url.search,
      corpo: texto ? JSON.parse(texto) : undefined,
    })
    const semCorpo = req.method === 'DELETE'
    return new Response(semCorpo ? null : '[]', {
      status: semCorpo ? 204 : 200,
      headers: { 'content-type': 'application/json' },
    })
  })
})
afterEach(() => {
  globalThis.fetch = original
})

const ID = '0192f0a0-0000-7000-8000-000000000001'

describe('cadastros simples: método, caminho e corpo de cada rota', () => {
  it.each([
    ['verticais', 'verticais'],
    ['solucoes', 'solucoes'],
    ['origens', 'origens'],
    ['motivos', 'motivos'],
    ['tiposAtividade', 'tipos-atividade'],
  ] as const)('%s fala com /v1/configuracoes/%s', async (nome, rota) => {
    const base = `/v1/configuracoes/${rota}`
    const c = servicosReais.cadastros[nome] as unknown as {
      listar: () => Promise<{ ok: boolean }>
      criar: (d: unknown) => Promise<{ ok: boolean }>
      alterar: (id: string, d: unknown) => Promise<{ ok: boolean }>
      excluir: (id: string) => Promise<{ ok: boolean }>
      reordenar: (ids: string[]) => Promise<{ ok: boolean }>
    }
    expect((await c.listar()).ok).toBe(true)
    expect((await c.criar({ nome: 'X' })).ok).toBe(true)
    expect((await c.alterar(ID, { nome: 'Y' })).ok).toBe(true)
    expect((await c.excluir(ID)).ok).toBe(true)
    expect((await c.reordenar([ID])).ok).toBe(true)
    expect(chamadas).toEqual([
      { metodo: 'GET', caminho: base, consulta: '?incluirInativos=true', corpo: undefined },
      { metodo: 'POST', caminho: base, consulta: '', corpo: { nome: 'X' } },
      { metodo: 'PATCH', caminho: `${base}/${ID}`, consulta: '', corpo: { nome: 'Y' } },
      { metodo: 'DELETE', caminho: `${base}/${ID}`, consulta: '', corpo: undefined },
      { metodo: 'PUT', caminho: `${base}/ordem`, consulta: '', corpo: { ids: [ID] } },
    ])
  })

  it('erro da API vira Resultado com o código e a mensagem em português', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ erro: 'nome_duplicado', mensagem: 'Já existe um item com esse nome.' }),
          {
            status: 409,
            headers: { 'content-type': 'application/json' },
          },
        ),
    )
    const r = await servicosReais.cadastros.verticais.criar({ nome: 'X' })
    expect(r).toEqual({
      ok: false,
      erro: { codigo: 'nome_duplicado', mensagem: 'Já existe um item com esse nome.', status: 409 },
    })
  })

  it('queda de rede vira erro "sem_rede", não exceção', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const r = await servicosReais.cadastros.origens.listar()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('sem_rede')
  })
})

describe('importação: perfis de regras', () => {
  it('cada operação usa a rota certa', async () => {
    const p = servicosReais.importacao.perfis
    await p.listar()
    await p.criar({ nome: 'P' })
    await p.alterar(ID, { ativo: false })
    await p.excluir(ID)
    await p.conferirCnaes('0710-3/01')
    expect(chamadas).toEqual([
      {
        metodo: 'GET',
        caminho: '/v1/importacao/perfis',
        consulta: '?incluirInativos=true',
        corpo: undefined,
      },
      {
        metodo: 'POST',
        caminho: '/v1/importacao/perfis',
        consulta: '',
        // os padrões vão explícitos (o cliente gerado trata o que tem padrão como obrigatório)
        corpo: {
          nome: 'P',
          exigeSituacaoAtiva: true,
          estabelecimento: 'ambas',
          excluirMei: false,
          cnaes: [],
          aceitarCnaeSecundario: false,
          acaoForaDoPerfil: 'pular',
        },
      },
      {
        metodo: 'PATCH',
        caminho: `/v1/importacao/perfis/${ID}`,
        consulta: '',
        corpo: { ativo: false },
      },
      { metodo: 'DELETE', caminho: `/v1/importacao/perfis/${ID}`, consulta: '', corpo: undefined },
      {
        metodo: 'POST',
        caminho: '/v1/importacao/perfis/cnaes/conferir',
        consulta: '',
        corpo: { texto: '0710-3/01' },
      },
    ])
  })
})

describe('tags: método, caminho e corpo', () => {
  it('cada operação usa a rota certa', async () => {
    const t = servicosReais.tags
    await t.listar()
    await t.criarGrupo({ nome: 'G', selecao: 'multipla' })
    await t.alterarGrupo(ID, { nome: 'H' })
    await t.excluirGrupo(ID)
    await t.reordenarGrupos([ID])
    await t.criarTag({ tagGrupoId: ID, nome: 'T' })
    await t.alterarTag(ID, { cor: 'red' })
    await t.excluirTag(ID)
    await t.reordenarTags(ID, [ID])
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}${c.consulta}`)).toEqual([
      'GET /v1/configuracoes/tag-grupos?incluirInativos=true',
      'POST /v1/configuracoes/tag-grupos',
      `PATCH /v1/configuracoes/tag-grupos/${ID}`,
      `DELETE /v1/configuracoes/tag-grupos/${ID}`,
      'PUT /v1/configuracoes/tag-grupos/ordem',
      'POST /v1/configuracoes/tags',
      `PATCH /v1/configuracoes/tags/${ID}`,
      `DELETE /v1/configuracoes/tags/${ID}`,
      `PUT /v1/configuracoes/tag-grupos/${ID}/tags/ordem`,
    ])
    // os padrões que o cliente gerado trata como obrigatórios vão explícitos
    expect(chamadas[1]?.corpo).toEqual({ nome: 'G', selecao: 'multipla', obrigatorio: false })
    expect(chamadas[5]?.corpo).toEqual({ tagGrupoId: ID, nome: 'T', cor: 'gray' })
  })
})

describe('funis: método, caminho e corpo', () => {
  it('cada operação usa a rota certa', async () => {
    const f = servicosReais.funis
    await f.listar()
    await f.criar({ nome: 'F', fases: [{ nome: 'A' }] })
    await f.alterar(ID, { padrao: true })
    await f.excluir(ID)
    await f.reordenar([ID])
    await f.criarFase(ID, { nome: 'B' })
    await f.alterarFase(ID, { nome: 'C' })
    await f.excluirFase(ID)
    await f.reordenarFases(ID, [ID])
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}${c.consulta}`)).toEqual([
      'GET /v1/configuracoes/funis?incluirInativos=true',
      'POST /v1/configuracoes/funis',
      `PATCH /v1/configuracoes/funis/${ID}`,
      `DELETE /v1/configuracoes/funis/${ID}`,
      'PUT /v1/configuracoes/funis/ordem',
      `POST /v1/configuracoes/funis/${ID}/fases`,
      `PATCH /v1/configuracoes/funis/fases/${ID}`,
      `DELETE /v1/configuracoes/funis/fases/${ID}`,
      `PUT /v1/configuracoes/funis/${ID}/fases/ordem`,
    ])
    // os padrões que o cliente gerado trata como obrigatórios vão explícitos
    expect(chamadas[1]?.corpo).toEqual({
      nome: 'F',
      fases: [{ nome: 'A', cor: 'gray', probabilidadePadrao: 0, diasAlertaParada: null }],
    })
    expect(chamadas[5]?.corpo).toEqual({
      nome: 'B',
      cor: 'gray',
      probabilidadePadrao: 0,
      diasAlertaParada: null,
    })
    expect(chamadas[2]?.corpo).toEqual({ padrao: true })
  })
})
