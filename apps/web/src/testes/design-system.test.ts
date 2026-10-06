import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  arquivosDoDesignSystem,
  destino,
  origem,
  sincronizar,
} from '../../scripts/sincronizar-design-system.mjs'

describe('sincronizar-design-system (fonte única em docs/design-system/)', () => {
  it('copia tokens, tema do Tailwind e as fontes, byte a byte', () => {
    const copiados = sincronizar()
    expect(copiados).toEqual(expect.arrayContaining(['tokens.css', 'tailwind-theme.css']))
    expect(copiados.filter((a) => a.endsWith('.woff2')).length).toBeGreaterThanOrEqual(3)
    for (const arquivo of arquivosDoDesignSystem()) {
      expect(readFileSync(join(destino, arquivo)).equals(readFileSync(join(origem, arquivo)))).toBe(
        true,
      )
    }
  })

  it('o tokens.css aponta para fontes locais (sem CDN)', () => {
    const css = readFileSync(join(destino, 'tokens.css'), 'utf8')
    expect(css).toMatch(/url\("fonts\/InstrumentSans-Variable-latin\.woff2"\)/)
    expect(css).not.toMatch(/https?:\/\//)
  })
})
