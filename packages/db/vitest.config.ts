import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['@leadtogo/source'] },
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/testes/global-setup.ts'],
    // Os testes compartilham o banco leadtogo_test; arquivos em sequência deixam tudo determinístico
    fileParallelism: false,
    // O turbo roda os testes de todos os pacotes juntos, no mesmo Postgres: as sementes de referência
    // (milhares de linhas, duas vezes) passam de 5 s quando a máquina está ocupada
    testTimeout: 30_000,
  },
})
