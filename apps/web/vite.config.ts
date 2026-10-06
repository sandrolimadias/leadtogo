import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// A API em desenvolvimento (docs/esteira_deploy.md, seção 9). O front chama caminhos relativos (/v1/...)
// e o Vite repassa à API: o navegador só fala com a origem do front, sem CORS nem cookie entre origens.
const API_DEV = process.env['VITE_API_PROXY'] ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [
    // o roteador gera src/routeTree.gen.ts a partir de src/routes
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    // pacotes internos do monorepo são lidos direto do código-fonte (sem build) no dev e nos testes
    conditions: ['@leadtogo/source'],
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // 0.0.0.0 para o navegador do Windows acessar o Vite rodando no WSL (docs/esteira_deploy.md, seção 9.5)
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': { target: API_DEV, changeOrigin: false },
      '/health': { target: API_DEV, changeOrigin: false },
    },
  },
  preview: { host: '0.0.0.0', port: 4173 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/testes/setup.ts'],
    css: false,
  },
})
