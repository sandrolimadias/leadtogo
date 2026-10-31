import { describe, expect, it } from 'vitest'

import { atribuicaoDoMapa, CREDITO_DO_MAPLIBRE } from './atribuicao'
import { ATRIBUICAO_DO_MAPA_BASE } from './estilo'

describe('créditos do mapa', () => {
  it('sem fonte dos dados, só o crédito do MapLibre (o do mapa base o MapLibre acrescenta)', () => {
    expect(atribuicaoDoMapa()).toBe(CREDITO_DO_MAPLIBRE)
  })
  it('com fonte, ela vem no fim do crédito, logo antes do "© OpenStreetMap contributors"', () => {
    const credito = atribuicaoDoMapa('Fonte: IBGE – CNEFE 2022')
    expect(credito).toBe(`${CREDITO_DO_MAPLIBRE} | Fonte: IBGE – CNEFE 2022`)
    // o MapLibre ordena os créditos pelo tamanho: o nosso precisa ser mais curto que o do mapa base
    expect(credito.length).toBeLessThan(ATRIBUICAO_DO_MAPA_BASE.length)
  })
  it('a fonte é texto, não HTML', () => {
    expect(atribuicaoDoMapa('<b>x</b> & y')).toBe(
      `${CREDITO_DO_MAPLIBRE} | &lt;b&gt;x&lt;/b&gt; &amp; y`,
    )
  })
})
