import { describe, expect, it } from 'vitest'

import {
  bloquearComentariosSchema,
  comentarNoPortalSchema,
  consultaDoFeedSchema,
  consultaDePublicacoesSchema,
  denunciarNoPortalSchema,
  marcarLeiturasSchema,
  moderarComentarioSchema,
  reagirNoPortalSchema,
  salvarPublicacaoSchema,
} from './publicacoes.js'

const empresa = '0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b'
const base = {
  titulo: 'Expediente reduzido',
  corpo: 'Na **sexta** fechamos às 14h.',
  alcance: 'todos' as const,
  situacao: 'rascunho' as const,
}

describe('salvarPublicacaoSchema', () => {
  it('aceita rascunho para todos, com os padrões', () => {
    const r = salvarPublicacaoSchema.parse(base)
    expect(r.empresaIds).toEqual([])
    expect(r.agendadaPara).toBeNull()
  })

  it('apara título e corpo e recusa vazios ou longos demais', () => {
    expect(salvarPublicacaoSchema.parse({ ...base, titulo: '  Aviso  ' }).titulo).toBe('Aviso')
    expect(salvarPublicacaoSchema.safeParse({ ...base, titulo: 'ab' }).success).toBe(false)
    expect(salvarPublicacaoSchema.safeParse({ ...base, titulo: 'x'.repeat(161) }).success).toBe(
      false,
    )
    expect(salvarPublicacaoSchema.safeParse({ ...base, corpo: '   ' }).success).toBe(false)
    expect(salvarPublicacaoSchema.safeParse({ ...base, corpo: 'x'.repeat(10_001) }).success).toBe(
      false,
    )
  })

  it('alcance "empresas" exige ao menos uma empresa; "todos" não aceita lista', () => {
    expect(salvarPublicacaoSchema.safeParse({ ...base, alcance: 'empresas' }).success).toBe(false)
    expect(
      salvarPublicacaoSchema.safeParse({ ...base, alcance: 'empresas', empresaIds: [empresa] })
        .success,
    ).toBe(true)
    expect(salvarPublicacaoSchema.safeParse({ ...base, empresaIds: [empresa] }).success).toBe(false)
  })

  it('agendar exige a data; a data só vale ao agendar', () => {
    expect(salvarPublicacaoSchema.safeParse({ ...base, situacao: 'agendada' }).success).toBe(false)
    expect(
      salvarPublicacaoSchema.safeParse({
        ...base,
        situacao: 'agendada',
        agendadaPara: '2026-11-01T08:00:00-03:00',
      }).success,
    ).toBe(true)
    expect(
      salvarPublicacaoSchema.safeParse({ ...base, agendadaPara: '2026-11-01T08:00:00-03:00' })
        .success,
    ).toBe(false)
  })

  it('não aceita campos desconhecidos', () => {
    expect(salvarPublicacaoSchema.safeParse({ ...base, fixada: true }).success).toBe(false)
  })
})

describe('consultas', () => {
  it('lista da equipe e feed do cliente têm padrões e limites', () => {
    expect(consultaDePublicacoesSchema.parse({})).toEqual({
      aba: 'todas',
      pagina: 1,
      porPagina: 25,
    })
    expect(consultaDePublicacoesSchema.safeParse({ aba: 'x' }).success).toBe(false)
    expect(consultaDoFeedSchema.parse({})).toEqual({ pagina: 1, porPagina: 10 })
    expect(consultaDoFeedSchema.safeParse({ porPagina: 51 }).success).toBe(false)
  })
})

describe('moderação, comentários e reações', () => {
  it('ocultar exige o motivo; manter e reexibir não', () => {
    expect(moderarComentarioSchema.safeParse({ acao: 'ocultar' }).success).toBe(false)
    expect(
      moderarComentarioSchema.safeParse({ acao: 'ocultar', motivo: 'Propaganda' }).success,
    ).toBe(true)
    expect(moderarComentarioSchema.safeParse({ acao: 'manter' }).success).toBe(true)
    expect(moderarComentarioSchema.safeParse({ acao: 'reexibir' }).success).toBe(true)
    expect(moderarComentarioSchema.safeParse({ acao: 'apagar' }).success).toBe(false)
  })

  it('o comentário é texto puro de 1 a 1000 caracteres', () => {
    expect(comentarNoPortalSchema.parse({ corpo: '  Ótimo!  ' }).corpo).toBe('Ótimo!')
    expect(comentarNoPortalSchema.safeParse({ corpo: '   ' }).success).toBe(false)
    expect(comentarNoPortalSchema.safeParse({ corpo: 'x'.repeat(1001) }).success).toBe(false)
    expect(comentarNoPortalSchema.safeParse({ corpo: 'oi', autorNome: 'Falso' }).success).toBe(
      false,
    )
  })

  it('reação, denúncia, bloqueio e leituras só aceitam os valores previstos', () => {
    expect(reagirNoPortalSchema.safeParse({ tipo: 'parabens' }).success).toBe(true)
    expect(reagirNoPortalSchema.safeParse({ tipo: 'amei' }).success).toBe(false)
    expect(denunciarNoPortalSchema.safeParse({ motivo: 'spam' }).success).toBe(true)
    expect(denunciarNoPortalSchema.safeParse({ motivo: 'golpe' }).success).toBe(false)
    expect(bloquearComentariosSchema.safeParse({ bloqueados: true }).success).toBe(true)
    expect(marcarLeiturasSchema.safeParse({ ids: [] }).success).toBe(false)
    expect(marcarLeiturasSchema.safeParse({ ids: [empresa] }).success).toBe(true)
    expect(marcarLeiturasSchema.safeParse({ ids: Array(51).fill(empresa) }).success).toBe(false)
  })
})
