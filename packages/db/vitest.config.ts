import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['@leadtogo/source'] },
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/testes/global-setup.ts'],
    // Os testes compartilham o banco leadtogo_test; arquivos em sequência deixam tudo determinístico
    fileParallelism: false,
    // Os pacotes rodam em paralelo no mesmo Postgres: o mesmo tempo limite por teste da API (5b40259)
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
