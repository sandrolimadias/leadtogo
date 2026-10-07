/* global document, Image */
// Confere o PWA do build de produção: manifest e ícones, service worker, "instalável" (a mesma checagem
// que o Chrome faz: Page.getInstallabilityErrors), a casca sem rede, data-density por dispositivo e
// a versão no rodapé. A API é simulada pelo Playwright.
// Uso: pnpm --filter @leadtogo/web verificar:pwa
import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..')
const VERSAO = '9.8.7-teste'
const PORTA = 4181
const origem = `http://localhost:${PORTA}`
const saida = 'dist-pwa'
const falhas = []
const confere = (condicao, mensagem) => {
  console.log(`${condicao ? '✓' : '✗'} ${mensagem}`)
  if (!condicao) falhas.push(mensagem)
}

console.log(`Build de produção (APP_VERSION=${VERSAO})...`)
const build = spawnSync('pnpm', ['exec', 'vite', 'build', '--outDir', saida], {
  cwd: raiz,
  env: { ...process.env, APP_VERSION: VERSAO },
  stdio: 'inherit',
})
if (build.status !== 0) process.exit(1)

const servidor = spawn(
  'pnpm',
  ['exec', 'vite', 'preview', '--outDir', saida, '--port', String(PORTA), '--strictPort'],
  { cwd: raiz, stdio: 'ignore' },
)
const json = (corpo, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(corpo),
})
const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const me = {
  usuario: {
    id: '0192f0a0-0000-7000-8000-000000000001',
    nome: 'Alessandro Dias',
    email: 'a@exemplo.com.br',
    emailVerificado: true,
    twoFactorEnabled: true,
  },
  empresas: [
    {
      id: A,
      razaoSocial: 'Aurora Ltda',
      nomeFantasia: 'Aurora Móveis',
      papel: 'admin',
      situacao: 'ativo',
      ativa: true,
    },
  ],
  empresaAtivaId: A,
  precisaEscolherEmpresa: false,
  administradorDeConta: false,
  doisFatoresPendente: false,
  doisFatoresObrigatorio: false,
  doisFatoresMotivo: null,
}

let navegador
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origem)).ok) break
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  navegador = await chromium.launch()
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
  })
  const page = await contexto.newPage()
  await page.route('**/v1/**', (rota) => {
    const { pathname } = new URL(rota.request().url())
    if (pathname === '/v1/me') return rota.fulfill(json(me))
    if (pathname === '/v1/me/preferencias')
      return rota.fulfill(
        json({ tema: 'sistema', menuRecolhido: false, visaoDashboard: 'minha', filtroPadrao: {} }),
      )
    return rota.fulfill(json({}))
  })
  await page.goto(origem, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()

  // manifest e ícones
  const manifestoUrl = await page.locator('link[rel="manifest"]').getAttribute('href')
  confere(Boolean(manifestoUrl), 'a página aponta para o manifest')
  const manifesto = await (await fetch(new URL(manifestoUrl ?? '', origem))).json()
  confere(
    manifesto.name === 'Leadtogo' && manifesto.short_name === 'Leadtogo',
    'manifest: nome e nome curto',
  )
  confere(
    manifesto.display === 'standalone' && manifesto.start_url === '/',
    'manifest: standalone e start_url',
  )
  confere(manifesto.lang === 'pt-BR', 'manifest: idioma pt-BR')
  confere(
    /^#[0-9a-f]{6}$/i.test(manifesto.theme_color) &&
      /^#[0-9a-f]{6}$/i.test(manifesto.background_color),
    'manifest: theme_color e background_color',
  )
  for (const [tamanho, proposito] of [
    ['192x192', 'any'],
    ['512x512', 'any'],
    ['512x512', 'maskable'],
  ]) {
    const icone = manifesto.icons.find((i) => i.sizes === tamanho && i.purpose === proposito)
    const ok = icone && icone.type === 'image/png' && (await fetch(new URL(icone.src, origem))).ok
    confere(Boolean(ok), `manifest: ícone PNG ${tamanho} (${proposito}) existe`)
    if (icone) {
      const real = await page.evaluate(
        (src) =>
          new Promise((resolver) => {
            const im = new Image()
            im.onload = () => resolver(`${im.naturalWidth}x${im.naturalHeight}`)
            im.onerror = () => resolver('erro')
            im.src = src
          }),
        icone.src,
      )
      confere(real === tamanho, `ícone ${icone.src} tem de fato ${tamanho} (tem ${real})`)
    }
  }
  confere(
    (await page.locator('link[rel="apple-touch-icon"]').count()) === 1,
    'apple-touch-icon presente',
  )
  confere(
    (await page.locator('meta[name="theme-color"]').count()) === 1,
    'meta theme-color presente',
  )

  // service worker (atualização automática: skipWaiting + clientsClaim)
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready
    // `ready` resolve quando o worker está "activating"; espera terminar de ativar
    for (let i = 0; i < 50 && r.active?.state !== 'activated'; i++)
      await new Promise((x) => setTimeout(x, 100))
    return { ativo: r.active?.state, escopo: r.scope }
  })
  confere(
    sw.ativo === 'activated' && sw.escopo === `${origem}/`,
    `service worker ativo no escopo ${sw.escopo}`,
  )
  await page.reload({ waitUntil: 'networkidle' })
  confere(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    'o service worker controla a página',
  )

  // "instalável": o mesmo teste do Chrome
  const cdp = await contexto.newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  confere(
    installabilityErrors.length === 0,
    `instalável (erros do Chrome: ${installabilityErrors.map((e) => e.errorId).join(', ') || 'nenhum'})`,
  )

  // sem rede: a casca abre pelo cache (a API não entra no cache: navigateFallbackDenylist e nenhum runtimeCaching)
  await contexto.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const casca = await page
    .getByRole('navigation', { name: 'Principal' })
    .or(page.getByRole('heading', { name: 'Entrar' }))
    .first()
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    )
  confere(casca, 'sem rede, a casca do app abre pelo cache')
  await contexto.setOffline(false)
  await page.reload({ waitUntil: 'networkidle' })

  // versão no rodapé do menu
  await page.getByRole('navigation', { name: 'Principal' }).waitFor()
  confere(
    await page.getByText(`versão ${VERSAO}`).first().isVisible(),
    `versão ${VERSAO} visível no rodapé do menu`,
  )

  // data-density por dispositivo
  const densidade = () => page.evaluate(() => document.documentElement.getAttribute('data-density'))
  confere((await densidade()) === null, 'desktop: densidade padrão')
  await page.setViewportSize({ width: 820, height: 1000 })
  await page.waitForTimeout(200)
  confere((await densidade()) === 'touch', 'tablet: densidade de toque')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(200)
  confere((await densidade()) === 'touch', 'celular: densidade de toque')
  const altura = await page
    .getByRole('button', { name: 'Buscar' })
    .evaluate((el) => el.getBoundingClientRect().height)
  confere(altura >= 44, `celular: alvo de toque de ${Math.round(altura)} px (mínimo 44)`)
} finally {
  await navegador?.close()
  servidor.kill()
  rmSync(join(raiz, saida), { recursive: true, force: true })
}
if (falhas.length > 0) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`)
  process.exit(1)
}
console.log('\nPWA OK.')
