import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

// E2E contra a API, o worker, o banco, o Valkey e o Mailpit REAIS (docker compose do desenvolvimento).
// Sobe a própria API (:3100), o worker e o Vite (:5183), separados do `pnpm dev`, para poder rodar
// com ele ligado. Usa o banco de desenvolvimento com e-mails únicos e o Valkey 2 (rate limits à parte).
// Rodar: pnpm --filter @leadtogo/web e2e   (antes: pnpm dev:up e pnpm db:migrate)
const raiz = join(import.meta.dirname, '../..')
try {
  process.loadEnvFile(join(raiz, '.env'))
} catch {
  // sem .env (CI): as variáveis já vêm do ambiente
}

export const PORTA_API = 3100
export const PORTA_WEB = 5183
export const URL_WEB = `http://localhost:${PORTA_WEB}`
export const URL_API = `http://localhost:${PORTA_API}`
export const REDIS_E2E =
  (process.env['REDIS_URL'] ?? 'redis://localhost:6379').replace(/\/\d*$/, '') + '/2'

const ambienteDaApi = {
  ...process.env,
  NODE_ENV: 'development',
  APP_URL: URL_WEB,
  API_URL: URL_API,
  PORT: String(PORTA_API),
  REDIS_URL: REDIS_E2E,
  LOG_LEVEL: 'warn',
  PRIMEIRO_ACESSO: 'aberto',
  VERIFICACAO_EMAIL: 'false',
  OUTBOX_INTERVALO_MS: '200',
  EMAIL_ESPERA_MS: '100',
  WORKER_SAUDE_PORTA: '3101',
  FILA_PREFIXO: 'leadtogo:e2e',
} as Record<string, string>

const api = join(raiz, 'apps/api')

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: URL_WEB, locale: 'pt-BR', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `pnpm --filter @leadtogo/shared build && pnpm --filter @leadtogo/api build && node --enable-source-maps dist/main.js`,
      cwd: api,
      env: ambienteDaApi,
      url: `${URL_API}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'node --enable-source-maps dist/worker.js',
      cwd: api,
      env: ambienteDaApi,
      url: 'http://127.0.0.1:3101/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --port ${PORTA_WEB} --strictPort`,
      cwd: import.meta.dirname,
      env: { ...process.env, VITE_API_PROXY: URL_API },
      url: `${URL_WEB}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
