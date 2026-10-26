import { describe, expect, it } from 'vitest'

import {
  consultaDeBuscaDoPortalSchema,
  criarAvisoSchema,
  inscreverPushSchema,
  salvarPreferenciasDoPortalSchema,
} from './avisos.js'

const base = { mensagem: 'Expediente encerra às 14h', alcance: 'todos' as const }

describe('criarAvisoSchema', () => {
  it('aceita o aviso simples: normal, sem link, para agora', () => {
    const r = criarAvisoSchema.parse(base)
    expect(r).toMatchObject({ urgencia: 'normal', link: null, enviarEm: null, empresaIds: [] })
  })

  it('limita a mensagem a 140 caracteres e recusa vazia', () => {
    expect(criarAvisoSchema.safeParse({ ...base, mensagem: 'x'.repeat(140) }).success).toBe(true)
    expect(criarAvisoSchema.safeParse({ ...base, mensagem: 'x'.repeat(141) }).success).toBe(false)
    expect(criarAvisoSchema.safeParse({ ...base, mensagem: '   ' }).success).toBe(false)
  })

  it('o link é um caminho do portal ou http(s), nunca // nem javascript:', () => {
    for (const ok of ['/agenda', '/chamados/abc', 'https://exemplo.com.br/x']) {
      expect(criarAvisoSchema.safeParse({ ...base, link: ok }).success).toBe(true)
    }
    for (const ruim of ['//evil.com', 'javascript:alert(1)', 'agenda', 'ftp://x.com']) {
      expect(criarAvisoSchema.safeParse({ ...base, link: ruim }).success).toBe(false)
    }
  })

  it('alcance "empresas" exige a lista e "todos" não aceita lista', () => {
    expect(criarAvisoSchema.safeParse({ ...base, alcance: 'empresas' }).success).toBe(false)
    expect(
      criarAvisoSchema.safeParse({
        ...base,
        alcance: 'empresas',
        empresaIds: ['0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b'],
      }).success,
    ).toBe(true)
    expect(
      criarAvisoSchema.safeParse({
        ...base,
        empresaIds: ['0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b'],
      }).success,
    ).toBe(false)
  })
})

describe('salvarPreferenciasDoPortalSchema', () => {
  const prefs = {
    silencioInicio: null,
    silencioFim: null,
    emailChamados: true,
    emailEventos: true,
    emailAvisos: false,
  }
  it('aceita sem silêncio e com silêncio atravessando a meia-noite', () => {
    expect(salvarPreferenciasDoPortalSchema.safeParse(prefs).success).toBe(true)
    expect(
      salvarPreferenciasDoPortalSchema.safeParse({
        ...prefs,
        silencioInicio: '22:00',
        silencioFim: '07:00',
      }).success,
    ).toBe(true)
  })
  it('recusa só um dos horários, horários iguais e formato inválido', () => {
    expect(
      salvarPreferenciasDoPortalSchema.safeParse({ ...prefs, silencioInicio: '22:00' }).success,
    ).toBe(false)
    expect(
      salvarPreferenciasDoPortalSchema.safeParse({
        ...prefs,
        silencioInicio: '22:00',
        silencioFim: '22:00',
      }).success,
    ).toBe(false)
    expect(
      salvarPreferenciasDoPortalSchema.safeParse({
        ...prefs,
        silencioInicio: '25:00',
        silencioFim: '07:00',
      }).success,
    ).toBe(false)
  })
})

describe('push e busca', () => {
  it('a inscrição exige endereço https e as duas chaves', () => {
    expect(
      inscreverPushSchema.safeParse({
        endpoint: 'https://push.exemplo.com/abc',
        keys: { p256dh: 'k', auth: 'a' },
      }).success,
    ).toBe(true)
    expect(
      inscreverPushSchema.safeParse({
        endpoint: 'https://push.exemplo.com/abc',
        keys: { p256dh: 'k' },
      }).success,
    ).toBe(false)
  })
  it('a busca pede ao menos 2 letras e corta os espaços', () => {
    expect(consultaDeBuscaDoPortalSchema.safeParse({ q: 'a' }).success).toBe(false)
    expect(consultaDeBuscaDoPortalSchema.parse({ q: '  nota fiscal ' }).q).toBe('nota fiscal')
  })
})
