import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// A API em desenvolvimento (docs/esteira_deploy.md, seção 9). O front chama caminhos relativos (/v1/...)
// e o Vite repassa à API: o navegador só fala com a origem do front, sem CORS nem cookie entre origens.
const API_DEV = process.env['VITE_API_PROXY'] ?? 'http://localhost:3000'

// Source maps para o GlitchTip (docs/esteira_deploy.md): SÓ quando o CI fornece SENTRY_AUTH_TOKEN. Os mapas saem
// "hidden" (sem o comentário sourceMappingURL), recebem debug IDs, sobem para o GlitchTip e são apagados do dist
// (filesToDeleteAfterUpload; o Dockerfile apaga o que sobrar). Sem o token não há mapa nenhum.
const SENTRY_AUTH_TOKEN = process.env['SENTRY_AUTH_TOKEN']

export default defineConfig(({ command }) => ({
  plugins: [
    // o roteador gera src/routeTree.gen.ts a partir de src/routes
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // PWA só no build (instalável, atualiza sozinho). A API (/v1) nunca é interceptada nem guardada em cache.
    ...(command === 'build'
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
            manifest: {
              name: 'Leadtogo',
              short_name: 'Leadtogo',
              description:
                'CRM de gestão de carteira: quem atender agora e o que fazer em seguida.',
              lang: 'pt-BR',
              id: '/',
              start_url: '/',
              scope: '/',
              display: 'standalone',
              orientation: 'any',
              theme_color: '#0b5f70',
              background_color: '#f5f7f7',
              icons: [
                { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                {
                  src: '/icons/icon-maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              navigateFallback: '/index.html',
              navigateFallbackDenylist: [/^\/v1\//, /^\/health/, /^\/docs/],
              // o service worker não precisa de mapa (e o dist não pode ter .map fora do upload ao GlitchTip)
              sourcemap: false,
              cleanupOutdatedCaches: true,
              clientsClaim: true,
              skipWaiting: true,
            },
          }),
        ]
      : []),
    // Por último: injeta os debug IDs nos arquivos finais e envia os mapas
    ...(command === 'build' && SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            authToken: SENTRY_AUTH_TOKEN,
            url: process.env['SENTRY_URL'] || undefined,
            org: process.env['SENTRY_ORG'] || undefined,
            project: process.env['SENTRY_PROJECT'] || 'leadtogo-web',
            release: { name: process.env['APP_VERSION'] ?? 'dev' },
            sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
            telemetry: false,
            // GlitchTip fora do ar não pode impedir o deploy do app: avisa e segue (o Dockerfile apaga os mapas)
            errorHandler: (erro) =>
              console.warn(`[sentry] upload dos source maps falhou: ${erro.message}`),
          }),
        ]
      : []),
  ],
  build: { sourcemap: SENTRY_AUTH_TOKEN ? 'hidden' : false },
  // a versão (APP_VERSION do ambiente do build) aparece no rodapé do app
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env['APP_VERSION'] ?? 'dev'),
  },
  resolve: {
    // pacotes internos do monorepo são lidos direto do código-fonte (sem build) no dev e nos testes
    conditions: ['@leadtogo/source'],
    alias: [
      // o catálogo de componentes só existe em desenvolvimento: no build vira um módulo vazio
      ...(command === 'build'
        ? [
            {
              find: '@/dev/catalogo',
              replacement: fileURLToPath(new URL('./src/dev/catalogo.stub.tsx', import.meta.url)),
            },
          ]
        : []),
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
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
    // Menos arquivos de teste ao mesmo tempo: os fluxos (roteador + Radix) são pesados e ficavam lentos
    // quando a máquina está ocupada
    maxWorkers: 2,
  },
}))
