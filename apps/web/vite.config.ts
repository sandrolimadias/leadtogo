import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // pacotes internos do monorepo são lidos direto do código-fonte (sem build) no dev e nos testes
  resolve: { conditions: ['@leadtogo/source'] },
  // 0.0.0.0 para o navegador do Windows acessar o Vite rodando no WSL (docs/esteira_deploy.md, seção 9.5)
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
