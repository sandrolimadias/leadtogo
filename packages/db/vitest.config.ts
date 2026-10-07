import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['@leadtogo/source'] },
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/testes/global-setup.ts'],
    // Os testes compartilham o banco leadtogo_test; arquivos em sequência deixam tudo determinístico
    fileParallelism: false,
  },
})
