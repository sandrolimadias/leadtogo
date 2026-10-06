import { describe, expect, it } from 'vitest'

import {
  aplicarPatch,
  lerPreferencias,
  PREFERENCIAS_PADRAO,
  preferenciasPatchSchema,
  preferenciasSchema,
} from './preferencias.js'

const F1 = '01a111e8-f08a-70b7-b5f3-52998ced0a3d'
const F2 = '01a111e8-f08a-70b7-b5f3-52998ced0a3e'

describe('preferências do membro', () => {
  it('lê vazio, lixo e chaves antigas como os padrões', () => {
    expect(lerPreferencias({})).toEqual(PREFERENCIAS_PADRAO)
    expect(lerPreferencias(null)).toEqual(PREFERENCIAS_PADRAO)
    expect(lerPreferencias('texto')).toEqual(PREFERENCIAS_PADRAO)
    expect(lerPreferencias({ tema: 'roxo' })).toEqual(PREFERENCIAS_PADRAO)
    expect(lerPreferencias([1, 2])).toEqual(PREFERENCIAS_PADRAO)
  })

  it('lê o que está guardado e completa o resto com o padrão', () => {
    expect(lerPreferencias({ tema: 'escuro', filtroPadrao: { empresas: F1 } })).toEqual({
      ...PREFERENCIAS_PADRAO,
      tema: 'escuro',
      filtroPadrao: { empresas: F1 },
    })
  })

  it('descarta só o que está ruim: valor inválido ou chave antiga não leva as válidas junto', () => {
    expect(
      lerPreferencias({
        tema: 'escuro',
        antiga: 1,
        menuRecolhido: 'talvez',
        visaoDashboard: 'equipe',
      }),
    ).toEqual({
      ...PREFERENCIAS_PADRAO,
      tema: 'escuro',
      visaoDashboard: 'equipe',
    })
    expect(
      lerPreferencias({ filtroPadrao: { empresas: F1, contatos: 'lixo', outra: F2 } }).filtroPadrao,
    ).toEqual({ empresas: F1 })
  })

  it('o schema é fechado: recusa chave desconhecida, valor fora da lista e uuid inválido', () => {
    expect(preferenciasSchema.safeParse({ ...PREFERENCIAS_PADRAO, papel: 'admin' }).success).toBe(
      false,
    )
    expect(preferenciasPatchSchema.safeParse({ tema: 'roxo' }).success).toBe(false)
    expect(preferenciasPatchSchema.safeParse({ menuRecolhido: 'sim' }).success).toBe(false)
    expect(preferenciasPatchSchema.safeParse({ filtroPadrao: { outra: F1 } }).success).toBe(false)
    expect(preferenciasPatchSchema.safeParse({ filtroPadrao: { empresas: 'abc' } }).success).toBe(
      false,
    )
    expect(preferenciasPatchSchema.safeParse({ papel: 'admin' }).success).toBe(false)
    expect(preferenciasPatchSchema.safeParse({}).success).toBe(true)
  })

  it('o patch muda só o que veio, remove com null e mescla filtroPadrao por tela', () => {
    let guardado = aplicarPatch({}, { tema: 'escuro', menuRecolhido: true })
    expect(guardado).toEqual({ tema: 'escuro', menuRecolhido: true })
    guardado = aplicarPatch(guardado, { visaoDashboard: 'equipe', filtroPadrao: { empresas: F1 } })
    expect(guardado).toEqual({
      tema: 'escuro',
      menuRecolhido: true,
      visaoDashboard: 'equipe',
      filtroPadrao: { empresas: F1 },
    })
    guardado = aplicarPatch(guardado, { filtroPadrao: { contatos: F2 } })
    expect(guardado.filtroPadrao).toEqual({ empresas: F1, contatos: F2 }) // mescla por tela
    guardado = aplicarPatch(guardado, { tema: null, filtroPadrao: { empresas: null } })
    expect(guardado).toEqual({
      menuRecolhido: true,
      visaoDashboard: 'equipe',
      filtroPadrao: { contatos: F2 },
    })
    guardado = aplicarPatch(guardado, { filtroPadrao: { contatos: null } })
    expect(guardado.filtroPadrao).toBeUndefined() // sem filtros, a chave some
    expect(aplicarPatch({ tema: 'claro' }, {})).toEqual({ tema: 'claro' })
  })
})
