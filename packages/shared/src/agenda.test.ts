import { describe, expect, it } from 'vitest'

import {
  cancelarEventoSchema,
  consultaDeEventosDoPortalSchema,
  consultaDeEventosSchema,
  salvarEventoSchema,
} from './agenda.js'

const empresa = '0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b'
const base = {
  titulo: 'Encontro anual de clientes',
  inicioEm: '2026-11-12T21:30:00.000Z',
  fimEm: '2026-11-13T01:00:00.000Z',
  alcance: 'todos' as const,
}

describe('salvarEventoSchema', () => {
  it('aceita um evento sem limites e normaliza o que veio vazio para nulo', () => {
    const r = salvarEventoSchema.parse({ ...base, descricao: '  ', local: '', linkOnline: '' })
    expect(r).toMatchObject({
      descricao: null,
      local: null,
      linkOnline: null,
      vagasTotais: null,
      vagasPorEmpresa: null,
      prazoConfirmacao: null,
      empresaIds: [],
    })
  })

  it('o fim vem depois do início e o prazo não passa do início', () => {
    expect(salvarEventoSchema.safeParse({ ...base, fimEm: base.inicioEm }).success).toBe(false)
    expect(
      salvarEventoSchema.safeParse({ ...base, prazoConfirmacao: '2026-11-12T21:30:00.000Z' })
        .success,
    ).toBe(true)
    expect(
      salvarEventoSchema.safeParse({ ...base, prazoConfirmacao: '2026-11-12T21:30:01.000Z' })
        .success,
    ).toBe(false)
  })

  it('vagas de 1 a 100 mil; o link é http ou https', () => {
    expect(salvarEventoSchema.safeParse({ ...base, vagasTotais: 0 }).success).toBe(false)
    expect(salvarEventoSchema.safeParse({ ...base, vagasPorEmpresa: 1.5 }).success).toBe(false)
    expect(salvarEventoSchema.safeParse({ ...base, vagasTotais: 100_001 }).success).toBe(false)
    expect(
      salvarEventoSchema.safeParse({ ...base, vagasTotais: 80, vagasPorEmpresa: 2 }).success,
    ).toBe(true)
    expect(salvarEventoSchema.safeParse({ ...base, linkOnline: 'ftp://x.com' }).success).toBe(false)
    expect(
      salvarEventoSchema.safeParse({ ...base, linkOnline: 'javascript:alert(1)' }).success,
    ).toBe(false)
    expect(
      salvarEventoSchema.parse({ ...base, linkOnline: ' https://meet.exemplo.com/a ' }).linkOnline,
    ).toBe('https://meet.exemplo.com/a')
  })

  it('alcance "empresas" exige empresas; "todos" não aceita lista; campos desconhecidos são recusados', () => {
    expect(salvarEventoSchema.safeParse({ ...base, alcance: 'empresas' }).success).toBe(false)
    expect(
      salvarEventoSchema.safeParse({ ...base, alcance: 'empresas', empresaIds: [empresa] }).success,
    ).toBe(true)
    expect(salvarEventoSchema.safeParse({ ...base, empresaIds: [empresa] }).success).toBe(false)
    expect(salvarEventoSchema.safeParse({ ...base, situacao: 'publicado' }).success).toBe(false)
    expect(salvarEventoSchema.safeParse({ ...base, titulo: 'ab' }).success).toBe(false)
  })
})

describe('demais schemas', () => {
  it('cancelar exige o motivo; as consultas têm padrões e limites', () => {
    expect(cancelarEventoSchema.safeParse({ motivo: '  ' }).success).toBe(false)
    expect(cancelarEventoSchema.parse({ motivo: ' Chuva forte ' }).motivo).toBe('Chuva forte')
    expect(consultaDeEventosSchema.parse({})).toEqual({ aba: 'proximos', pagina: 1, porPagina: 25 })
    expect(consultaDeEventosSchema.safeParse({ aba: 'todos' }).success).toBe(false)
    expect(consultaDeEventosDoPortalSchema.parse({})).toEqual({
      aba: 'proximos',
      pagina: 1,
      porPagina: 20,
    })
    expect(consultaDeEventosDoPortalSchema.safeParse({ aba: 'rascunhos' }).success).toBe(false)
  })
})
