import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // SWC emite os metadados de decorators que a injeção de dependências do NestJS precisa
  plugins: [swc.vite({ module: { type: 'es6' } })],
  oxc: false,
  resolve: { conditions: ['@leadtogo/source'] },
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/testes/global-setup.ts'],
    setupFiles: ['./src/testes/setup-env.ts'],
    // Os arquivos compartilham o banco e o Valkey de teste: em sequência, o resultado é determinístico
    fileParallelism: false,
  },
})
