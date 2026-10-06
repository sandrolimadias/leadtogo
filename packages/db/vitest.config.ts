import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['@leadtogo/source'] },
  test: { include: ['src/**/*.test.ts'] },
})
