import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// A API em desenvolvimento. O portal chama caminhos relativos (/v1/portal/...) e o Vite repassa à API: o
// navegador só fala com a origem do portal (sem CORS), como o CRM (docs/plano_portal_cliente.md, seção 3).
const API_DEV = process.env['VITE_API_PROXY'] ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [
    // o roteador gera src/routeTree.gen.ts a partir de src/routes
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env['APP_VERSION'] ?? 'dev'),
  },
  resolve: {
    // pacotes internos do monorepo são lidos direto do código-fonte (sem build) no dev e nos testes
    conditions: ['@leadtogo/source'],
    alias: [{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }],
  },
  // O PORTAL_URL da API em desenvolvimento é http://localhost:5174 (a origem que a API confere nas alterações)
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: { '/v1': { target: API_DEV, changeOrigin: false } },
  },
  preview: { host: '0.0.0.0', port: 4174 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/testes/setup.ts'],
    css: false,
    maxWorkers: 2,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
