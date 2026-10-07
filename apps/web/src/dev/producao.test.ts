import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { build } from 'vite'
import { describe, expect, it } from 'vitest'

describe('catálogo de componentes', () => {
  it('não entra no build de produção (só /dev/catalogo em desenvolvimento)', async () => {
    const saida = join(process.cwd(), 'dist-teste-catalogo')
    try {
      await build({
        logLevel: 'silent',
        build: { outDir: saida, emptyOutDir: true, minify: false },
      })
      const arquivos = readdirSync(join(saida, 'assets')).filter((a) => a.endsWith('.js'))
      expect(arquivos.length).toBeGreaterThan(0)
      for (const a of arquivos) {
        const js = readFileSync(join(saida, 'assets', a), 'utf8')
        expect(js, a).not.toContain('Leadtogo · Catálogo')
        expect(js, a).not.toContain('pendente (etapa')
      }
    } finally {
      rmSync(saida, { recursive: true, force: true })
    }
  }, 120_000)
})
