import { describe, expect, it } from 'vitest'

import {
  consultaDeDocumentosDoPortalSchema,
  consultaDeDocumentosSchema,
  criarDocumentoSchema,
  editarDocumentoSchema,
} from './documentos.js'

const empresa = '0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b'
const arquivo = { nome: 'guia.pdf', mime: 'application/pdf', tamanho: 1024 }
const base = { titulo: 'Guia rápido do portal', alcance: 'todos' as const, arquivo }

describe('criarDocumentoSchema', () => {
  it('aceita documento para todos e normaliza a descrição vazia', () => {
    const r = criarDocumentoSchema.parse({ ...base, descricao: '   ' })
    expect(r.descricao).toBeNull()
    expect(r.empresaIds).toEqual([])
    expect(criarDocumentoSchema.parse({ ...base, descricao: ' Passo a passo ' }).descricao).toBe(
      'Passo a passo',
    )
  })

  it('exige título, limita descrição e tamanho do arquivo (1 byte a 25 MB)', () => {
    expect(criarDocumentoSchema.safeParse({ ...base, titulo: 'ab' }).success).toBe(false)
    expect(criarDocumentoSchema.safeParse({ ...base, descricao: 'x'.repeat(501) }).success).toBe(
      false,
    )
    expect(
      criarDocumentoSchema.safeParse({ ...base, arquivo: { ...arquivo, tamanho: 0 } }).success,
    ).toBe(false)
    expect(
      criarDocumentoSchema.safeParse({
        ...base,
        arquivo: { ...arquivo, tamanho: 25 * 1024 * 1024 + 1 },
      }).success,
    ).toBe(false)
    expect(
      criarDocumentoSchema.safeParse({
        ...base,
        arquivo: { ...arquivo, tamanho: 25 * 1024 * 1024 },
      }).success,
    ).toBe(true)
  })

  it('alcance "empresas" exige empresas; "todos" não aceita lista; campos desconhecidos são recusados', () => {
    expect(criarDocumentoSchema.safeParse({ ...base, alcance: 'empresas' }).success).toBe(false)
    expect(
      criarDocumentoSchema.safeParse({ ...base, alcance: 'empresas', empresaIds: [empresa] })
        .success,
    ).toBe(true)
    expect(criarDocumentoSchema.safeParse({ ...base, empresaIds: [empresa] }).success).toBe(false)
    expect(criarDocumentoSchema.safeParse({ ...base, estado: 'limpo' }).success).toBe(false)
  })
})

describe('editarDocumentoSchema', () => {
  it('aceita mudanças parciais; lista de empresas exige o alcance junto', () => {
    expect(editarDocumentoSchema.safeParse({ visivelNoPortal: false }).success).toBe(true)
    expect(editarDocumentoSchema.safeParse({ titulo: 'Novo título' }).success).toBe(true)
    expect(editarDocumentoSchema.safeParse({ empresaIds: [empresa] }).success).toBe(false)
    expect(
      editarDocumentoSchema.safeParse({ alcance: 'empresas', empresaIds: [empresa] }).success,
    ).toBe(true)
    expect(editarDocumentoSchema.safeParse({ alcance: 'empresas' }).success).toBe(false)
    expect(editarDocumentoSchema.safeParse({ arquivo }).success).toBe(false)
  })
})

describe('consultas', () => {
  it('têm padrões e limites', () => {
    expect(consultaDeDocumentosSchema.parse({})).toEqual({ pagina: 1, porPagina: 25 })
    expect(consultaDeDocumentosDoPortalSchema.parse({ busca: ' guia ' })).toEqual({
      busca: 'guia',
      pagina: 1,
      porPagina: 20,
    })
    expect(consultaDeDocumentosDoPortalSchema.safeParse({ porPagina: 51 }).success).toBe(false)
  })
})
